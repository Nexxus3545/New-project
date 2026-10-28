const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const helpers = require('../src/utils/teleconsult');
const videoHelpers = require('../src/utils/dailyVideo');
const scheduling = require('../src/utils/teleconsultScheduling');

test('appointment DATE values preserve their Manila calendar day before timezone conversion', () => {
  const { execFileSync } = require('node:child_process');
  const modulePath = require.resolve('../src/utils/teleconsultScheduling');
  const output = execFileSync(process.execPath, ['-e', `
    const { appointmentStartAt } = require(${JSON.stringify(modulePath)});
    const date = new Date(2030, 5, 14);
    process.stdout.write(JSON.stringify([
      appointmentStartAt(date, '10:00:00'),
      appointmentStartAt('2030-06-14', '10:00')
    ]));
  `], { env: { ...process.env, TZ: 'Asia/Manila' }, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), ['2030-06-14T02:00:00.000Z', '2030-06-14T02:00:00.000Z']);
});

const patientUser = '11111111-1111-4111-8111-111111111111';
const clinician = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const threadId = '44444444-4444-4444-8444-444444444444';
const patientId = '55555555-5555-4555-8555-555555555555';
const outsider = '66666666-6666-4666-8666-666666666666';
const meet = 'https://meet.google.com/abc-defg-hij';
const roomName = videoHelpers.roomNameForSession(sessionId);
const dailyUrl = `https://mwos-test.daily.co/${roomName}`;

