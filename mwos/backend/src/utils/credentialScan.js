const { randomUUID, createHash } = require('node:crypto');
const { getClient } = require('../config/database');
const { requirementForRole, dateOnly } = require('./accountCredentials');
const { extractCredentialText } = require('./credentialOcr');
const { analyzeCredential } = require('./credentialAnalysis');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errorWithStatus = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const result = (outcome, revision) => ({ outcome, revision });

const lockUser = async (client, userId) => {
  const response = await client.query('SELECT id, role, first_name, last_name FROM users WHERE id = $1 FOR UPDATE', [userId]);
  return response.rows[0];
};
const lockCredential = async (client, userId) => {
  const response = await client.query(`SELECT user_id, kind, document_type, document_label, license_number, expires_at,
    revision, document_bytes, mime_type, document_sha256, scan_status, scan_revision, scan_token, scan_started_at,
    (scan_started_at > NOW() - INTERVAL '90 seconds' AND scan_started_at <= NOW() + INTERVAL '5 seconds') AS scan_lease_active
    FROM account_credentials WHERE user_id = $1 FOR UPDATE`, [userId]);
  return response.rows[0];
};

async function claimScan(userId, revision) {
  let client, open = false, transientBytes;
  try {
    client = await getClient();
    await client.query('BEGIN'); open = true;
    const account = await lockUser(client, userId);
    if (!account) throw errorWithStatus('User not found.', 404, 'CREDENTIAL_USER_NOT_FOUND');
    const credential = await lockCredential(client, userId);
    if (!credential) throw errorWithStatus('Submit a credential document before scanning.', 404, 'CREDENTIAL_NOT_FOUND');
    const requirement = requirementForRole(account.role);
    if (requirement === 'none' || credential.kind !== requirement) throw errorWithStatus('The credential no longer matches the account role.', 409, 'CREDENTIAL_ROLE_MISMATCH');
    if (Number(credential.revision) !== revision) {
      await client.query('ROLLBACK'); open = false;
      return { receipt: result('stale', revision) };
    }
    if (credential.scan_status === 'processing' && Number(credential.scan_revision) === revision && credential.scan_token && credential.scan_lease_active === true) {
      await client.query('ROLLBACK'); open = false;
      return { receipt: result('processing', revision) };
    }
    if (!Buffer.isBuffer(credential.document_bytes) || !credential.document_bytes.length || credential.document_bytes.length > 2 * 1024 * 1024) throw errorWithStatus('The private credential document is unavailable.', 409, 'CREDENTIAL_DOCUMENT_UNAVAILABLE');
    const bytes = Buffer.from(credential.document_bytes);
    transientBytes = bytes;
    const hash = createHash('sha256').update(bytes).digest('hex');
    const duplicate = await client.query('SELECT EXISTS (SELECT 1 FROM account_credentials WHERE user_id <> $2 AND (document_sha256 = $1 OR (document_sha256 IS NULL AND document_bytes = $3))) AS duplicate_detected', [hash, userId, bytes]);
    if (account.role === 'patient') {
      const patient = await client.query('SELECT date_of_birth FROM patients WHERE user_id = $1 LIMIT 1', [userId]);
      account.date_of_birth = patient.rows[0]?.date_of_birth;
    }
    const token = randomUUID();
    await client.query(`UPDATE account_credentials SET document_sha256 = $2, scan_status = 'processing',
      scan_revision = $3, scan_token = $4, scan_started_at = NOW(), scanned_at = NULL, scan_result = NULL
      WHERE user_id = $1`, [userId, hash, revision, token]);
    await client.query('COMMIT'); open = false;
    return { snapshot: {
      account, credential: { kind: credential.kind, document_type: credential.document_type, document_label: credential.document_label, license_number: credential.license_number, expires_at: credential.expires_at },
      bytes, mimeType: credential.mime_type, token,
      duplicateDetected: typeof duplicate.rows[0]?.duplicate_detected === 'boolean' ? duplicate.rows[0].duplicate_detected : undefined,
    } };
  } catch (error) {
    transientBytes?.fill(0);
    if (open) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client?.release(); }
}

