const { getClient, query } = require('../config/database');
const { randomUUID } = require('node:crypto');
const { resolveStepUpContext } = require('../middleware/stepUp');
const { buildTeleconsultMeetingDetails, prepareTeleconsultUpdate, parseSchedule } = require('../utils/teleconsult');
const { dailyVideo, managedRoomNameForSession } = require('../utils/dailyVideo');
const {
  getStaffSecurityContext,
  recordSecurityAudit,
} = require('../utils/security');

const STAFF_ROLES = ['admin', 'doctor', 'midwife', 'nurse'];
const THREAD_TYPES = ['care_team', 'patient_support', 'handoff', 'announcement', 'tele_consult'];
const THREAD_STATUSES = ['open', 'resolved', 'archived'];
const TELECONSULT_STATUSES = ['requested', 'scheduled', 'active', 'completed', 'cancelled'];
const TASK_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const MESSAGE_CATEGORIES = ['general', 'clinical_advice', 'clinical_note', 'teleconsult', 'handoff', 'urgent', 'system'];

const sanitizePriority = (value) => (PRIORITIES.includes(value) ? value : 'normal');
const sanitizeThreadType = (value) => (THREAD_TYPES.includes(value) ? value : 'care_team');
const sanitizeThreadStatus = (value) => (THREAD_STATUSES.includes(value) ? value : 'open');
const sanitizeTeleconsultStatus = (value) => (TELECONSULT_STATUSES.includes(value) ? value : 'requested');
const sanitizeTaskStatus = (value) => (TASK_STATUSES.includes(value) ? value : 'open');
const sanitizeMessageCategory = (value) => (MESSAGE_CATEGORIES.includes(value) ? value : 'general');
const sanitizeMessageType = (value) => (['comment', 'handoff', 'system'].includes(value) ? value : 'comment');
const parseBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