function harness(options = {}) {
  let acquired = false;
  let committed = false;
  let rolledBack = false;
  let released = false;
  let candidate;
  let notifications = 0;
  let audits = 0;
  let actor;
  const videoCalls = { ensure: 0, mint: 0, delete: 0 };
  const queries = [];
  const session = { id: sessionId, thread_id: threadId, patient_id: patientId, clinician_id: clinician,
    status: options.status || 'requested', meeting_provider: 'external', meeting_url: options.meetingUrl ?? '', meeting_code: null,
    start_at: options.startAt || null, end_at: null, preferred_start_at: options.preferredStartAt || null, duration_minutes: options.durationMinutes || 30,
    ...(options.dailyRoom ? { meeting_url: dailyUrl, meeting_code: roomName } : {}) };
  if (options.otherPatient) session.patient_id = outsider;
  const participants = [patientUser, clinician, ...(options.adminParticipant ? [outsider] : [])];
  const own = { id: patientId, user_id: patientUser, first_name: 'Synthetic', last_name: 'Patient' };
  const query = async (sql, params = []) => {
    queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    const text = queries.at(-1).sql;
    if (text === 'BEGIN') return { rows: [] };
    if (text === 'COMMIT') { committed = true; if (candidate) Object.assign(session, candidate); return { rows: [] }; }
    if (text === 'ROLLBACK') { rolledBack = true; candidate = null; return { rows: [] }; }
    if (text.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] };
    if (text.startsWith('WITH scheduling_bookings')) return { rows: options.conflicts || [] };
    if (text.startsWith('SELECT tcs.id, tcs.thread_id')) {
      const row = candidate || session;
      return { rows: [{ id: row.id, thread_id: row.thread_id, patient_name: 'Synthetic Patient', clinician_id: row.clinician_id, clinician_name: 'Synthetic Clinician', reason: 'Sensitive reason', status: row.status, preferred_start_at: row.preferred_start_at, start_at: row.start_at, duration_minutes: row.duration_minutes, created_at: '2026-10-28T00:00:00Z' }] };
    }
    if (text.startsWith('SELECT id, first_name, last_name, role, is_active FROM users')) return { rows: options.missingClinician ? [] : [{ id: clinician, role: options.clinicianRole || 'doctor', is_active: !options.inactiveClinician, first_name: 'Synthetic', last_name: 'Clinician' }] };
    if (text.startsWith('SELECT id, first_name, last_name, user_id FROM patients WHERE user_id')) return { rows: options.noOwnPatient ? [] : [own] };
    if (text.startsWith('SELECT id, first_name, last_name, user_id FROM patients WHERE id')) return { rows: options.missingPatient ? [] : [own] };
    if (text.startsWith('SELECT id FROM conversation_threads')) return { rows: [{ id: threadId }] };
    if (text.startsWith('SELECT id FROM tele_consult_sessions WHERE thread_id')) return { rows: options.existingSession ? [{ id: sessionId }] : [] };
    if (text.startsWith('SELECT * FROM tele_consult_sessions WHERE id')) return { rows: options.missingSession ? [] : [session] };
    if (text.startsWith('SELECT ct.*')) {
      if (options.inaccessible || !participants.includes(actor.id)) return { rows: [] };
      return { rows: [{ id: threadId, thread_type: options.existingType || 'tele_consult', patient_id: options.foreignThread ? outsider : patientId, title: 'Synthetic consultation', ...Object.fromEntries(Object.entries(candidate || session).map(([key, value]) => ['teleconsult_' + (key === 'id' ? 'session_id' : key), value])) }] };
    }
    if (text.startsWith('SELECT u.id, u.first_name')) return { rows: participants.map((id) => ({ id })) };
    if (text.startsWith('SELECT cm.id, cm.body')) return { rows: [] };
    if (text.startsWith('INSERT INTO conversation_threads')) return { rows: [{ id: threadId, title: params[0] }] };
    if (text.startsWith('UPDATE conversation_threads SET thread_type')) return { rows: [{ id: threadId }] };
    if (text.startsWith('SELECT id FROM users WHERE id')) return { rows: params[0].map((id) => ({ id })) };
    if (text.startsWith('INSERT INTO conversation_participants')) return { rows: [] };
    if (text.startsWith('INSERT INTO tele_consult_sessions')) {
      candidate = { ...session, patient_id: params[1], requested_by: params[2], clinician_id: params[3], meeting_provider: params[7], meeting_url: params[8], meeting_code: params[9], status: params[10], start_at: params[11], end_at: params[12], preferred_start_at: params[14], duration_minutes: params[15] };
      return { rows: [candidate] };
    }
    if (text.startsWith("UPDATE tele_consult_sessions SET status = 'scheduled'")) {
      candidate = { ...session, status: 'scheduled', start_at: params[1], duration_minutes: params[2], end_at: null };
      return { rows: [candidate] };
    }
    if (text.startsWith('UPDATE tele_consult_sessions SET status')) {
      candidate = { ...session, status: params[1], meeting_provider: params[2], meeting_url: params[3], meeting_code: params[4], start_at: params[5], end_at: params[6], duration_minutes: params[7] };
      return { rows: [candidate] };
    }
    if (text.startsWith("UPDATE tele_consult_sessions SET meeting_provider")) {
      candidate = { ...session, meeting_provider: 'external', meeting_url: params[1], meeting_code: params[2] };
      return { rows: [candidate] };
    }
    if (text.startsWith('INSERT INTO conversation_messages')) return { rows: [{ id: 'synthetic-message' }] };
    if (text.startsWith('INSERT INTO security_audit')) { if (options.failAudit) throw Error('Synthetic audit failure'); audits++; return { rows: [] }; }
    if (text.startsWith('UPDATE conversation_threads SET last_message_at')) return { rows: [] };
    if (text.startsWith('INSERT INTO notifications')) {
      if (options.failNotification) throw Error('Synthetic notification failure');
      assert.equal(JSON.stringify(params).includes(meet), false, 'Notifications do not disclose meeting URLs');
      assert.equal(JSON.stringify(params).includes('Sensitive reason'), false, 'Notifications do not disclose the consultation reason');
      notifications++;
      return { rows: [] };
    }
    throw Error('Unexpected query: ' + text);
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/interaction.controller.js'), 'utf8'), {
    module, exports: module.exports, Date, Set, JSON, console,
    require: (name) => {
      if (name === '../config/database') return { query: async (...args) => { assert.equal(acquired, false, 'No nested pool query'); return query(...args); }, getClient: async () => { acquired = true; return { query, release: () => { released = true; } }; } };
      if (name === 'node:crypto') return require(name);
      if (name === '../utils/teleconsult') return helpers;
      if (name === '../utils/teleconsultScheduling') return scheduling;
      if (name === '../utils/dailyVideo') return {
        managedRoomNameForSession: videoHelpers.managedRoomNameForSession,
        dailyVideo: {
          configured: () => true,
          ensureRoom: async () => { videoCalls.ensure++; if (options.failVideo) throw Error('Video temporarily unavailable'); return { name: roomName, url: dailyUrl, expiresAt: 1793200000 }; },
          mintAdmission: async (room, identity) => { videoCalls.mint++; assert.equal(identity.userId, actor.id); return { provider: 'daily', roomUrl: room.url, token: 'synthetic.admission.token', expiresAt: '2026-10-28T10:10:00Z', roomExpiresAt: '2026-10-28T12:00:00Z' }; },
          deleteRoom: async () => { videoCalls.delete++; if (options.failVideo) throw Error('Video temporarily unavailable'); },
          closeRoom: async (id, participants) => { assert.equal(id, sessionId); assert.ok(participants.includes(patientUser)); videoCalls.delete++; if (options.failVideo) throw Error('Video temporarily unavailable'); },
        },
      };
      if (name === '../middleware/stepUp') return { resolveStepUpContext: (req) => { if (options.noStepUp) throw Error('Step-up authentication required'); req.stepUp = { authMethod: 'Passkey', credentialStrength: 'Step_Up' }; } };
      if (name === '../utils/security') return { getStaffSecurityContext: async () => { assert.equal(acquired, false, 'Credential lookup precedes transaction acquisition'); return { staffId: 'synthetic-staff', isVerified: !options.unverified }; }, recordSecurityAudit: async () => { audits++; } };
      throw Error('Unexpected require ' + name);
    },
  });
  return {
    invoke: async (action = 'update', body = {}, user = { id: clinician, role: 'doctor' }) => {
      actor = user; let status = 200, payload, failure;
      const responseHeaders = {};
      const res = { set: (key, value) => { responseHeaders[key] = value; return res; }, status: (code) => { status = code; return res; }, json: (data) => { payload = data; return res; } };
      const handler = { create: 'createTeleconsultSession', update: 'updateTeleconsultSession', join: 'joinTeleconsultVideo', videoStatus: 'getTeleconsultVideoStatus', review: 'getTeleconsultReview', availability: 'getTeleconsultAvailability', accept: 'acceptTeleconsultSession' }[action];
      await module.exports[handler]({ user, params: { id: sessionId }, query: body, body, headers: {}, ip: '127.0.0.1' }, res, (err) => { failure = err; });
      return { status, payload, failure, responseHeaders };
    },
    state: () => ({ acquired, committed, rolledBack, released, session, candidate, queries, notifications, audits, videoCalls }),
  };
}

