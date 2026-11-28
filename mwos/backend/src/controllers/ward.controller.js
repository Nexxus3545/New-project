const { query } = require('../config/database');
const { manilaDateKey } = require('../middleware/professionalCredential');
const { choice, date, fail, text, uuid } = require('../utils/workflowValidation');

const WARD_STAFF = ['admin', 'doctor', 'nurse', 'midwife'];
const WARD_CATEGORIES = ['medication', 'meal', 'operations'];

// An open walk-in is not a ward admission. A ward-stage visit takes
// precedence over an incomplete labor record when both identify one patient.
const ADMISSION_CANDIDATES = `
  SELECT visit.patient_id, visit.created_at AS admitted_at, visit.stage, 1 AS source_priority
  FROM patient_visits visit
  WHERE visit.status = 'open' AND visit.created_at <= NOW()
    AND visit.stage IN ('labor_monitoring', 'delivery', 'postnatal_monitoring', 'newborn_monitoring')
  UNION ALL
  SELECT delivery.patient_id,
    COALESCE(delivery.labor_started_at, delivery.delivery_date::timestamp AT TIME ZONE 'Asia/Manila'),
    'labor_admission',
    2
  FROM deliveries delivery
  JOIN pregnancies pregnancy ON pregnancy.id = delivery.pregnancy_id
    AND pregnancy.patient_id = delivery.patient_id AND pregnancy.status = 'active'
  WHERE delivery.birth_recorded IS FALSE
    AND COALESCE(delivery.status, 'active') = 'active'
    AND delivery.delivery_date <= (NOW() AT TIME ZONE 'Asia/Manila')::date
    AND (delivery.labor_started_at IS NULL OR delivery.labor_started_at <= NOW())
`;

const ASSIGNMENT_RESULT = `id, patient_id, assigned_to, title, description, ward_category AS category,
  due_date::text AS due_date, TO_CHAR(ward_due_time, 'HH24:MI') AS due_time, status, completed_at`;

async function getWard(req, res, next) {
  try {
    const wardDate = date(req.query.date ?? manilaDateKey(), 'Ward date');
    const [admissions, tasks, staff] = await Promise.all([
      query(`
        WITH candidates AS (${ADMISSION_CANDIDATES}),
        admitted AS (
          SELECT patient_id, MIN(admitted_at) AS admitted_at,
            (ARRAY_AGG(stage ORDER BY source_priority, admitted_at DESC, stage))[1] AS stage
          FROM candidates GROUP BY patient_id
        )
        SELECT (ROW_NUMBER() OVER (ORDER BY admitted.admitted_at, patient.id))::int AS number,
          patient.id AS patient_id, patient.patient_code,
          CONCAT_WS(' ', patient.first_name, patient.last_name, patient.suffix) AS patient_name,
          admitted.admitted_at, admitted.stage
        FROM admitted JOIN patients patient ON patient.id = admitted.patient_id AND patient.is_active
        ORDER BY admitted.admitted_at, patient.id
      `),
      query(`
        SELECT task.id, task.patient_id, task.title, task.description, task.status, task.completed_at,
          task.ward_category AS category, task.due_date::text AS due_date,
          TO_CHAR(task.ward_due_time, 'HH24:MI') AS due_time, task.assigned_to,
          NULLIF(CONCAT_WS(' ', patient.first_name, patient.last_name, patient.suffix), '') AS patient_name,
          NULLIF(CONCAT_WS(' ', staff.first_name, staff.last_name), '') AS assigned_to_name,
          COALESCE(task.status IN ('open', 'in_progress')
            AND ($3 OR task.assigned_to = $2 OR task.created_by = $2), FALSE) AS can_complete
        FROM care_tasks task
        LEFT JOIN patients patient ON patient.id = task.patient_id
        LEFT JOIN users staff ON staff.id = task.assigned_to
        WHERE task.ward_category IS NOT NULL AND task.due_date = $1
        ORDER BY task.ward_due_time NULLS LAST, task.created_at, task.id
      `, [wardDate, req.user.id, req.user.role === 'admin']),
      query(`
        SELECT id, CONCAT_WS(' ', first_name, last_name) AS name, role
        FROM users
        WHERE is_active AND role = ANY($1::text[])
        ORDER BY last_name, first_name, id
      `, [WARD_STAFF]),
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { date: wardDate, admissions: admissions.rows, tasks: tasks.rows, staff: staff.rows } });
  } catch (error) {
    next(error);
  }
}