const getPatientRecordByUser = async (client, userId) => {
  const result = await client.query(
    'SELECT id, first_name, last_name, user_id FROM patients WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
};

const getPatientRecordById = async (client, patientId) => {
  const result = await client.query(
    'SELECT id, first_name, last_name, user_id FROM patients WHERE id = $1 LIMIT 1',
    [patientId]
  );
  return result.rows[0] || null;
};

const dedupeIds = (ids = []) => [...new Set(ids.filter(Boolean))];

const createNotifications = async (client, { userIds, title, body, createdBy, metadata = {} }) => {
  const recipients = dedupeIds(userIds);
  if (recipients.length === 0) return;

  const values = [];
  const placeholders = recipients.map((userId, index) => {
    const base = index * 7;
    values.push(userId, title, body, 'interaction', 'in_app', JSON.stringify(metadata), createdBy);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb, $${base + 7})`;
  });

  await client.query(
    `INSERT INTO notifications (user_id, title, body, type, channel, metadata, created_by)
     VALUES ${placeholders.join(', ')}`,
    values
  );
};

const fetchThreadDetail = async (client, threadId, userId) => {
  const threadResult = await client.query(
    `SELECT ct.*,
        p.first_name || ' ' || p.last_name AS patient_name,
        tcs.id AS teleconsult_session_id,
        tcs.status AS teleconsult_status,
        tcs.meeting_provider AS teleconsult_meeting_provider,
        tcs.meeting_url AS teleconsult_meeting_url,
        tcs.meeting_code AS teleconsult_meeting_code,
        tcs.reason AS teleconsult_reason,
        tcs.clinical_trigger AS teleconsult_clinical_trigger,
        tcs.start_at AS teleconsult_start_at,
        tcs.end_at AS teleconsult_end_at,
        tcs.requested_by AS teleconsult_requested_by,
        tcs.clinician_id AS teleconsult_clinician_id
     FROM conversation_threads ct
     LEFT JOIN patients p ON p.id = ct.patient_id
     LEFT JOIN LATERAL (
       SELECT *
       FROM tele_consult_sessions tcs
       WHERE tcs.thread_id = ct.id
       ORDER BY tcs.created_at DESC
       LIMIT 1
     ) tcs ON true
     WHERE ct.id = $1
       AND EXISTS (
         SELECT 1
         FROM conversation_participants cp
         WHERE cp.thread_id = ct.id AND cp.user_id = $2
       )`,
    [threadId, userId]
  );

  if (threadResult.rows.length === 0) return null;

  const [participantsResult, messagesResult] = await Promise.all([
    client.query(
      `SELECT u.id, u.first_name, u.last_name, u.role, u.avatar_url, cp.joined_at, cp.last_read_at
       FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.thread_id = $1
       ORDER BY u.role, u.last_name, u.first_name`,
      [threadId]
    ),
    client.query(
      `SELECT cm.id, cm.body, cm.message_type, cm.message_category, cm.is_clinical_note,
          cm.record_promotion_status, cm.record_promotion_at, cm.record_promotion_by,
          cm.teleconsult_session_id, cm.created_at,
          u.id AS sender_id,
          u.first_name || ' ' || u.last_name AS sender_name,
          u.role AS sender_role
       FROM conversation_messages cm
       LEFT JOIN users u ON u.id = cm.sender_id
       WHERE cm.thread_id = $1
       ORDER BY cm.created_at ASC
       LIMIT 250`,
      [threadId]
    ),
  ]);

  return {
    ...threadResult.rows[0],
    teleconsult_session: threadResult.rows[0].teleconsult_session_id ? {
      id: threadResult.rows[0].teleconsult_session_id,
      status: threadResult.rows[0].teleconsult_status,
      meeting_provider: threadResult.rows[0].teleconsult_meeting_provider,
      meeting_url: threadResult.rows[0].teleconsult_meeting_url,
      meeting_code: threadResult.rows[0].teleconsult_meeting_code,
      reason: threadResult.rows[0].teleconsult_reason,
      clinical_trigger: threadResult.rows[0].teleconsult_clinical_trigger,
      start_at: threadResult.rows[0].teleconsult_start_at,
      end_at: threadResult.rows[0].teleconsult_end_at,
      requested_by: threadResult.rows[0].teleconsult_requested_by,
      clinician_id: threadResult.rows[0].teleconsult_clinician_id,
    } : null,
    participants: participantsResult.rows,
    messages: messagesResult.rows,
  };
};

const getDirectory = async (req, res, next) => {
  try {
    const client = await getClient();
    try {
      const staffResult = await client.query(
        `SELECT id, first_name, last_name, role, avatar_url
         FROM users
         WHERE role = ANY($1) AND is_active = true
         ORDER BY role, last_name, first_name`,
        [STAFF_ROLES]
      );

      if (req.user.role === 'patient') {
        const patient = await getPatientRecordByUser(client, req.user.id);
        return res.json({
          success: true,
          data: {
            staff: staffResult.rows,
            patients: patient ? [patient] : [],
          },
        });
      }

      const patientsResult = await client.query(
        `SELECT id, user_id, first_name, last_name, city, risk_level
         FROM patients
         ORDER BY last_name, first_name
         LIMIT 200`
      );

      res.json({
        success: true,
        data: {
          staff: staffResult.rows,
          patients: patientsResult.rows,
        },
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

const getThreads = async (req, res, next) => {
  try {
    const { threadType, status, patientId } = req.query;
    const params = [req.user.id];
    const conditions = ['cp.user_id = $1'];
    let index = 2;

    if (threadType) {
      conditions.push(`ct.thread_type = $${index++}`);
      params.push(threadType);
    }

    if (status) {
      conditions.push(`ct.status = $${index++}`);
      params.push(status);
    }

    if (patientId && req.user.role !== 'patient') {
      conditions.push(`ct.patient_id = $${index++}`);
      params.push(patientId);
    }

    const result = await query(
      `SELECT ct.id,
          ct.thread_type,
          ct.title,
          ct.priority,
          ct.status,
          ct.patient_id,
          ct.last_message_at,
          ct.updated_at,
          p.first_name || ' ' || p.last_name AS patient_name,
          tcs.status AS teleconsult_status,
          tcs.start_at AS teleconsult_start_at,
          (
            SELECT cm.body
            FROM conversation_messages cm
            WHERE cm.thread_id = ct.id
            ORDER BY cm.created_at DESC
            LIMIT 1
          ) AS latest_message,
          (
            SELECT u.first_name || ' ' || u.last_name
            FROM conversation_messages cm
            JOIN users u ON u.id = cm.sender_id
            WHERE cm.thread_id = ct.id
            ORDER BY cm.created_at DESC
            LIMIT 1
          ) AS latest_sender_name,
          (
            SELECT COUNT(*)::int
            FROM conversation_messages cm
            WHERE cm.thread_id = ct.id
              AND cm.sender_id <> $1
              AND cm.created_at > COALESCE(cp.last_read_at, TIMESTAMPTZ '1970-01-01')
          ) AS unread_count,
          (
            SELECT json_agg(
              json_build_object(
                'id', u.id,
                'name', u.first_name || ' ' || u.last_name,
                'role', u.role
              )
              ORDER BY u.first_name, u.last_name
            )
            FROM conversation_participants cp2
            JOIN users u ON u.id = cp2.user_id
            WHERE cp2.thread_id = ct.id
          ) AS participants
       FROM conversation_threads ct
       JOIN conversation_participants cp ON cp.thread_id = ct.id
       LEFT JOIN patients p ON p.id = ct.patient_id
       LEFT JOIN LATERAL (
         SELECT status, start_at
         FROM tele_consult_sessions
         WHERE thread_id = ct.id
         ORDER BY created_at DESC
         LIMIT 1
       ) tcs ON true
       WHERE ${conditions.join(' AND ')}
       ORDER BY ct.last_message_at DESC, ct.updated_at DESC
       LIMIT 100`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const getThreadById = async (req, res, next) => {
  try {
    const client = await getClient();
    try {
      const thread = await fetchThreadDetail(client, req.params.id, req.user.id);
      if (!thread) {
        return res.status(404).json({ success: false, message: 'Conversation not found or access denied' });
      }

      res.json({ success: true, data: thread });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

const markThreadRead = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE conversation_participants
       SET last_read_at = NOW()
       WHERE thread_id = $1 AND user_id = $2
       RETURNING thread_id, user_id, last_read_at`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversation not found or access denied' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const createThread = async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const role = req.user.role;
    const threadType = role === 'patient' ? 'patient_support' : sanitizeThreadType(req.body.threadType);
    const priority = sanitizePriority(req.body.priority);
    const status = sanitizeThreadStatus(req.body.status);
    const customTitle = (req.body.title || '').trim();
    const title = customTitle || (role === 'patient' ? 'Patient support request' : 'Care team discussion');
    const initialMessage = (req.body.initialMessage || req.body.body || '').trim();
    const clientRequestId = req.body.clientRequestId;
    if (clientRequestId !== undefined && (typeof clientRequestId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid request reference' });
    }

    if (threadType === 'tele_consult') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Use the tele-consult action to start a tele-consult session',
      });
    }

    if (!initialMessage) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Initial message is required' });
    }

    let patientId = req.body.patientId || null;
    let participantIds = Array.isArray(req.body.participantIds) ? [...req.body.participantIds] : [];
    let resolvedTitle = title;

    if (role === 'patient') {
      const patientRecord = await getPatientRecordByUser(client, req.user.id);
      if (!patientRecord) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Patient profile not found' });
      }

      patientId = patientRecord.id;
      const staffResult = await client.query(
        `SELECT id FROM users WHERE role = ANY($1) AND is_active = true`,
        [STAFF_ROLES]
      );
      participantIds = staffResult.rows.map((row) => row.id);
    }

    if (patientId) {
      const patientRecord = await getPatientRecordById(client, patientId);
      if (!patientRecord) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Patient record not found' });
      }

      if (patientRecord.user_id) participantIds.push(patientRecord.user_id);
      if (!customTitle) {
        resolvedTitle = `${patientRecord.first_name} ${patientRecord.last_name} discussion`;
      }
    }

    participantIds.push(req.user.id);
    participantIds = dedupeIds(participantIds);

    if (participantIds.length < 2) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Please include at least one additional participant' });
    }

    const validParticipants = await client.query(
      `SELECT id FROM users WHERE id = ANY($1) AND is_active = true`,
      [participantIds]
    );
    const validParticipantIds = dedupeIds(validParticipants.rows.map((row) => row.id));

    const threadResult = await client.query(
      `INSERT INTO conversation_threads (id, thread_type, title, patient_id, created_by, status, priority, last_message_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      [clientRequestId || randomUUID(), threadType, resolvedTitle, patientId, req.user.id, status, priority]
    );
    const thread = threadResult.rows[0];
    // The UUID primary key serializes retries, including a retry after a lost response.
    if (!thread) {
      const existing = await fetchThreadDetail(client, clientRequestId, req.user.id);
      if (!existing || existing.created_by !== req.user.id || existing.messages[0]?.body !== initialMessage) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'This request reference is already in use. Check your existing messages before sending another request.' });
      }
      await client.query('COMMIT');
      return res.status(200).json({ success: true, data: existing, replayed: true });
    }

    for (const participantId of validParticipantIds) {
      await client.query(
        `INSERT INTO conversation_participants (thread_id, user_id, last_read_at)
         VALUES ($1, $2, $3)`,
        [thread.id, participantId, participantId === req.user.id ? new Date() : null]
      );
    }

    await client.query(
      `INSERT INTO conversation_messages (thread_id, sender_id, body, message_type)
       VALUES ($1, $2, $3, $4)`,
      [thread.id, req.user.id, initialMessage, threadType === 'handoff' ? 'handoff' : 'comment']
    );

    await createNotifications(client, {
      userIds: validParticipantIds.filter((id) => id !== req.user.id),
      title: `New thread: ${resolvedTitle}`,
      body: `${req.user.first_name} ${req.user.last_name}: ${initialMessage.slice(0, 140)}`,
      createdBy: req.user.id,
      metadata: { threadId: thread.id, patientId: patientId || null, category: 'interaction_thread' },
    });

    await client.query('COMMIT');

    const detail = await fetchThreadDetail(client, thread.id, req.user.id);
    res.status(201).json({ success: true, data: detail });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const createTeleconsultSession = async (req, res, next) => {
  let client;

  try {

    const staffRoles = ['admin', 'doctor', 'midwife', 'nurse'];
    let staffProfile = null;
    if (req.user.role !== 'patient') {
      if (!staffRoles.includes(req.user.role)) {
        if (client) await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'Only patients and clinic staff can start a tele-consult session',
        });
      }

      staffProfile = await getStaffSecurityContext(req.user.id);
      if (!staffProfile) {
        if (client) await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'Staff security credentials are required for tele-consult sessions',
        });
      }

      if (!staffProfile.isVerified) {
        if (client) await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'Verified staff licensing is required for tele-consult sessions',
          code: 'STAFF_CREDENTIAL_REQUIRED',
        });
      }

      try {
        resolveStepUpContext(req, 'teleconsult');
      } catch (stepUpErr) {
        if (client) await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: stepUpErr.message || 'Step-up authentication required',
          code: stepUpErr.message?.includes('purpose') ? 'STEP_UP_PURPOSE_MISMATCH' : 'STEP_UP_REQUIRED',
          requestId: req.requestId || null,
        });
      }
    }

    client = await getClient();
    await client.query('BEGIN');

    const requestedClinicianId = req.body?.clinicianId || (['doctor', 'midwife'].includes(req.user.role) ? req.user.id : null);
    if (!requestedClinicianId) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'clinicianId is required to start a tele-consult session',
        requestId: req.requestId || null,
      });
    }

    const clinicianResult = await client.query(
      `SELECT id, first_name, last_name, role, is_active
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [requestedClinicianId]
    );

    const clinician = clinicianResult.rows[0];
    if (!clinician) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Clinician not found',
        requestId: req.requestId || null,
      });
    }
    if (!clinician.is_active) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'Selected clinician account is inactive',
        requestId: req.requestId || null,
      });
    }
    if (!['doctor', 'midwife'].includes(clinician.role)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Tele-consult sessions can only be assigned to a doctor or midwife',
        requestId: req.requestId || null,
      });
    }

    const existingThreadId = req.body?.threadId || null;
    const existingThread = existingThreadId
      ? await fetchThreadDetail(client, existingThreadId, req.user.id)
      : null;

    if (existingThreadId && !existingThread) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied',
        requestId: req.requestId || null,
      });
    }

    if (existingThread) {
      await client.query('SELECT id FROM conversation_threads WHERE id = $1 FOR UPDATE', [existingThread.id]);
      const priorSession = await client.query('SELECT id FROM tele_consult_sessions WHERE thread_id = $1 LIMIT 1', [existingThread.id]);
      if (existingThread.thread_type === 'tele_consult' || priorSession.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'This conversation already has a consultation. Update its existing session instead.' });
      }
    }

    let patientRecord = null;
    if (req.user.role === 'patient') {
      patientRecord = await getPatientRecordByUser(client, req.user.id);
      if (existingThread?.patient_id && existingThread.patient_id !== patientRecord?.id) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Patient record not found or access denied' });
      }
    } else {
      const selectedPatientId = existingThread?.patient_id || req.body?.patientId;
      if (selectedPatientId) patientRecord = await getPatientRecordById(client, selectedPatientId);
    }

    if (!patientRecord) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Patient record not found',
        requestId: req.requestId || null,
      });
    }

    const patientUserId = patientRecord.user_id || null;
    const baseTitle = (req.body?.title || '').trim();
    const reason = (req.body?.reason || req.body?.initialMessage || req.body?.body || '').trim();
    if (!reason) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'reason or initialMessage is required',
        requestId: req.requestId || null,
      });
    }

    const requestorName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim();
    const patientName = `${patientRecord.first_name || ''} ${patientRecord.last_name || ''}`.trim();
    const clinicianName = `${clinician.first_name || ''} ${clinician.last_name || ''}`.trim();
    const threadTitle = baseTitle || `Tele-consult: ${patientName || 'Patient'} with ${clinicianName || 'Clinician'}`;
    const triggerSource = req.body?.triggerSource || (req.user.role === 'patient' ? 'manual' : 'message');
    const clinicalTrigger = req.body?.clinicalTrigger || null;
    const patientRequest = req.user.role === 'patient';
    const canManageMeeting = req.user.role === 'admin' || (['doctor', 'midwife'].includes(req.user.role) && req.user.id === clinician.id);
    const sessionStatus = patientRequest ? 'requested' : (req.body?.sessionStatus || (req.body?.startAt ? 'scheduled' : 'requested'));
    if (!['requested', 'scheduled'].includes(sessionStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'New consultations must be requested or scheduled.' });
    }
    if (!patientRequest && !canManageMeeting && (sessionStatus !== 'requested' || req.body?.meetingUrl)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Only the assigned clinician or an administrator can schedule a consultation room.' });
    }
    const meetingDetails = buildTeleconsultMeetingDetails();
    const sessionStartAt = sessionStatus === 'scheduled' ? parseSchedule(req.body?.startAt) : null;
    const sessionEndAt = null;
    const triggeredFromMessageId = patientRequest ? null : req.body?.triggeredFromMessageId || null;
    const additionalParticipants = patientRequest ? [] : Array.isArray(req.body?.participantIds) ? req.body.participantIds : [];

    let thread = existingThread || null;
    if (!thread) {
      const threadResult = await client.query(
        `INSERT INTO conversation_threads (thread_type, title, patient_id, created_by, status, priority, last_message_at)
         VALUES ('tele_consult', $1, $2, $3, 'open', 'high', NOW())
         RETURNING *`,
        [threadTitle, patientRecord.id, req.user.id]
      );
      thread = threadResult.rows[0];
    } else {
      const threadUpdate = await client.query(
        `UPDATE conversation_threads
         SET thread_type = 'tele_consult',
             title = $1,
             patient_id = COALESCE(patient_id, $2),
             status = 'open',
             priority = CASE WHEN priority = 'urgent' THEN 'urgent' ELSE 'high' END,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [threadTitle, patientRecord.id, thread.id]
      );
      thread = threadUpdate.rows[0];
    }

    const participantIds = dedupeIds([
      patientUserId,
      clinician.id,
      req.user.id,
      ...(existingThread?.participants || []).map((participant) => participant.id),
      ...additionalParticipants,
    ]);
    const validParticipants = await client.query(
      `SELECT id FROM users WHERE id = ANY($1) AND is_active = true`,
      [participantIds]
    );
    const validParticipantIds = dedupeIds(validParticipants.rows.map((row) => row.id));

    for (const participantId of validParticipantIds) {
      await client.query(
        `INSERT INTO conversation_participants (thread_id, user_id, last_read_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = COALESCE(conversation_participants.last_read_at, EXCLUDED.last_read_at)`,
        [thread.id, participantId, participantId === req.user.id ? new Date() : null]
      );
    }

    const sessionResult = await client.query(
        `INSERT INTO tele_consult_sessions (
           thread_id, patient_id, requested_by, clinician_id, trigger_source,
           clinical_trigger, reason, meeting_provider, meeting_url, meeting_code,
           status, start_at, end_at, triggered_from_message_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          thread.id,
          patientRecord.id,
          req.user.id,
          clinician.id,
          triggerSource,
          clinicalTrigger,
          reason,
          meetingDetails.meetingProvider,
          meetingDetails.meetingUrl,
          meetingDetails.meetingCode,
          sessionStatus,
          sessionStartAt,
          sessionEndAt,
          triggeredFromMessageId,
        ]
      );
    const teleconsultSession = sessionResult.rows[0];

    const initialMessage = (req.body?.initialMessage || req.body?.body || '').trim() || `Tele-consult opened for ${patientName || 'the patient'} with ${clinicianName || 'the clinician'}. ${reason}`;
    const messageResult = await client.query(
      `INSERT INTO conversation_messages (
         thread_id, sender_id, body, message_type, message_category, teleconsult_session_id
       )
       VALUES ($1, $2, $3, 'comment', 'teleconsult', $4)
       RETURNING id, thread_id, sender_id, body, message_type, message_category, created_at`,
      [thread.id, req.user.id, initialMessage, teleconsultSession.id]
    );

    await client.query(
      `UPDATE conversation_threads
       SET last_message_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [thread.id]
    );

    await createNotifications(client, {
      userIds: validParticipantIds.filter((id) => id !== req.user.id),
      title: 'Telehealth consultation request',
      body: 'A consultation request has been recorded. Open Telehealth for its details.',
      createdBy: req.user.id,
      metadata: {
        threadId: thread.id,
        teleconsultSessionId: teleconsultSession.id,
        patientId: patientRecord.id,
        clinicianId: clinician.id,
        category: 'teleconsult',
      },
    });

    await recordSecurityAudit({
      client,
      staffId: staffProfile?.staffId || null,
      actionPerformed: 'TELECONSULT_CREATED',
      entityType: 'tele_consult_session',
      entityId: teleconsultSession.id,
      deviceIp: req.ip,
      authMethod: req.user.role === 'patient' ? 'Password' : (req.stepUp?.authMethod || 'Password'),
      credentialStrength: req.user.role === 'patient' ? 'Base' : (req.stepUp?.credentialStrength || 'Step_Up'),
      requestId: req.requestId || null,
      details: {
        threadId: thread.id,
        patientId: patientRecord.id,
        clinicianId: clinician.id,
        meetingProvider: meetingDetails.meetingProvider,
        sessionStatus,
        triggerSource,
        messageId: messageResult.rows[0].id,
      },
    });

    await client.query('COMMIT');

    const detail = await fetchThreadDetail(client, thread.id, req.user.id);
    res.status(existingThread ? 200 : 201).json({
      success: true,
      message: 'Tele-consult session created',
      data: {
        thread: detail,
        teleconsultSession,
        meetingUrl: teleconsultSession.meeting_url,
        meetingCode: teleconsultSession.meeting_code,
      },
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    next(err);
  } finally {
    client?.release();
  }
};

// Lifecycle controls remain separate from admission to the embedded call.
const updateTeleconsultSession = async (req, res, next) => {
  let client;
  try {
    if (!['admin', 'doctor', 'midwife'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only an administrator or the assigned clinician can manage a consultation.' });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id || '')) {
      return res.status(404).json({ success: false, message: 'Consultation not found or access denied' });
    }
    const staffProfile = await getStaffSecurityContext(req.user.id);
    if (!staffProfile?.isVerified) {
      return res.status(403).json({ success: false, message: 'Verified staff credentials are required to manage consultations.', code: 'STAFF_CREDENTIAL_REQUIRED' });
    }
    try { resolveStepUpContext(req, 'teleconsult'); } catch (error) {
      return res.status(403).json({ success: false, message: error.message || 'Step-up authentication required', code: error.message?.includes('purpose') ? 'STEP_UP_PURPOSE_MISMATCH' : 'STEP_UP_REQUIRED', requestId: req.requestId || null });
    }
    client = await getClient();
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM tele_consult_sessions WHERE id = $1 FOR UPDATE', [req.params.id]);
    const session = result.rows[0];
    const thread = session ? await fetchThreadDetail(client, session.thread_id, req.user.id) : null;
    if (!session || !thread || (req.user.role !== 'admin' && session.clinician_id !== req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Consultation not found or access denied' });
    }
    const update = prepareTeleconsultUpdate(session, req.body);
    if (['completed', 'cancelled'].includes(update.status) && managedRoomNameForSession(session)) {
      // Delete first to expel active participants. A provider failure rolls back
      // the status change, so the clinic never sees a falsely closed call.
      await dailyVideo.closeRoom(session.id, thread.participants.map((person) => person.id));
    }
    const saved = await client.query(
      `UPDATE tele_consult_sessions
       SET status = $2, meeting_provider = $3, meeting_url = $4, meeting_code = $5,
           start_at = $6, end_at = $7, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [session.id, update.status, update.meetingProvider, update.meetingUrl, update.meetingCode, update.startAt, update.endAt]
    );
    await recordSecurityAudit({ client, staffId: staffProfile.staffId, actionPerformed: 'TELECONSULT_UPDATED', entityType: 'tele_consult_session', entityId: session.id, deviceIp: req.ip, authMethod: req.stepUp?.authMethod || 'Password', credentialStrength: req.stepUp?.credentialStrength || 'Step_Up', requestId: req.requestId || null, details: { previousStatus: session.status, status: update.status, provider: update.meetingProvider } });
    await createNotifications(client, {
      userIds: thread.participants.map((person) => person.id).filter((id) => id !== req.user.id),
      title: 'Telehealth consultation updated',
      body: 'The clinic updated a consultation. Open Telehealth for the schedule and next steps.',
      createdBy: req.user.id,
      metadata: { threadId: session.thread_id, teleconsultSessionId: session.id, category: 'teleconsult' },
    });
    await client.query('COMMIT');
    return res.json({ success: true, data: saved.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    next(error);
  } finally { client?.release(); }
};

const getTeleconsultVideoStatus = (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ success: true, data: { provider: 'daily', configured: dailyVideo.configured() } });
};