test('Google Meet URLs are canonical, exact-host HTTPS code links only', () => {
  assert.equal(helpers.normalizeGoogleMeetUrl(meet + '?authuser=0#ignored'), meet);
  for (const value of ['javascript:alert(1)', 'http://meet.google.com/abc-defg-hij', 'https://meet.google.com.evil.test/abc-defg-hij', 'https://user:pass@meet.google.com/abc-defg-hij', 'https://meet.google.com:443/abc-defg-hij', 'https://meet.google.com:8443/abc-defg-hij', 'https://meet.google.com/lookup/alias', 'https://meet.google.com/abc-defg-hij/extra', 'https://meet.google.com/abc-defg-hij\\evil', null]) assert.throws(() => helpers.normalizeGoogleMeetUrl(value));
});

test('requests never invent a meeting room or leak patient information through a generated URL', () => {
  const empty = helpers.buildTeleconsultMeetingDetails({ title: 'Sensitive reason Patient Name', reason: 'Secret', threadId });
  assert.deepEqual(empty, { meetingProvider: 'external', meetingCode: null, meetingUrl: '' });
});

test('scheduling validates complete dates without a pasted room and preserves terminal lifecycle boundaries', () => {
  const requested = { status: 'requested', meeting_url: '' };
  assert.equal(helpers.prepareTeleconsultUpdate(requested, { status: 'scheduled', startAt: '2026-10-29T10:00:00+08:00' }).meetingUrl, '');
  for (const startAt of ['2026-02-30T10:00:00Z', '2026-10-28T25:00:00Z', '2026-10-28T10:00']) assert.throws(() => helpers.prepareTeleconsultUpdate(requested, { status: 'scheduled', meetingUrl: meet, startAt }));
  const scheduled = helpers.prepareTeleconsultUpdate(requested, { status: 'scheduled', meetingUrl: meet, startAt: '2026-10-29T10:00:00+08:00' });
  assert.equal(scheduled.startAt, '2026-10-29T02:00:00.000Z');
  assert.throws(() => helpers.prepareTeleconsultUpdate(requested, { status: 'active', meetingUrl: meet }));
  for (const status of ['completed', 'cancelled']) assert.throws(() => helpers.prepareTeleconsultUpdate({ status, meeting_url: meet }, { status: 'scheduled', startAt: '2026-10-29T10:00:00Z' }));
});

