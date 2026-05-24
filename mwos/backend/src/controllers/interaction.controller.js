const { getClient, query } = require('../config/database');

const STAFF_ROLES = ['admin', 'doctor', 'midwife', 'nurse'];
const THREAD_TYPES = ['care_team', 'patient_support', 'handoff', 'announcement'];
const THREAD_STATUSES = ['open', 'resolved', 'archived'];
const TASK_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const sanitizePriority = (value) => (PRIORITIES.includes(value) ? value : 'normal');
const sanitizeThreadType = (value) => (THREAD_TYPES.includes(value) ? value : 'care_team');
const sanitizeThreadStatus = (value) => (THREAD_STATUSES.includes(value) ? value : 'open');
const sanitizeTaskStatus = (value) => (TASK_STATUSES.includes(value) ? value : 'open');

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
        p.first_name || ' ' || p.last_name AS patient_name
     FROM conversation_threads ct
     LEFT JOIN patients p ON p.id = ct.patient_id
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
      `SELECT cm.id, cm.body, cm.message_type, cm.created_at,
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
      `INSERT INTO conversation_threads (thread_type, title, patient_id, created_by, status, priority, last_message_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [threadType, resolvedTitle, patientId, req.user.id, status, priority]
    );
    const thread = threadResult.rows[0];

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

    const messageResult = await client.query(
      `INSERT INTO conversation_messages (thread_id, sender_id, body, message_type)
       VALUES ($1, $2, $3, 'comment')
       RETURNING id, thread_id, sender_id, body, message_type, created_at`,
      [req.params.id, req.user.id, body]
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
  addMessage,
  getTasks,
  createTask,
  updateTask,
};