const joinTeleconsultVideo = async (req, res, next) => {
  let client;
  res.set('Cache-Control', 'no-store');
  try {
    if (!['patient', ...STAFF_ROLES].includes(req.user.role) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id || '')) {
      return res.status(404).json({ success: false, message: 'Consultation not found or access denied' });
    }
    client = await getClient();
    await client.query('BEGIN');
    // The lock prevents multiple participants provisioning competing rooms and
    // serializes admission against cancellation/completion.
    const result = await client.query('SELECT * FROM tele_consult_sessions WHERE id = $1 FOR UPDATE', [req.params.id]);
    const session = result.rows[0];
    const thread = session ? await fetchThreadDetail(client, session.thread_id, req.user.id) : null;
    const patient = session && thread && req.user.role === 'patient' ? await getPatientRecordByUser(client, req.user.id) : null;
    if (!session || !thread || (req.user.role === 'patient' && (!patient || session.patient_id !== patient.id))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Consultation not found or access denied' });
    }
    if (!['scheduled', 'active'].includes(session.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Video calling is available only for a scheduled or active consultation.' });
    }
    const room = await dailyVideo.ensureRoom(session.id);
    const admission = await dailyVideo.mintAdmission(room, { sessionId: session.id, userId: req.user.id, role: req.user.role });
    await client.query(
      `UPDATE tele_consult_sessions SET meeting_provider = 'external', meeting_url = $2,
       meeting_code = $3, updated_at = NOW() WHERE id = $1`,
      [session.id, room.url, room.name]
    );
    await client.query('COMMIT');
    // Tokens exist only in this no-store response. They are never persisted in
    // sessions, notifications, messages or security audit records.
    return res.json({ success: true, data: admission });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    next(error);
  } finally { client?.release(); }
};