test('patient requests cannot self-approve, add participants, choose another patient or supply a video room', async () => {
  const app = harness();
  const result = await app.invoke('create', { clinicianId: clinician, patientId: outsider, reason: 'Sensitive reason', sessionStatus: 'active', startAt: '2026-10-29T10:00:00Z', endAt: '2026-10-29T12:00:00Z', meetingUrl: meet, participantIds: [outsider] }, { id: patientUser, role: 'patient' });
  assert.equal(result.failure, undefined);
  assert.equal(result.status, 201);
  const state = app.state();
  assert.equal(state.session.status, 'requested'); assert.equal(state.session.patient_id, patientId);
  assert.equal(state.session.start_at, null); assert.equal(state.session.end_at, null); assert.equal(state.session.meeting_url, '');
  const added = state.queries.filter((q) => q.sql.startsWith('INSERT INTO conversation_participants')).map((q) => q.params[1]);
  assert.equal(added.includes(outsider), false);
  assert.equal(state.committed, true); assert.equal(state.released, true);
});

test('a patient without an own profile cannot fall back to another patient ID', async () => {
  const app = harness({ noOwnPatient: true });
  const result = await app.invoke('create', { clinicianId: clinician, patientId: outsider, reason: 'Sensitive reason' }, { id: patientUser, role: 'patient' });
  assert.equal(result.status, 404); assert.equal(app.state().committed, false);
  assert.equal(app.state().queries.some((q) => q.sql.includes('FROM patients WHERE id')), false);
});

test('an existing consultation cannot be reset or rescheduled by recreating its thread', async () => {
  const app = harness({ existingSession: true });
  const result = await app.invoke('create', { clinicianId: clinician, threadId, reason: 'Sensitive reason' }, { id: patientUser, role: 'patient' });
  assert.equal(result.status, 409); assert.equal(app.state().committed, false);
});

test('patients, nurses, nonparticipants and unassigned clinicians cannot manage rooms', async () => {
  for (const role of ['patient', 'nurse']) {
    const app = harness(); assert.equal((await app.invoke('update', { status: 'scheduled' }, { id: patientUser, role })).status, 403);
    assert.equal(app.state().acquired, false);
  }
  const outsiderApp = harness();
  assert.equal((await outsiderApp.invoke('update', { status: 'scheduled' }, { id: outsider, role: 'doctor' })).status, 404);
  const unassigned = harness({ adminParticipant: true });
  assert.equal((await unassigned.invoke('update', { status: 'scheduled' }, { id: outsider, role: 'doctor' })).status, 404);
});

