const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { getClient, query } = require('../config/database');
const { generateSessionTokens } = require('../utils/tokens');
const authController = require('./auth.controller');
const {
  createOtpChallenge,
  deliverOtp,
  getRegisteredWebAuthnCredentials,
  getSecurityAuditEntries,
  getSecurityAuditSummary,
  getSecuritySignatures,
  getStaffSecurityContext,
  getWebAuthnCredentialById,
  issueStepUpToken,
  issueWebAuthnSessionToken,
  encodeUuidToBuffer,
  maskPhone,
  normalizePurpose,
  recordSecurityAudit,
  signClinicalRecord,
  storeWebAuthnCredential,
  verifyOtpChallenge,
  verifyWebAuthnSessionToken,
  WEB_AUTHN_ORIGIN,
  WEB_AUTHN_RP_ID,
  WEB_AUTHN_RP_NAME,
} = require('../utils/security');

const buildMaskedEmail = (email) => {
  if (!email || !String(email).includes('@')) return null;
  const [local, domain] = String(email).split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(0, local.length - visible.length))}@${domain}`;
};

const getStaffOrReject = async (req, res) => {
  const staffProfile = await getStaffSecurityContext(req.user.id);
  if (!staffProfile) {
    res.status(403).json({
      success: false,
      message: 'Staff security credentials are required for this action',
      requestId: req.requestId || null,
      code: 'STAFF_CREDENTIAL_REQUIRED',
    });
    return null;
  }

  return staffProfile;
};

const requestOtp = async (req, res, next) => {
  try {
    const staffProfile = await getStaffOrReject(req, res);
    if (!staffProfile) return;

    const purpose = normalizePurpose(req.body?.purpose || 'critical');
    const contactResult = await query(
      'SELECT email, phone FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    const contact = contactResult.rows[0] || {};
    const deliveryTarget = req.body?.destination || contact.phone || contact.email;

    if (!deliveryTarget) {
      return res.status(400).json({
        success: false,
        message: 'No delivery destination is available for this account',
        requestId: req.requestId || null,
      });
    }

    const { challenge, code } = await createOtpChallenge({
      staffId: staffProfile.staffId,
      purpose,
      channel: 'SMS',
    });

    await deliverOtp({
      user: {
        email: contact.email || req.user.email,
        phone: contact.phone || null,
      },
      code,
      purpose,
    });

    await recordSecurityAudit({
      staffId: staffProfile.staffId,
      actionPerformed: 'OTP_REQUESTED',
      entityType: 'security',
      entityId: challenge.id,
      deviceIp: req.ip,
      authMethod: 'Password',
      credentialStrength: 'Base',
      requestId: req.requestId || null,
      details: {
        purpose,
        destination: maskPhone(req.user.phone) || buildMaskedEmail(req.user.email),
      },
    });

    res.json({
      success: true,
      message: 'Verification code sent',
      data: {
        challengeId: challenge.id,
        purpose,
        expiresAt: challenge.expires_at,
        destination: maskPhone(contact.phone) || buildMaskedEmail(contact.email || req.user.email),
        deliveryChannel: 'SMS',
        debugCode: process.env.NODE_ENV === 'production' ? undefined : code,
      },
    });
  } catch (err) {
    next(err);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const staffProfile = await getStaffOrReject(req, res);
    if (!staffProfile) return;

    const purpose = normalizePurpose(req.body?.purpose || 'critical');
    const code = String(req.body?.code || '').trim();

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Verification code is required',
        requestId: req.requestId || null,
      });
    }

    const verification = await verifyOtpChallenge({
      staffId: staffProfile.staffId,
      purpose,
      code,
    });

    if (!verification.verified) {
      await recordSecurityAudit({
        staffId: staffProfile.staffId,
        actionPerformed: 'OTP_VERIFY_FAILED',
        entityType: 'security',
        entityId: verification.challenge?.id || null,
        deviceIp: req.ip,
        authMethod: 'SMS_OTP',
        credentialStrength: 'Base',
        requestId: req.requestId || null,
        notes: verification.reason,
      });

      return res.status(400).json({
        success: false,
        message: verification.reason || 'Invalid or expired code',
        requestId: req.requestId || null,
        code: 'OTP_INVALID',
      });
    }

    const stepUpToken = issueStepUpToken({
      userId: req.user.id,
      role: req.user.role,
      purpose,
      authMethod: 'SMS_OTP',
      credentialStrength: 'Step_Up',
      challengeId: verification.challenge.id,
    });

    await recordSecurityAudit({
      staffId: staffProfile.staffId,
      actionPerformed: 'OTP_VERIFIED',
      entityType: 'security',
      entityId: verification.challenge.id,
      deviceIp: req.ip,
      authMethod: 'SMS_OTP',
      credentialStrength: 'Step_Up',
      requestId: req.requestId || null,
      details: { purpose },
    });

    res.json({
      success: true,
      message: 'Step-up verification completed',
      data: {
        stepUpToken,
        purpose,
        stepUpExpiresIn: process.env.STEP_UP_TOKEN_EXPIRES_IN || '15m',
      },
    });
  } catch (err) {
    next(err);
  }
};

const startWebAuthnRegistration = async (req, res, next) => {
  try {
    const staffProfile = await getStaffOrReject(req, res);
    if (!staffProfile) return;

    const credentials = await getRegisteredWebAuthnCredentials(staffProfile.staffId);
    const options = await generateRegistrationOptions({
      rpName: WEB_AUTHN_RP_NAME,
      rpID: WEB_AUTHN_RP_ID,
      userName: req.user.email,
      userDisplayName: `${req.user.first_name} ${req.user.last_name}`,
      userID: encodeUuidToBuffer(req.user.id),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: credentials.map((credential) => ({
        id: credential.credential_id,
        transports: credential.transports || undefined,
      })),
    });

    const sessionToken = issueWebAuthnSessionToken({
      type: 'register',
      userId: req.user.id,
      purpose: normalizePurpose(req.body?.purpose || 'critical'),
      challenge: options.challenge,
      rpId: WEB_AUTHN_RP_ID,
      origin: WEB_AUTHN_ORIGIN,
      email: req.user.email,
    });

    await recordSecurityAudit({
      staffId: staffProfile.staffId,
      actionPerformed: 'WEBAUTHN_REGISTER_STARTED',
      entityType: 'security',
      entityId: null,
      deviceIp: req.ip,
      authMethod: 'Password',
      credentialStrength: 'Base',
      requestId: req.requestId || null,
      details: { purpose: normalizePurpose(req.body?.purpose || 'critical') },
    });

    res.json({
      success: true,
      data: {
        options,
        sessionToken,
        rpId: WEB_AUTHN_RP_ID,
        origin: WEB_AUTHN_ORIGIN,
      },
    });
  } catch (err) {
    next(err);
  }
};

const finishWebAuthnRegistration = async (req, res, next) => {
  const client = await getClient();

  try {
    const { credential, sessionToken, label } = req.body;
    if (!credential || !sessionToken) {
      return res.status(400).json({
        success: false,
        message: 'credential and sessionToken are required',
        requestId: req.requestId || null,
      });
    }

    const session = verifyWebAuthnSessionToken(sessionToken, 'register');
    if (session.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'WebAuthn session does not match the current account',
        requestId: req.requestId || null,
      });
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: session.challenge,
      expectedOrigin: session.origin,
      expectedRPID: session.rpId,
    });

    if (!verification.verified) {
      return res.status(400).json({
        success: false,
        message: 'WebAuthn registration could not be verified',
        requestId: req.requestId || null,
        code: 'WEBAUTHN_REGISTRATION_INVALID',
      });
    }

    const staffProfile = await getStaffOrReject(req, res);
    if (!staffProfile) return;

    await client.query('BEGIN');

    const publicKey = Buffer.from(verification.registrationInfo.credential.publicKey).toString('base64');
    const stored = await storeWebAuthnCredential({
      client,
      staffId: staffProfile.staffId,
      credential: verification.registrationInfo.credential,
      publicKey,
      label: label || req.body?.label || `${req.user.first_name} ${req.user.last_name}`,
      authenticator: verification.registrationInfo,
    });

    await recordSecurityAudit({
      client,
      staffId: staffProfile.staffId,
      actionPerformed: 'WEBAUTHN_REGISTER_FINISHED',
      entityType: 'security',
      entityId: stored.webauthnCredential.id,
      deviceIp: req.ip,
      authMethod: 'WebAuthn',
      credentialStrength: 'Base',
      requestId: req.requestId || null,
      details: {
        credentialDeviceType: verification.registrationInfo.credentialDeviceType,
        backedUp: verification.registrationInfo.credentialBackedUp,
      },
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'WebAuthn credential registered',
      data: {
        credentialId: stored.webauthnCredential.credential_id,
        authCredentialId: stored.authCredential.id,
        label: stored.webauthnCredential.label,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const startWebAuthnLogin = async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
        requestId: req.requestId || null,
      });
    }

    const userResult = await query(
      `SELECT
         u.id,
         u.email,
      u.role,
      u.first_name,
      u.last_name,
      u.phone,
      u.is_active,
       sr.id AS staff_registry_id
       FROM users u
       LEFT JOIN staff_registry sr ON sr.user_id = u.id
       WHERE u.email = $1
       LIMIT 1`,
      [email]
    );

    const user = userResult.rows[0];
    if (!user || !user.staff_registry_id) {
      return res.status(404).json({
        success: false,
        message: 'No passkey is registered for that account',
        requestId: req.requestId || null,
        code: 'WEBAUTHN_NOT_CONFIGURED',
      });
    }
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated',
        requestId: req.requestId || null,
      });
    }

    const credentials = await getRegisteredWebAuthnCredentials(user.staff_registry_id);
    if (credentials.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No passkey is registered for that account',
        requestId: req.requestId || null,
        code: 'WEBAUTHN_NOT_CONFIGURED',
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: WEB_AUTHN_RP_ID,
      allowCredentials: credentials.map((credential) => ({
        id: credential.credential_id,
        transports: credential.transports || undefined,
      })),
      userVerification: 'preferred',
    });

    const sessionToken = issueWebAuthnSessionToken({
      type: 'login',
      userId: user.id,
      purpose: 'critical',
      challenge: options.challenge,
      rpId: WEB_AUTHN_RP_ID,
      origin: WEB_AUTHN_ORIGIN,
      email: user.email,
    });

    res.json({
      success: true,
      data: {
        options,
        sessionToken,
        rpId: WEB_AUTHN_RP_ID,
        origin: WEB_AUTHN_ORIGIN,
      },
    });
  } catch (err) {
    next(err);
  }
};

const finishWebAuthnLogin = async (req, res, next) => {
  const client = await getClient();

  try {
    const { credential, sessionToken } = req.body;
    if (!credential || !sessionToken) {
      return res.status(400).json({
        success: false,
        message: 'credential and sessionToken are required',
        requestId: req.requestId || null,
      });
    }

    const session = verifyWebAuthnSessionToken(sessionToken, 'login');
    const credentialRecord = await getWebAuthnCredentialById(credential.id);
    if (!credentialRecord) {
      return res.status(404).json({
        success: false,
        message: 'Registered WebAuthn credential not found',
        requestId: req.requestId || null,
        code: 'WEBAUTHN_NOT_CONFIGURED',
      });
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: session.challenge,
      expectedOrigin: session.origin,
      expectedRPID: session.rpId,
      credential: {
        id: credentialRecord.id,
        publicKey: credentialRecord.publicKey,
        counter: credentialRecord.counter,
        transports: credentialRecord.transports,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return res.status(400).json({
        success: false,
        message: 'WebAuthn login could not be verified',
        requestId: req.requestId || null,
        code: 'WEBAUTHN_LOGIN_INVALID',
      });
    }

    const userResult = await query(
      `SELECT
         u.id,
         u.email,
         u.role,
         u.first_name,
         u.last_name,
         u.phone,
         u.avatar_url,
         u.ui_preferences,
         u.created_at,
         u.is_active,
         sr.id AS staff_registry_id
       FROM users u
       LEFT JOIN staff_registry sr ON sr.user_id = u.id
       WHERE sr.id = $1
       LIMIT 1`,
      [credentialRecord.row.staff_id]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Account not found',
        requestId: req.requestId || null,
      });
    }
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated',
        requestId: req.requestId || null,
      });
    }
    if (session.userId !== user.id) {
      return res.status(403).json({
        success: false,
        message: 'WebAuthn session does not match the active account',
        requestId: req.requestId || null,
      });
    }

    const { accessToken, refreshToken } = generateSessionTokens(user.id, user.role);
    const stepUpToken = issueStepUpToken({
      userId: user.id,
      role: user.role,
      purpose: 'critical',
      authMethod: 'WebAuthn',
      credentialStrength: 'Step_Up',
      credentialId: credentialRecord.id,
    });

    await client.query('BEGIN');
    await client.query(
      `UPDATE users
       SET refresh_token = $1,
           last_login_at = NOW(),
           last_seen_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [refreshToken, user.id]
    );
    await client.query(
      `UPDATE webauthn_credentials
       SET counter = $1,
           last_used_at = NOW(),
           updated_at = NOW()
       WHERE credential_id = $2`,
      [verification.authenticationInfo.newCounter, credentialRecord.id]
    );
    await client.query(
      `UPDATE auth_credentials
       SET last_verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [credentialRecord.row.auth_credential_id]
    );

    const staffProfile = await getStaffOrReject({ ...req, user }, res);
    if (!staffProfile) {
      await client.query('ROLLBACK');
      return;
    }

    await recordSecurityAudit({
      client,
      staffId: staffProfile.staffId,
      actionPerformed: 'WEBAUTHN_LOGIN_SUCCESS',
      entityType: 'security',
      entityId: null,
      deviceIp: req.ip,
      authMethod: 'WebAuthn',
      credentialStrength: 'Step_Up',
      requestId: req.requestId || null,
      details: {
        credentialId: credentialRecord.id,
        purpose: session.purpose,
      },
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Passkey login successful',
      data: {
        accessToken,
        refreshToken,
        stepUpToken,
        stepUpExpiresIn: process.env.STEP_UP_TOKEN_EXPIRES_IN || '15m',
        user: await authController.buildUserPayload(user),
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const signEntity = async (req, res, next) => {
  try {
    const staffProfile = await getStaffOrReject(req, res);
    if (!staffProfile) return;

    const { entityType, entityId, actionType, notes } = req.body;
    if (!entityType || !entityId || !actionType) {
      return res.status(400).json({
        success: false,
        message: 'entityType, entityId, and actionType are required',
        requestId: req.requestId || null,
      });
    }

    const signature = await signClinicalRecord({
      staffProfile,
      entityType,
      entityId,
      actionType,
      credentialStrength: 'Clinical_Signature',
      authMethod: req.stepUp?.authMethod || 'SMS_OTP',
      requestId: req.requestId || null,
      notes: notes || null,
    });

    res.json({
      success: true,
      message: 'Clinical signature recorded',
      data: signature,
    });
  } catch (err) {
    next(err);
  }
};

const getSignatures = async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params;
    if (!entityType || !entityId) {
      return res.status(400).json({
        success: false,
        message: 'entityType and entityId are required',
        requestId: req.requestId || null,
      });
    }

    const signatures = await getSecuritySignatures({ entityType, entityId });
    res.json({ success: true, data: signatures });
  } catch (err) {
    next(err);
  }
};

const getAudit = async (req, res, next) => {
  try {
    const staffId = req.params.staffId || req.query.staffId || null;
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10) || 25, 1), 250);
    const offset = req.query.offset !== undefined
      ? Math.max(parseInt(req.query.offset || '0', 10) || 0, 0)
      : (page - 1) * limit;
    const days = Math.max(parseInt(req.query.days || '30', 10) || 30, 1);
    const from = req.query.from || new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
    const to = req.query.to || null;
    const audit = await getSecurityAuditEntries({
      staffId,
      actionPerformed: req.query.actionPerformed || null,
      entityType: req.query.entityType || null,
      authMethod: req.query.authMethod || null,
      credentialStrength: req.query.credentialStrength || null,
      search: req.query.search || null,
      from,
      to,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: audit.rows,
      pagination: {
        page,
        limit: audit.limit,
        offset: audit.offset,
        total: audit.total,
        pages: Math.max(Math.ceil(audit.total / audit.limit), 1),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getAuditSummary = async (req, res, next) => {
  try {
    const staffId = req.params.staffId || req.query.staffId || null;
    const days = Math.max(parseInt(req.query.days || '30', 10) || 30, 1);
    const from = req.query.from || new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
    const to = req.query.to || null;
    const summary = await getSecurityAuditSummary({
      staffId,
      actionPerformed: req.query.actionPerformed || null,
      entityType: req.query.entityType || null,
      authMethod: req.query.authMethod || null,
      credentialStrength: req.query.credentialStrength || null,
      search: req.query.search || null,
      from,
      to,
    });

    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  finishWebAuthnLogin,
  finishWebAuthnRegistration,
  getAudit,
  getAuditSummary,
  getSignatures,
  requestOtp,
  signEntity,
  startWebAuthnLogin,
  startWebAuthnRegistration,
  verifyOtp,
};
