const { getClient } = require('../config/database');
const { resolveStepUpContext } = require('../middleware/stepUp');
const { createHash } = require('node:crypto');
const { scanCredential } = require('../utils/credentialScan');
const { requirementForRole, validateSubmission, credentialDto, dateOnly, futureExpiry, shortText, invalid } = require('../utils/accountCredentials');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METADATA = `user_id, kind, document_type, document_label, license_number, id_last4, expires_at,
  status, revision, submitted_at, reviewed_at, review_notes, file_name, mime_type,
  scan_status, scan_revision, scan_started_at, scanned_at, scan_result, verification_method,
  (scan_started_at > NOW() - INTERVAL '90 seconds' AND scan_started_at <= NOW() + INTERVAL '5 seconds') AS scan_lease_active,
  (octet_length(document_bytes) > 0) AS has_document`;
const privateResponse = (res) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); };
function authorize(req, res, admin = false, stepUp = false) {
  if (!req.user?.id || !UUID.test(req.user.id)) { res.status(401).json({ success: false, message: 'Sign in to manage your credentials.' }); return false; }
  if (admin && req.user.role !== 'admin') { res.status(403).json({ success: false, message: 'Only an administrator can review user credentials.' }); return false; }
  if (stepUp) {
    try { resolveStepUpContext(req, 'license-change'); } catch { res.status(403).json({ success: false, code: 'STEP_UP_REQUIRED', message: 'Additional account verification is required before reviewing credentials.' }); return false; }
  }
  return true;
}
function targetId(req, admin) {
  const id = admin ? req.params?.userId : req.user.id;
  if (!UUID.test(id || '')) throw invalid('User not found.', 404);
  return id;
}
const findUser = async (client, id, lock = false) => {
  const result = await client.query(`SELECT id, role, is_active FROM users WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!result.rows[0]) throw invalid('User not found.', 404);
  return result.rows[0];
};
const findCredential = async (client, id, lock = false) => {
  const result = await client.query(`SELECT ${METADATA} FROM account_credentials WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  return result.rows[0] || null;
};
const audit = (client, req, userId, action, details) => client.query(
  `INSERT INTO security_audit (staff_id, action_performed, entity_type, entity_id, device_ip,
   auth_method, credential_strength, request_id, details)
   VALUES (NULL, $1, 'account_credential', $2, $3, $4, $5, $6, $7::jsonb)`,
  [action, userId, req.ip || null, req.stepUp?.authMethod || 'Password', req.stepUp?.credentialStrength || 'Base', req.requestId || null,
    JSON.stringify({ actorId: req.user.id, ...details })]
);
function fail(res, next, error) {
  if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, ...(error.code ? { code: error.code } : {}) });
  return next(error);
}
function get(admin) {
  return async (req, res, next) => {
    privateResponse(res);
    if (!authorize(req, res, admin)) return;
    let client;
    try {
      const id = targetId(req, admin); client = await getClient();
      const user = await findUser(client, id);
      const credential = await findCredential(client, id);
      return res.json({ success: true, data: { requirement: requirementForRole(user.role), credential: credentialDto(credential) } });
    } catch (error) { return fail(res, next, error); } finally { client?.release(); }
  };
}
function submit(admin) {
  return async (req, res, next) => {
    privateResponse(res);
    if (!authorize(req, res, admin, admin)) return;
    let client, begun = false;
    try {
      const id = targetId(req, admin); client = await getClient();
      await client.query('BEGIN'); begun = true;
      const user = await findUser(client, id, true);
      const value = validateSubmission(user.role, req.body);
      const result = await client.query(
        `INSERT INTO account_credentials (user_id, kind, document_type, document_label, license_number, id_last4,
         expires_at, status, revision, document_bytes, file_name, mime_type, submitted_at, submitted_by, updated_at, document_sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 1, $8, $9, $10, NOW(), $11, NOW(), $12)
         ON CONFLICT (user_id) DO UPDATE SET kind = EXCLUDED.kind, document_type = EXCLUDED.document_type,
         document_label = EXCLUDED.document_label, license_number = EXCLUDED.license_number, id_last4 = EXCLUDED.id_last4,
         expires_at = EXCLUDED.expires_at, status = 'pending', revision = account_credentials.revision + 1,
         document_bytes = EXCLUDED.document_bytes, file_name = EXCLUDED.file_name, mime_type = EXCLUDED.mime_type,
         submitted_at = NOW(), submitted_by = EXCLUDED.submitted_by, reviewed_at = NULL, reviewed_by = NULL,
         review_notes = NULL, verification_method = NULL, verification_confirmed_at = NULL,
         scan_status = 'not_scanned', scan_revision = NULL, scan_token = NULL, scan_started_at = NULL,
         scanned_at = NULL, scan_result = NULL, document_sha256 = EXCLUDED.document_sha256,
         updated_at = NOW() RETURNING ${METADATA}`,
        [id, value.kind, value.documentType, value.documentLabel, value.licenseNumber, value.idLast4, value.expiresAt,
          value.bytes, value.fileName, value.mimeType, req.user.id, createHash('sha256').update(value.bytes).digest('hex')]
      );
      if (value.kind === 'professional_license') {
        await client.query(`INSERT INTO staff_registry (user_id, professional_title, license_number, license_type, license_status, credential_expires_at)
          VALUES ($1, $2, $3, 'PRC / professional license', 'pending', $4)
          ON CONFLICT (user_id) DO UPDATE SET license_number = EXCLUDED.license_number, license_type = EXCLUDED.license_type,
          license_status = 'pending', credential_expires_at = EXCLUDED.credential_expires_at,
          verified_at = NULL, verified_by = NULL, updated_at = NOW()`, [id, user.role, value.licenseNumber, value.expiresAt]);
      }
      await audit(client, req, id, 'CREDENTIAL_SUBMITTED', { kind: value.kind, revision: Number(result.rows[0].revision) });
      await client.query('COMMIT'); begun = false;
      // OCR must not occupy a pooled DB connection. A failed scan never loses
      // the saved pending submission or pretends the identity is verified.
      client.release(); client = null;
      let saved = result.rows[0];
      try {
        await scanCredential({ userId: id, revision: Number(saved.revision), actorId: req.user.id });
        client = await getClient(); saved = await findCredential(client, id) || saved;
      } catch { /* The pending receipt remains truthful if OCR is unavailable. */ }
      return res.status(201).json({ success: true, data: { requirement: value.kind, credential: credentialDto(saved) } });
    } catch (error) { if (begun) await client.query('ROLLBACK'); return fail(res, next, error); } finally { client?.release(); }
  };
}