test('verified credentials and step-up remain required before holding a database connection', async () => {
  for (const options of [{ unverified: true }, { noStepUp: true }]) {
    const app = harness(options);
    const result = await app.invoke('update', { status: 'scheduled', meetingUrl: meet, startAt: '2026-10-29T10:00:00Z' });
    assert.equal(result.status, 403); assert.equal(app.state().acquired, false);
  }
});

test('assigned clinician scheduling is atomic, audited and notifies without room or reason disclosure', async () => {
  const app = harness();
  const result = await app.invoke('update', { status: 'scheduled', meetingUrl: meet + '?authuser=1', startAt: '2026-10-29T10:00:00+08:00' });
  assert.equal(result.failure, undefined); assert.equal(result.payload.data.meeting_url, '');
  const state = app.state(); assert.equal(state.committed, true); assert.equal(state.audits, 1); assert.equal(state.notifications, 1); assert.equal(state.released, true);
  assert.ok(state.queries.some((q) => q.sql.endsWith('FOR UPDATE')));
});

test('notification failure rolls back a session update rather than reporting success', async () => {
  const app = harness({ failNotification: true });
  const result = await app.invoke('update', { status: 'scheduled', meetingUrl: meet, startAt: '2026-10-29T10:00:00Z' });
  assert.ok(result.failure); assert.equal(app.state().committed, false); assert.equal(app.state().session.status, 'requested'); assert.equal(app.state().rolledBack, true);
});

test('activation preserves the confirmed schedule and completion uses the server end time', async () => {
  const now = new Date('2026-10-28T10:00:00Z');
  const active = helpers.prepareTeleconsultUpdate({ status: 'scheduled', meeting_url: meet, start_at: '2026-10-29T10:00:00Z' }, { status: 'active', endAt: '2040-01-01T00:00:00Z' }, now);
  assert.equal(active.startAt, '2026-10-29T10:00:00.000Z'); assert.equal(active.endAt, null);
  const completed = helpers.prepareTeleconsultUpdate({ status: 'active', meeting_url: meet, start_at: now.toISOString() }, { status: 'completed', endAt: '2040-01-01T00:00:00Z', startAt: '2040-01-01T00:00:00Z', meetingUrl: 'https://meet.google.com/xyz-abcd-efg' }, now);
  assert.equal(completed.endAt, now.toISOString());
  assert.equal(completed.startAt, now.toISOString());
  assert.equal(completed.meetingUrl, '');
});


test('legacy rooms can be cancelled or completed without validating or retaining unsafe old URLs', () => {
  for (const [from, status] of [['requested', 'cancelled'], ['scheduled', 'cancelled'], ['active', 'completed']]) {
    const result = helpers.prepareTeleconsultUpdate({ status: from, meeting_url: 'https://meet.jit.si/legacy-patient-title', start_at: null }, { status });
    assert.equal(result.meetingUrl, ''); assert.equal(result.meetingCode, null);
  }
  assert.equal(helpers.prepareTeleconsultUpdate({ status: 'requested', meeting_url: 'https://meet.jit.si/legacy' }, { status: 'scheduled', startAt: '2026-10-29T10:00:00Z' }).meetingUrl, '');
});


test('an administrator still needs thread participation and retains the existing verification gate', async () => {
  const admin = { id: outsider, role: 'admin' };
  assert.equal((await harness().invoke('update', { status: 'cancelled' }, admin)).status, 404);
  assert.equal((await harness({ adminParticipant: true, unverified: true }).invoke('update', { status: 'cancelled' }, admin)).status, 403);
  const app = harness({ adminParticipant: true });
  const result = await app.invoke('update', { status: 'scheduled', meetingUrl: meet, startAt: '2026-10-29T10:00:00Z' }, admin);
  assert.equal(result.failure, undefined); assert.equal(result.payload.data.status, 'scheduled');
});

test('cross-patient conversation conversion is rejected even if the caller is an existing participant', async () => {
  const app = harness({ existingType: 'care_team', foreignThread: true });
  const result = await app.invoke('create', { clinicianId: clinician, threadId, reason: 'Sensitive reason' }, { id: patientUser, role: 'patient' });
  assert.equal(result.status, 404); assert.equal(app.state().committed, false);
});

