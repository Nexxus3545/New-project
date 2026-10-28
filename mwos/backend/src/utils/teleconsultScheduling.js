const invalidInput = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const DURATIONS = new Set([15, 30, 45, 60]);

const parseDuration = (value = 30) => {
  if (!['number', 'string'].includes(typeof value) || !DURATIONS.has(Number(value))) throw invalidInput('Choose a consultation duration of 15, 30, 45, or 60 minutes.');
  return Number(value);
};

const parseSchedule = (value) => {
  if (typeof value !== 'string') throw invalidInput('A scheduled consultation requires a date and time with a timezone.');
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) throw invalidInput('Use a complete schedule date and time with a timezone.');
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6] || 0) > 59 || !Number.isFinite(Date.parse(value))) throw invalidInput('The consultation schedule is invalid.');
  return new Date(value).toISOString();
};

const futureSchedule = (value, now = new Date()) => {
  const startAt = parseSchedule(value instanceof Date ? value.toISOString() : value);
  if (Date.parse(startAt) <= now.getTime()) throw invalidInput('Choose a future consultation date and time.');
  return startAt;
};

const appointmentStartAt = (date, time) => {
  // node-postgres parses DATE at local midnight; preserve its calendar fields
  // before applying the clinic timezone instead of shifting through UTC.
  const dateValue = date instanceof Date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : String(date || '');
  const timeValue = String(time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(timeValue)) throw invalidInput('Use a valid appointment date and time.');
  return parseSchedule(`${dateValue}T${timeValue.slice(0, 8)}+08:00`);
};

// Every booking write takes this transaction lock before row locks. A single
// clinic-wide lock is deliberately simple: appointments and teleconsults cannot
// both pass a conflict check against an uncommitted booking in the other table.
const lockScheduling = (client) => client.query('SELECT pg_advisory_xact_lock(1297567571, 1)');

const findSchedulingConflicts = async (client, { clinicianId, patientId, startAt, durationMinutes = 30, excludeTeleconsultId = null, excludeAppointmentId = null }) => {
  const start = parseSchedule(startAt instanceof Date ? startAt.toISOString() : startAt);
  const duration = parseDuration(durationMinutes);
  const result = await client.query(
    `WITH scheduling_bookings AS (
       SELECT 'teleconsult'::text AS kind, start_at,
              start_at + make_interval(mins => COALESCE(duration_minutes, 30)) AS end_at
       FROM tele_consult_sessions
       WHERE status IN ('scheduled', 'active') AND start_at IS NOT NULL
         AND id IS DISTINCT FROM $5::uuid
         AND (clinician_id = $1::uuid OR patient_id = $2::uuid)
       UNION ALL
       SELECT 'appointment'::text AS kind,
              (scheduled_date + scheduled_time) AT TIME ZONE 'Asia/Manila' AS start_at,
              ((scheduled_date + scheduled_time) AT TIME ZONE 'Asia/Manila') + INTERVAL '30 minutes' AS end_at
       FROM appointments
       WHERE status IN ('scheduled', 'confirmed') AND id IS DISTINCT FROM $6::uuid
         AND (assigned_to = $1::uuid OR patient_id = $2::uuid)
     )
     SELECT kind, start_at AS "startAt", end_at AS "endAt" FROM scheduling_bookings
     WHERE start_at < $3::timestamptz + make_interval(mins => $4::int)
       AND end_at > $3::timestamptz
     ORDER BY start_at ASC LIMIT 100`,
    [clinicianId || null, patientId || null, start, duration, excludeTeleconsultId, excludeAppointmentId]
  );
  return result.rows.map((row) => ({ kind: row.kind, startAt: new Date(row.startAt).toISOString(), endAt: new Date(row.endAt).toISOString() }));
};

const assertSchedulingAvailable = async (client, slot) => {
  const conflicts = await findSchedulingConflicts(client, slot);
  if (conflicts.length) throw Object.assign(invalidInput('This time overlaps another booking for the patient or clinician. Choose another time.', 409), { code: 'SCHEDULE_CONFLICT', conflicts });
};

const sendSchedulingConflict = (res, error) => res.status(409).json({ success: false, code: 'SCHEDULE_CONFLICT', message: error.message, conflicts: error.conflicts });

module.exports = { parseSchedule, parseDuration, futureSchedule, appointmentStartAt, lockScheduling, findSchedulingConflicts, assertSchedulingAvailable, sendSchedulingConflict };