function processingResult(ocr, snapshot) {
  const normalized = ocr && ['processed', 'unreadable', 'unsupported', 'unavailable'].includes(ocr.status) && typeof ocr.text === 'string'
    ? ocr : { status: 'unavailable', text: '', confidence: null, pagesScanned: 0 };
  const analysis = analyzeCredential({ credential: snapshot.credential, account: snapshot.account, ocr: normalized, duplicateDetected: snapshot.duplicateDetected });
  if (['PAGE_LIMIT_REACHED', 'TEXT_LIMIT_REACHED'].includes(normalized.reason)) {
    analysis.checks.push({ code: 'complete_document', result: 'unknown', label: 'The automated scan reached its page or text limit. Review the complete original document.' });
    if (analysis.outcome === 'ready_for_review') {
      analysis.outcome = 'manual_review';
      analysis.summary = 'The automated scan covered only part of the document. Review the complete original document manually.';
    }
  }
  return { analysis, status: normalized.status === 'processed' ? 'completed' : ['unreadable', 'unsupported'].includes(normalized.status) ? 'unreadable' : 'unavailable' };
}

async function finalizeScan({ userId, revision, actorId, snapshot, analysis, status }) {
  let client, open = false;
  try {
    client = await getClient();
    await client.query('BEGIN'); open = true;
    const account = await lockUser(client, userId);
    const credential = account ? await lockCredential(client, userId) : null;
    if (account?.role === 'patient') {
      const patient = await client.query('SELECT date_of_birth FROM patients WHERE user_id = $1 LIMIT 1', [userId]);
      account.date_of_birth = patient.rows[0]?.date_of_birth;
    }
    if (!account || !credential || account.role !== snapshot.account.role
        || account.first_name !== snapshot.account.first_name || account.last_name !== snapshot.account.last_name
        || dateOnly(account.date_of_birth) !== dateOnly(snapshot.account.date_of_birth)
        || credential.kind !== snapshot.credential.kind || Number(credential.revision) !== revision
        || Number(credential.scan_revision) !== revision || credential.scan_token !== snapshot.token) {
      await client.query('ROLLBACK'); open = false;
      return result('stale', revision);
    }
    const saved = await client.query(`UPDATE account_credentials SET scan_status = $2, scan_result = $3::jsonb,
      scanned_at = NOW(), scan_token = NULL WHERE user_id = $1 AND revision = $4 AND scan_token = $5 RETURNING user_id`,
    [userId, status, JSON.stringify(analysis), revision, snapshot.token]);
    if (saved.rows.length !== 1) {
      await client.query('ROLLBACK'); open = false;
      return result('stale', revision);
    }
    await client.query(`INSERT INTO security_audit (staff_id, action_performed, entity_type, entity_id,
      auth_method, credential_strength, details)
      VALUES (NULL, 'CREDENTIAL_SCANNED', 'account_credential', $1, 'Password', 'Base', $2::jsonb)`,
    [userId, JSON.stringify({ actorId, revision, outcome: analysis.outcome })]);
    await client.query('COMMIT'); open = false;
    return result('scanned', revision);
  } catch (error) {
    if (open) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client?.release(); }
}

// A failed final transaction must never leave a convincing successful result or
// clear the lease of a replacement/newer scan. A DB outage may prevent this
// best-effort receipt; the original lease then expires naturally.
async function markFailed(userId, revision, token) {
  let client;
  try {
    client = await getClient();
    await client.query(`UPDATE account_credentials SET scan_status = 'failed', scan_token = NULL
      WHERE user_id = $1 AND revision = $2 AND scan_revision = $2 AND scan_token = $3`, [userId, revision, token]);
  } catch { /* Preserve the original database failure without leaking diagnostics. */ }
  finally { client?.release(); }
}

async function scanCredential(input = {}) {
  const { userId, revision, actorId } = input || {};
  if (typeof userId !== 'string' || typeof actorId !== 'string' || !UUID.test(userId) || !UUID.test(actorId) || !Number.isSafeInteger(revision) || revision < 1) throw errorWithStatus('Choose a credential and its current submission revision.', 400, 'CREDENTIAL_SCAN_INVALID');
  const claim = await claimScan(userId, revision);
  if (claim.receipt) return claim.receipt;
  const { snapshot } = claim;
  try {
    let ocr;
    try { ocr = await extractCredentialText(snapshot.bytes, snapshot.mimeType, { timeoutMs: 25000, maxPages: 2 }); }
    catch { ocr = { status: 'unavailable', text: '', confidence: null, pagesScanned: 0 }; }
    const processed = processingResult(ocr, snapshot);
    return await finalizeScan({ userId, revision, actorId, snapshot, ...processed });
  } catch (error) {
    await markFailed(userId, revision, snapshot.token);
    throw error;
  } finally { snapshot.bytes.fill(0); }
}

module.exports = { scanCredential };