test('a verified assigned clinician schedules a call without saving client-provided external URLs', async () => {
  const app = harness();
  const result = await app.invoke('create', { clinicianId: clinician, patientId, reason: 'Sensitive reason', meetingUrl: meet, startAt: '2026-10-29T10:00:00+08:00', sessionStatus: 'scheduled' });
  assert.equal(result.failure, undefined); assert.equal(result.status, 201);
  assert.equal(app.state().session.status, 'scheduled'); assert.equal(app.state().session.meeting_url, '');
  assert.equal(app.state().session.start_at, '2026-10-29T02:00:00.000Z');
});

test('a patient joins only their scheduled call without staff credentials and receives an uncacheable admission', async () => {
  const app = harness({ status: 'scheduled', unverified: true, noStepUp: true });
  const result = await app.invoke('join', {}, { id: patientUser, role: 'patient' });
  assert.equal(result.failure, undefined); assert.equal(result.status, 200);
  assert.equal(result.responseHeaders['Cache-Control'], 'no-store');
  assert.equal(result.payload.data.provider, 'daily');
  const state = app.state();
  assert.equal(state.committed, true); assert.equal(state.released, true);
  assert.equal(state.session.meeting_url, dailyUrl); assert.equal(state.session.meeting_code, roomName);
  assert.equal(JSON.stringify(state.queries).includes('synthetic.admission.token'), false);
  assert.equal(state.audits, 0); assert.equal(state.notifications, 0);
  assert.ok(state.queries.some((entry) => entry.sql.endsWith('FOR UPDATE')));
});

test('nonmembers, other patients and unscheduled or terminal sessions cannot obtain provider tokens', async () => {
  for (const options of [{ inaccessible: true, status: 'scheduled' }, { missingSession: true, status: 'scheduled' }, { otherPatient: true, status: 'scheduled' }, { status: 'requested' }, { status: 'completed' }, { status: 'cancelled' }]) {
    const app = harness(options);
    const result = await app.invoke('join', {}, { id: patientUser, role: 'patient' });
    assert.equal(result.status, ['requested', 'completed', 'cancelled'].includes(options.status) ? 409 : 404);
    assert.equal(app.state().videoCalls.ensure, 0); assert.equal(app.state().videoCalls.mint, 0); assert.equal(app.state().committed, false);
  }
  const app = harness({ status: 'scheduled' });
  assert.equal((await app.invoke('join', {}, { id: outsider, role: 'admin' })).status, 404);
  assert.equal(app.state().videoCalls.ensure, 0);
});

test('participating care team members can join but room identity remains managed by the server', async () => {
  const app = harness({ status: 'active', dailyRoom: true, unverified: true });
  const result = await app.invoke('join', { meetingUrl: 'https://evil.test/room', token: 'attacker' });
  assert.equal(result.failure, undefined); assert.equal(result.payload.data.roomUrl, dailyUrl);
  assert.equal(app.state().session.status, 'active');
});

test('provider failure never commits or returns an admission token', async () => {
  const app = harness({ status: 'scheduled', failVideo: true });
  const result = await app.invoke('join');
  assert.ok(result.failure); assert.equal(result.payload, undefined);
  assert.equal(app.state().committed, false); assert.equal(app.state().rolledBack, true); assert.equal(app.state().released, true);
});

test('closing a managed call removes the provider room, while legacy calls require no provider action', async () => {
  for (const [status, target] of [['scheduled', 'cancelled'], ['active', 'completed']]) {
    const app = harness({ status, dailyRoom: true });
    const result = await app.invoke('update', { status: target });
    assert.equal(result.failure, undefined); assert.equal(app.state().videoCalls.delete, 1);
    assert.equal(app.state().session.status, target); assert.equal(app.state().session.meeting_url, '');
  }
  const legacy = harness({ status: 'scheduled', meetingUrl: meet });
  await legacy.invoke('update', { status: 'cancelled' });
  assert.equal(legacy.state().videoCalls.delete, 0);
});