const addMessage = async (req, res, next) => {
  const client = await getClient();

  try {
    const body = (req.body.body || '').trim();
    if (!body) {
      return res.status(400).json({ success: false, message: 'Message body is required' });
    }

    await client.query('BEGIN');

    const thread = await fetchThreadDetail(client, req.params.id, req.user.id);
    if (!thread) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Conversation not found or access denied' });
    }

    const messageCategory = sanitizeMessageCategory(req.body.messageCategory || (thread.thread_type === 'tele_consult' ? 'teleconsult' : 'general'));
    const messageType = sanitizeMessageType(req.body.messageType || (messageCategory === 'handoff' ? 'handoff' : 'comment'));
    const isClinicalNote = parseBoolean(req.body.isClinicalNote) || messageCategory === 'clinical_note';

    const messageResult = await client.query(
      `INSERT INTO conversation_messages (
         thread_id, sender_id, body, message_type, message_category, is_clinical_note
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, thread_id, sender_id, body, message_type, message_category, is_clinical_note, record_promotion_status, created_at`,
      [req.params.id, req.user.id, body, messageType, messageCategory, isClinicalNote]
    );

    await client.query(
      `UPDATE conversation_threads
       SET last_message_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    await client.query(
      `UPDATE conversation_participants
       SET last_read_at = NOW()
       WHERE thread_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    await createNotifications(client, {
      userIds: thread.participants.map((participant) => participant.id).filter((id) => id !== req.user.id),
      title: `New reply in ${thread.title}`,
      body: `${req.user.first_name} ${req.user.last_name}: ${body.slice(0, 140)}`,
      createdBy: req.user.id,
      metadata: { threadId: req.params.id, patientId: thread.patient_id || null, category: 'interaction_message' },
    });

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        ...messageResult.rows[0],
        sender_name: `${req.user.first_name} ${req.user.last_name}`,
        sender_role: req.user.role,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const promoteMessageToRecord = async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const staffProfile = await getStaffSecurityContext(req.user.id);
    if (!staffProfile || !staffProfile.isVerified) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'Verified staff credentials are required to promote a clinical message',
        requestId: req.requestId || null,
        code: 'STAFF_CREDENTIAL_REQUIRED',
      });
    }

    const messageResult = await client.query(
      `SELECT cm.id, cm.thread_id, cm.body, cm.message_type, cm.message_category,
              cm.is_clinical_note, cm.record_promotion_status, cm.record_promotion_at,
              cm.record_promotion_by,
              ct.patient_id, ct.thread_type, ct.title
       FROM conversation_messages cm
       JOIN conversation_threads ct ON ct.id = cm.thread_id
       WHERE cm.id = $1
         AND EXISTS (
           SELECT 1
           FROM conversation_participants cp
           WHERE cp.thread_id = ct.id AND cp.user_id = $2
         )
       LIMIT 1`,
      [req.params.id, req.user.id]
    );

    const message = messageResult.rows[0];
    if (!message) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Message not found or access denied',
        requestId: req.requestId || null,
      });
    }

    if (message.record_promotion_status === 'promoted') {
      await client.query('COMMIT');
      return res.json({
        success: true,
        message: 'Message is already promoted to the medical record',
        data: message,
      });
    }

    const updated = await client.query(
      `UPDATE conversation_messages
       SET message_category = 'clinical_note',
           is_clinical_note = true,
           record_promotion_status = 'promoted',
           record_promotion_at = NOW(),
           record_promotion_by = $2
       WHERE id = $1
       RETURNING id, thread_id, body, message_type, message_category,
                 is_clinical_note, record_promotion_status, record_promotion_at,
                 record_promotion_by, created_at`,
      [req.params.id, req.user.id]
    );

    await recordSecurityAudit({
      client,
      staffId: staffProfile.staffId,
      actionPerformed: 'MESSAGE_PROMOTED_TO_RECORD',
      entityType: 'conversation_message',
      entityId: req.params.id,
      deviceIp: req.ip,
      authMethod: req.stepUp?.authMethod || 'Password',
      credentialStrength: req.stepUp?.credentialStrength || 'Step_Up',
      requestId: req.requestId || null,
      details: {
        threadId: message.thread_id,
        threadType: message.thread_type,
        patientId: message.patient_id,
      },
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Clinical message promoted to the medical record',
      data: {
        ...updated.rows[0],
        thread_title: message.title,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const getTasks = async (req, res, next) => {
  try {
    const { status, includeCompleted } = req.query;
    const params = [];
    const conditions = [];
    let index = 1;

    if (req.user.role === 'patient') {
      const patientResult = await query('SELECT id FROM patients WHERE user_id = $1 LIMIT 1', [req.user.id]);
      if (patientResult.rows.length === 0) {
        return res.json({ success: true, data: [] });
      }

      conditions.push(`ct.patient_visible = true`);
      conditions.push(`(ct.assigned_to = $${index} OR ct.patient_id = $${index + 1})`);
      params.push(req.user.id, patientResult.rows[0].id);
      index += 2;
    } else if (req.user.role !== 'admin') {
      conditions.push(`(ct.assigned_to = $${index} OR ct.created_by = $${index})`);
      params.push(req.user.id);
      index += 1;
    }

    if (!includeCompleted) {
      conditions.push(`ct.status <> 'completed'`);
    }

    if (status) {
      conditions.push(`ct.status = $${index++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT ct.*,
          p.first_name || ' ' || p.last_name AS patient_name,
          assignee.first_name || ' ' || assignee.last_name AS assigned_to_name,
          assignee.role AS assigned_to_role,
          creator.first_name || ' ' || creator.last_name AS created_by_name,
          creator.role AS created_by_role,
          th.title AS thread_title
       FROM care_tasks ct
       LEFT JOIN patients p ON p.id = ct.patient_id
       LEFT JOIN users assignee ON assignee.id = ct.assigned_to
       LEFT JOIN users creator ON creator.id = ct.created_by
       LEFT JOIN conversation_threads th ON th.id = ct.thread_id
       ${whereClause}
       ORDER BY
         CASE ct.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
         ct.due_date NULLS LAST,
         ct.created_at DESC
       LIMIT 200`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const createTask = async (req, res, next) => {
  if (!STAFF_ROLES.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Only staff can create tasks' });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const {
      title,
      description,
      patientId,
      threadId,
      assignedTo,
      dueDate,
      patientVisible,
      priority,
    } = req.body;

    if (!title || !assignedTo) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'title and assignedTo are required' });
    }

    const assigneeResult = await client.query(
      `SELECT id, role FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
      [assignedTo]
    );
    if (assigneeResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Assignee not found' });
    }

    const assignee = assigneeResult.rows[0];
    let effectivePatientId = patientId || null;
    let effectivePatientVisible = Boolean(patientVisible);

    if (assignee.role === 'patient') {
      const patientRecord = await getPatientRecordByUser(client, assignee.id);
      if (!patientRecord) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Assigned patient does not have a patient profile' });
      }
      effectivePatientId = effectivePatientId || patientRecord.id;
      effectivePatientVisible = true;
    }

    if (effectivePatientId) {
      const patientRecord = await getPatientRecordById(client, effectivePatientId);
      if (!patientRecord) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Patient record not found' });
      }
    }

    const result = await client.query(
      `INSERT INTO care_tasks (
          title, description, patient_id, thread_id, assigned_to, created_by,
          status, priority, due_date, patient_visible
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9)
       RETURNING *`,
      [
        title.trim(),
        description?.trim() || null,
        effectivePatientId,
        threadId || null,
        assignedTo,
        req.user.id,
        sanitizePriority(priority),
        dueDate || null,
        effectivePatientVisible,
      ]
    );

    await createNotifications(client, {
      userIds: [assignedTo],
      title: `New task: ${title.trim()}`,
      body: `${req.user.first_name} ${req.user.last_name} assigned you a task.`,
      createdBy: req.user.id,
      metadata: { taskId: result.rows[0].id, patientId: effectivePatientId, category: 'care_task' },
    });

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const updateTask = async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const taskResult = await client.query('SELECT * FROM care_tasks WHERE id = $1 LIMIT 1', [req.params.id]);
    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const task = taskResult.rows[0];
    const isAdmin = req.user.role === 'admin';
    const isOwner = task.created_by === req.user.id;
    const isAssignee = task.assigned_to === req.user.id;
    const isPatientAssignee = req.user.role === 'patient' && isAssignee && task.patient_visible;

    if (!isAdmin && !isOwner && !isAssignee) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const updates = [];
    const values = [];
    let index = 1;

    if (req.body.status) {
      updates.push(`status = $${index++}`);
      values.push(sanitizeTaskStatus(req.body.status));
    }

    if (!isPatientAssignee && req.body.priority) {
      updates.push(`priority = $${index++}`);
      values.push(sanitizePriority(req.body.priority));
    }

    if (!isPatientAssignee && Object.prototype.hasOwnProperty.call(req.body, 'dueDate')) {
      updates.push(`due_date = $${index++}`);
      values.push(req.body.dueDate || null);
    }

    if (!isPatientAssignee && Object.prototype.hasOwnProperty.call(req.body, 'patientVisible')) {
      updates.push(`patient_visible = $${index++}`);
      values.push(Boolean(req.body.patientVisible));
    }

    if (req.body.completionNotes !== undefined) {
      updates.push(`completion_notes = $${index++}`);
      values.push(req.body.completionNotes || null);
    }

    if (req.body.acknowledged === true) {
      updates.push(`acknowledged_at = COALESCE(acknowledged_at, NOW())`);
    }

    const nextStatus = req.body.status ? sanitizeTaskStatus(req.body.status) : task.status;
    if (nextStatus === 'completed') {
      updates.push(`completed_at = COALESCE(completed_at, NOW())`);
    } else if (req.body.status && nextStatus !== 'completed') {
      updates.push(`completed_at = NULL`);
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No valid task fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await client.query(
      `UPDATE care_tasks
       SET ${updates.join(', ')}
       WHERE id = $${index}
       RETURNING *`,
      values
    );

    const updatedTask = result.rows[0];
    const notifyTargets = [updatedTask.created_by, updatedTask.assigned_to].filter((id) => id && id !== req.user.id);
    await createNotifications(client, {
      userIds: notifyTargets,
      title: `Task updated: ${updatedTask.title}`,
      body: `${req.user.first_name} ${req.user.last_name} updated the task status to ${updatedTask.status}.`,
      createdBy: req.user.id,
      metadata: { taskId: updatedTask.id, patientId: updatedTask.patient_id, category: 'care_task_update' },
    });

    await client.query('COMMIT');
    res.json({ success: true, data: updatedTask });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getDirectory,
  getThreads,
  getThreadById,
  markThreadRead,
  createThread,
  createTeleconsultSession,
  updateTeleconsultSession,
  getTeleconsultVideoStatus,
  joinTeleconsultVideo,
  addMessage,
  promoteMessageToRecord,
  getTasks,
  createTask,
  updateTask,
};