async function createWardTask(req, res, next) {
  try {
    const body = req.body || {};
    const patientId = uuid(body.patientId, 'Admitted patient');
    const assignedTo = uuid(body.assignedTo, 'Assigned staff');
    const category = choice(body.category, 'task category', WARD_CATEGORIES);
    const title = text(body.title, 'Task title', 120, true);
    const description = text(body.description, 'Task notes', 500);
    const dueDate = date(body.dueDate, 'Task date');
    const dueTime = body.dueTime || null;
    if (dueTime !== null && (typeof dueTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueTime))) {
      fail('Enter a valid time in HH:mm format.');
    }

    // The assignment and audit write commit together. The task only
    // coordinates a team assignment against an existing clinical order.
    const result = await query(`
      WITH candidates AS (${ADMISSION_CANDIDATES}),
      eligible AS (
        SELECT patient.id AS patient_id, staff.id AS assigned_to
        FROM patients patient CROSS JOIN users staff
        WHERE patient.id = $1 AND patient.is_active AND staff.id = $2 AND staff.is_active
          AND staff.role = ANY($9::text[])
          AND EXISTS (SELECT 1 FROM candidates WHERE patient_id = patient.id)
        FOR SHARE OF patient, staff
      ),
      saved AS (
        INSERT INTO care_tasks
          (patient_id, assigned_to, ward_category, title, description, due_date,
            ward_due_time, created_by, patient_visible)
        SELECT patient_id, assigned_to, $3, $4, $5, $6, $7, $8, FALSE FROM eligible
        RETURNING ${ASSIGNMENT_RESULT}
      ),
      audited AS (
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, request_id)
        SELECT $8, 'ward_task_assigned', 'care_tasks', id, $10 FROM saved
      )
      SELECT * FROM saved
    `, [patientId, assignedTo, category, title, description, dueDate, dueTime, req.user.id, WARD_STAFF, req.requestId || null]);
    if (!result.rows.length) fail('Choose a patient currently on the ward and an active staff member.', 409);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function completeWardTask(req, res, next) {
  try {
    const taskId = uuid(req.params.id, 'Ward task');
    const params = [taskId, req.user.id, req.user.role === 'admin'];
    const access = 'ward_category IS NOT NULL AND id = $1 AND ($3 OR assigned_to = $2 OR created_by = $2)';
    const result = await query(`
      WITH saved AS (
        UPDATE care_tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE ${access} AND status IN ('open', 'in_progress')
        RETURNING ${ASSIGNMENT_RESULT}
      ),
      audited AS (
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, request_id)
        SELECT $2, 'ward_task_completed', 'care_tasks', id, $4 FROM saved
      )
      SELECT * FROM saved
    `, [...params, req.requestId || null]);
    const saved = result.rows[0];
    if (saved) return res.json({ success: true, data: saved });

    // A repeated completion after a successful request returns the same row.
    const existing = (await query(`SELECT ${ASSIGNMENT_RESULT} FROM care_tasks WHERE ${access}`, params)).rows[0];
    if (!existing) fail('Ward task is unavailable to this account.', 404);
    if (existing.status !== 'completed') fail('This ward assignment can no longer be completed.', 409);
    res.json({ success: true, data: existing });
  } catch (error) {
    next(error);
  }
}

module.exports = { WARD_STAFF, getWard, createWardTask, completeWardTask };