test('failed provider cleanup keeps the consultation open and rolls back its status change', async () => {
  const app = harness({ status: 'active', dailyRoom: true, failVideo: true });
  const result = await app.invoke('update', { status: 'completed' });
  assert.ok(result.failure); assert.equal(app.state().session.status, 'active');
  assert.equal(app.state().committed, false); assert.equal(app.state().rolledBack, true);
});

test('authenticated video status reveals only provider availability and is not cached', async () => {
  const app = harness(); const result = await app.invoke('videoStatus');
  assert.deepEqual(JSON.parse(JSON.stringify(result.payload.data)), { provider: 'daily', configured: true });
  assert.equal(result.responseHeaders['Cache-Control'], 'no-store'); assert.equal(app.state().acquired, false);
});

test('patient preferences save a future requested time and allowed duration without confirming the slot', async () => {
  const preferredStartAt = new Date(Date.now() + 86400000).toISOString();
  const app = harness();
  const result = await app.invoke('create', { clinicianId: clinician, reason: 'Sensitive reason', preferredStartAt, durationMinutes: 45, sessionStatus: 'scheduled', startAt: preferredStartAt }, { id: patientUser, role: 'patient' });
  assert.equal(result.failure, undefined); assert.equal(result.status, 201);
  assert.equal(app.state().session.status, 'requested'); assert.equal(app.state().session.start_at, null);
  assert.equal(app.state().session.preferred_start_at, preferredStartAt); assert.equal(app.state().session.duration_minutes, 45);
  assert.equal(app.state().queries.some((q) => q.sql.startsWith('WITH scheduling_bookings')), false);
  for (const invalid of [{ preferredStartAt: '2000-01-01T00:00:00Z' }, { preferredStartAt: '2026-02-30T10:00:00Z' }, { preferredStartAt: false }, { durationMinutes: 90 }]) {
    const invalidApp = harness();
    const rejected = await invalidApp.invoke('create', { clinicianId: clinician, reason: 'Sensitive reason', ...invalid }, { id: patientUser, role: 'patient' });
    assert.equal(rejected.failure?.statusCode, 400); assert.equal(invalidApp.state().committed, false);
  }
});

test('only administrators can review the bounded scheduling DTO queue without private-thread membership', async () => {
  for (const role of ['patient', 'doctor', 'midwife', 'nurse']) {
    const app = harness(); assert.equal((await app.invoke('review', {}, { id: outsider, role })).status, 403);
    assert.equal(app.state().queries.length, 0);
  }
  const app = harness();
  const result = await app.invoke('review', {}, { id: outsider, role: 'admin' });
  assert.equal(result.failure, undefined); assert.equal(result.payload.data.length, 1);
  const fields = Object.keys(result.payload.data[0]);
  for (const field of ['meeting_url', 'meeting_code', 'messages', 'participants', 'token']) assert.equal(fields.includes(field), false);
  assert.ok(app.state().queries[0].sql.endsWith('LIMIT 100'));
  assert.equal(app.state().queries.some((q) => q.sql.startsWith('SELECT ct.*')), false);
});

test('availability is advisory and never discloses the conflicting patient or booking identifier', async () => {
  const startAt = new Date(Date.now() + 86400000).toISOString();
  const app = harness({ conflicts: [{ kind: 'appointment', startAt, endAt: new Date(Date.parse(startAt) + 1800000).toISOString(), patient_name: 'PRIVATE', id: 'PRIVATE-ID' }] });
  const result = await app.invoke('availability', { startAt, durationMinutes: '30' }, { id: outsider, role: 'admin' });
  assert.equal(result.failure, undefined); assert.equal(result.payload.data.available, false);
  assert.equal(result.payload.data.startAt, startAt); assert.equal(result.payload.data.durationMinutes, 30);
  assert.deepEqual(Object.keys(result.payload.data.conflicts[0]), ['kind', 'startAt', 'endAt']);
  assert.equal(JSON.stringify(result.payload).includes('PRIVATE'), false); assert.equal(app.state().committed, false);
});