const reviewForUser = async (req, res, next) => {
  privateResponse(res);
  if (!authorize(req, res, true, true)) return;
  let client, begun = false;
  try {
    const id = targetId(req, true);
    if (id === req.user.id) throw invalid('An administrator cannot review their own credential.', 403);
    const { status, revision } = req.body || {};
    if (!['verified', 'rejected'].includes(status) || !Number.isSafeInteger(revision) || revision < 1) throw invalid('Choose a review decision and include the current submission revision.');
    const reviewNotes = shortText(req.body.reviewNotes, 2000, 'review notes', true);
    client = await getClient(); await client.query('BEGIN'); begun = true;
    const user = await findUser(client, id, true);
    const current = await findCredential(client, id, true);
    const requirement = requirementForRole(user.role);
    if (!current) throw invalid('No credential submission is available for review.', 404);
    if (current.revision !== revision || current.status !== 'pending') throw invalid('This submission changed or was already reviewed. Refresh before reviewing.', 409, 'CREDENTIAL_REVISION_CONFLICT');
    if (requirement === 'none' || current.kind !== requirement || !current.has_document) throw invalid('This submission does not match the current account credential requirement.', 409, 'CREDENTIAL_ROLE_MISMATCH');
    let verificationMethod = null;
    if (status === 'verified') {
      if (!['completed', 'unreadable', 'unavailable', 'failed'].includes(current.scan_status)
          || Number(current.scan_revision) !== revision || !current.scanned_at
          || Date.now() - new Date(current.scanned_at).getTime() > 30 * 60 * 1000) {
        throw invalid('Run a current automated check before reviewing this ID.', 409, 'CREDENTIAL_SCAN_REQUIRED');
      }
      verificationMethod = req.body.verificationMethod;
      if (!['issuer_check', 'in_person_original'].includes(verificationMethod) || req.body.officialCheckConfirmed !== true) {
        throw invalid('Confirm that the issuing authority or original ID was checked before verification.', 400, 'CREDENTIAL_AUTHENTICITY_CONFIRMATION_REQUIRED');
      }
      if ((current.scan_status !== 'completed' || current.scan_result?.outcome !== 'ready_for_review') && req.body.acknowledgeScanFlags !== true) {
        throw invalid('Review and acknowledge the scan concerns before verifying this ID.', 400, 'CREDENTIAL_SCAN_CONCERNS_REQUIRED');
      }
    }
    if (status === 'verified' && current.expires_at) futureExpiry(dateOnly(current.expires_at), requirement === 'professional_license');
    if (status === 'verified' && requirement === 'professional_license' && (!current.license_number || !current.expires_at)) throw invalid('A professional license number and future expiry date are required before verification.');
    const result = await client.query(`UPDATE account_credentials SET status = $2, reviewed_at = NOW(), reviewed_by = $3,
      review_notes = $4, verification_method = $5,
      verification_confirmed_at = CASE WHEN $5::text IS NOT NULL THEN NOW() ELSE NULL END,
      updated_at = NOW() WHERE user_id = $1 RETURNING ${METADATA}`, [id, status, req.user.id, reviewNotes, verificationMethod]);
    if (requirement === 'professional_license') {
      const staff = await client.query(`INSERT INTO staff_registry (user_id, professional_title, license_number, license_type, license_status,
        credential_expires_at, verified_by, verified_at, last_reviewed_at)
        VALUES ($1, $2, $3, 'PRC / professional license', $4::varchar(20), $5, $6, CASE WHEN $4::varchar(20) = 'verified' THEN NOW() ELSE NULL END, NOW())
        ON CONFLICT (user_id) DO UPDATE SET license_number = EXCLUDED.license_number, license_type = EXCLUDED.license_type,
        license_status = EXCLUDED.license_status, credential_expires_at = EXCLUDED.credential_expires_at,
        verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at, last_reviewed_at = NOW(), updated_at = NOW()
        RETURNING id`, [id, user.role, current.license_number, status === 'verified' ? 'verified' : 'pending', current.expires_at, status === 'verified' ? req.user.id : null]);
      await client.query(`INSERT INTO license_verification_events (staff_id, event_type, previous_status, next_status, notes, performed_by)
        VALUES ($1, $2, 'pending', $3, $4, $5)`, [staff.rows[0].id, status === 'verified' ? 'verified' : 'note_added', status === 'verified' ? 'verified' : 'pending', reviewNotes, req.user.id]);
    }
    await audit(client, req, id, status === 'verified' ? 'CREDENTIAL_VERIFIED' : 'CREDENTIAL_REJECTED', { kind: current.kind, revision, verificationMethod });
    await client.query('COMMIT'); begun = false;
    return res.json({ success: true, data: { requirement, credential: credentialDto(result.rows[0]) } });
  } catch (error) { if (begun) await client.query('ROLLBACK'); return fail(res, next, error); } finally { client?.release(); }
};

