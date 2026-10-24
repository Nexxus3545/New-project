const assert = require('node:assert/strict');
const { test, beforeEach, after } = require('node:test');
process.env.FRONTEND_URL = 'https://clinic.example.invalid';
const database = require('../src/config/database');
const mailer = require('../src/utils/mailer');
const saved = { query: database.query, getClient: database.getClient, sendMail: mailer.sendMail, configured: mailer.isEmailConfigured };
let held;
let appointment;
let events;
let messages;
let noticeCount;
let smtpReady;
let rejectMail;
let writes;
let committed;
let updateCount;
let verifiedRecipient;
let failReceipt;
const execute = async (sql, params = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (text === 'BEGIN') return { rows: [] };
  if (text === 'COMMIT') { committed = true; return { rows: [] }; }
  if (text === 'ROLLBACK') return { rows: [] };
  if (text.startsWith('SELECT id FROM patients')) return { rows: [{ id: 'patient-1' }] };
  if (text.startsWith('SELECT id FROM appointments')) return { rows: [] };
  if (text.startsWith('SELECT * FROM appointments')) return { rows: appointment ? [{ ...appointment }] : [] };
  if (text.startsWith('INSERT INTO appointments')) {
    writes += 1;
    appointment = { id: 'appointment-1', patient_id: params[0], appointment_type: params[3], scheduled_date: params[4], scheduled_time: params[5], notes: params[6], status: 'scheduled', updated_at: new Date('2026-10-24T00:00:00Z') };
    return { rows: [{ ...appointment }] };
  }
  if (text.startsWith('UPDATE appointments SET')) {
    writes += 1; updateCount += 1;
    appointment = { ...appointment, status: params[0] || appointment.status, notes: params[1] || appointment.notes, scheduled_date: params[2] || appointment.scheduled_date, scheduled_time: params[3] || appointment.scheduled_time, updated_at: new Date(1792800000000 + updateCount * 1000) };
    return { rows: [{ ...appointment }] };
  }
  if (text.startsWith('SELECT u.id')) {
    assert.doesNotMatch(text, /COALESCE\(oi\.provider_email, u\.email\)/, 'Do not send private schedules to editable unverified profile addresses');
    return { rows: [{ id: 'user-1', email: verifiedRecipient }] };
  }
  if (text.startsWith('INSERT INTO notification_email_events')) {
    if ([...events.values()].some((event) => event.key === params[1])) return { rows: [] };
    const event = { id: params[0], key: params[1], recipient: params[3], subject: params[4], text_body: params[5], delivery_status: params[6] };
    events.set(event.id, event); return { rows: [{ id: event.id }] };
  }
  if (text.startsWith('INSERT INTO notifications')) { noticeCount += 1; return { rows: [{ id: `notice-${noticeCount}` }] }; }
  if (text.startsWith('UPDATE notification_email_events SET notification_id')) return { rows: [] };
  if (text.startsWith('UPDATE notification_email_events SET delivery_status')) {
    if (text.includes("= 'sending'")) {
      const event = events.get(params[0]);
      if (event.delivery_status !== 'pending') return { rows: [] };
      event.delivery_status = 'sending'; return { rows: [event] };
    }
    const failed = text.includes("= 'failed'");
    if (!failed && failReceipt) throw new Error('Receipt database unavailable');
    events.get(failed ? params[1] : params[0]).delivery_status = failed ? 'failed' : 'accepted';
    return { rows: [] };
  }
  if (text.startsWith('SELECT delivery_status')) return { rows: [events.get(params[0])] };
  throw new Error(`Unexpected mocked query: ${text}`);
};
database.query = (...args) => { assert.equal(held, false); return execute(...args); };
database.getClient = async () => { assert.equal(held, false); held = true; committed = false; return { query: execute, release: () => { held = false; } }; };
mailer.isEmailConfigured = () => smtpReady;
mailer.sendMail = async (message) => { assert.equal(held, false); assert.equal(committed, true); messages.push(message); if (rejectMail) throw Object.assign(new Error('Rejected'), { code: 'SMTP_REJECTED' }); return { accepted: true }; };
const controller = require('../src/controllers/appointment.controller');
const { deliverNotification } = require('../src/utils/notificationEvents');
beforeEach(() => { held = false; appointment = null; events = new Map(); messages = []; noticeCount = 0; smtpReady = true; rejectMail = false; writes = 0; updateCount = 0; verifiedRecipient = 'patient@example.invalid'; failReceipt = false; });
after(async () => { database.query = saved.query; database.getClient = saved.getClient; mailer.sendMail = saved.sendMail; mailer.isEmailConfigured = saved.configured; await database.pool.end(); });
async function invoke(handler, body, role = 'patient') {
  const result = { status: 200 };
  const res = { status(code) { result.status = code; return this; }, json(payload) { result.payload = payload; } };
  await handler({ user: { id: 'user-1', role }, body, params: { id: 'appointment-1' } }, res, (error) => { throw error; });
  assert.equal(held, false);
  return result;
}
const create = () => invoke(controller.create, { patientId: 'patient-1', appointmentType: 'prenatal', scheduledDate: '2026-12-01', scheduledTime: '09:00', notes: 'SECRET-CLINICAL-NOTE' });