test('admin acceptance requires step-up but no clinical license or conversation membership', async () => {
  const startAt = new Date(Date.now() + 86400000).toISOString();
  const app = harness({ preferredStartAt: startAt, durationMinutes: 45, unverified: true });
  const admin = { id: outsider, role: 'admin' };
  const result = await app.invoke('accept', { participantIds: [outsider] }, admin);
  assert.equal(result.failure, undefined); assert.equal(result.payload.data.status, 'scheduled');
  const state = app.state(); assert.equal(state.session.start_at, startAt); assert.equal(state.session.duration_minutes, 45);
  assert.equal(state.committed, true); assert.equal(state.audits, 1); assert.equal(state.notifications, 1);
  assert.equal(state.queries.some((q) => q.sql.startsWith('INSERT INTO conversation_participants') || q.sql.startsWith('SELECT ct.*')), false);
  const lock = state.queries.findIndex((q) => q.sql.startsWith('SELECT pg_advisory_xact_lock'));
  const row = state.queries.findIndex((q) => q.sql.endsWith('FOR UPDATE'));
  assert.ok(lock >= 0 && lock < row);
  assert.equal((await app.invoke('accept', { startAt }, admin)).payload.code, 'CONSULTATION_ALREADY_REVIEWED');
  const noStepUp = harness({ noStepUp: true, preferredStartAt: startAt });
  assert.equal((await noStepUp.invoke('accept', {}, admin)).status, 403); assert.equal(noStepUp.state().acquired, false);
  const wrongRole = harness(); assert.equal((await wrongRole.invoke('accept', { startAt })).status, 403); assert.equal(wrongRole.state().acquired, false);
});

test('acceptance rechecks availability under the lock and rejects changed or overlapping slots atomically', async () => {
  const startAt = new Date(Date.now() + 86400000).toISOString();
  const admin = { id: outsider, role: 'admin' };
  const conflicts = [{ kind: 'teleconsult', startAt, endAt: new Date(Date.parse(startAt) + 1800000).toISOString() }];
  for (const action of ['accept', 'update', 'create']) {
    const app = harness({ conflicts, preferredStartAt: startAt });
    const result = await app.invoke(action, { startAt, status: 'scheduled', sessionStatus: 'scheduled', clinicianId: clinician, patientId, reason: 'Sensitive reason' }, action === 'accept' ? admin : { id: clinician, role: 'doctor' });
    assert.equal(result.status, 409); assert.equal(result.payload.code, 'SCHEDULE_CONFLICT');
    assert.equal(app.state().committed, false); assert.equal(app.state().session.status, 'requested'); assert.equal(app.state().notifications, 0);
  }
  for (const failure of [{ failAudit: true }, { failNotification: true }]) {
    const app = harness({ preferredStartAt: startAt, ...failure });
    const result = await app.invoke('accept', {}, admin);
    assert.ok(result.failure); assert.equal(app.state().session.status, 'requested'); assert.equal(app.state().committed, false);
  }
});

test('admin acceptance rejects a removed patient or unavailable clinical assignment without booking', async () => {
  for (const options of [{ missingPatient: true }, { missingClinician: true }, { inactiveClinician: true }, { clinicianRole: 'nurse' }]) {
    const app = harness({ preferredStartAt: new Date(Date.now() + 86400000).toISOString(), ...options });
    const result = await app.invoke('accept', {}, { id: outsider, role: 'admin' });
    assert.equal(result.status, 409);
    assert.equal(result.payload.code, 'CONSULTATION_ASSIGNMENT_UNAVAILABLE');
    assert.equal(app.state().committed, false);
    assert.equal(app.state().notifications, 0);
    assert.equal(app.state().queries.some((entry) => entry.sql.startsWith('WITH scheduling_bookings')), false);
  }
});