function scan(admin) {
  return async (req, res, next) => {
    privateResponse(res);
    if (!authorize(req, res, admin, admin)) return;
    let client;
    try {
      const id = targetId(req, admin), revision = req.body?.revision;
      if (!Number.isSafeInteger(revision) || revision < 1) throw invalid('Include the current ID submission revision.');
      const receipt = await scanCredential({ userId: id, revision, actorId: req.user.id });
      if (receipt.outcome === 'stale') throw invalid('The ID or account details changed. Refresh before scanning again.', 409, 'CREDENTIAL_REVISION_CONFLICT');
      client = await getClient(); const user = await findUser(client, id); const credential = await findCredential(client, id);
      return res.json({ success: true, data: { requirement: requirementForRole(user.role), credential: credentialDto(credential) } });
    } catch (error) { return fail(res, next, error); } finally { client?.release(); }
  };
}

function download(admin) {
  return async (req, res, next) => {
    privateResponse(res);
    if (!authorize(req, res, admin)) return;
    let client;
    try {
      const id = targetId(req, admin); client = await getClient();
      await findUser(client, id);
      const result = await client.query('SELECT document_bytes, mime_type FROM account_credentials WHERE user_id = $1', [id]);
      const row = result.rows[0];
      if (!row?.document_bytes?.length) throw invalid('No credential document is available.', 404);
      const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
      if (!extensions[row.mime_type]) throw invalid('This credential document is unavailable.', 404);
      await audit(client, req, id, 'CREDENTIAL_DOCUMENT_VIEWED', {});
      res.set('Content-Type', row.mime_type);
      res.set('Content-Disposition', `attachment; filename="credential-document.${extensions[row.mime_type]}"`);
      res.set('Content-Security-Policy', "default-src 'none'; sandbox");
      return res.send(row.document_bytes);
    } catch (error) { return fail(res, next, error); } finally { client?.release(); }
  };
}

module.exports = { getMine: get(false), getForUser: get(true), submitMine: submit(false), submitForUser: submit(true), reviewForUser, downloadMine: download(false), downloadForUser: download(true), scanMine: scan(false), scanForUser: scan(true) };