test('appointment creation commits one notification and sends a private, minimal email afterward', async () => {
  const result = await create();
  assert.equal(result.status, 201);
  assert.equal(result.payload.notification.email, 'accepted');
  assert.equal(noticeCount, 1);
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /December 1, 2026/);
  assert.match(messages[0].text, /09:00/);
  assert.doesNotMatch(messages[0].text, /SECRET-CLINICAL-NOTE|prenatal|pregnancy|diagnosis/i);
  await deliverNotification([...events.keys()][0]);
  assert.equal(messages.length, 1, 'A claimed/accepted event cannot send twice');
});

test('real schedule/status changes notify, repeated states and note-only edits do not', async () => {
  await create();
  await invoke(controller.update, { status: 'confirmed' }, 'doctor');
  assert.equal(messages.length, 2);
  await invoke(controller.update, { status: 'confirmed' }, 'doctor');
  await invoke(controller.update, { notes: 'private revised note' }, 'doctor');
  assert.equal(messages.length, 2);
  await invoke(controller.update, { scheduledDate: '2026-12-02', scheduledTime: '10:00' }, 'doctor');
  assert.equal(messages.length, 3);
  await invoke(controller.update, { status: 'cancelled' });
  assert.equal(messages.length, 4);
  assert.match(messages[3].text, /cancelled/);
});

test('unavailable/rejected email never loses or falsely fails a saved appointment', async () => {
  smtpReady = false;
  const unavailable = await create();
  assert.equal(unavailable.status, 201);
  assert.equal(unavailable.payload.notification.email, 'unconfigured');
  assert.equal(messages.length, 0);
  assert.equal(noticeCount, 1);
  smtpReady = true; rejectMail = true;
  const rejected = await invoke(controller.update, { status: 'confirmed' }, 'doctor');
  assert.equal(rejected.status, 200);
  assert.equal(rejected.payload.notification.email, 'failed');
  assert.equal(appointment.status, 'confirmed');
});

test('patients cannot authorize a confirmed/completed status or produce its email', async () => {
  await create();
  assert.equal((await invoke(controller.update, { status: 'confirmed' })).status, 403);
  assert.equal((await invoke(controller.update, { status: 'completed' })).status, 403);
  assert.equal(messages.length, 1);
});

test('unverified recipients receive only an in-app notification, not a private email', async () => {
  verifiedRecipient = null;
  const result = await create();
  assert.equal(result.status, 201);
  assert.equal(result.payload.notification.email, 'no_verified_recipient');
  assert.equal(messages.length, 0);
  assert.equal(noticeCount, 1);
});

test('accepted mail with an unavailable receipt is ambiguous, never falsely failed or resent', async () => {
  failReceipt = true;
  const result = await create();
  assert.equal(result.status, 201);
  assert.equal(result.payload.notification.email, 'unknown');
  assert.equal([...events.values()][0].delivery_status, 'sending');
  await deliverNotification([...events.keys()][0]);
  assert.equal(messages.length, 1);
});
