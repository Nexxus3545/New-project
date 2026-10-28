const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDailyVideoService, roomNameForSession, normalizeDailyRoomUrl, managedRoomNameForSession, roomProperties } = require('../src/utils/dailyVideo');
const { checkDailyConfiguration, safeDiagnostic } = require('../src/utils/checkDailyConfiguration');

const sessionId = '33333333-3333-4333-8333-333333333333';
const userId = '11111111-1111-4111-8111-111111111111';
const timestamp = Date.parse('2026-10-28T10:00:00Z');
const seconds = timestamp / 1000;
const name = roomNameForSession(sessionId);
const url = `https://mwos-test.daily.co/${name}`;
const room = () => ({ name, privacy: 'private', url, config: roomProperties(seconds) });
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.synthetic_signature';
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function harness(responses) {
  const calls = [];
  const service = createDailyVideoService({ apiKey: 'test-only-key', now: () => timestamp, fetchImpl: async (target, options) => {
    calls.push({ target, ...options, body: options.body ? JSON.parse(options.body) : undefined });
    const next = responses.shift();
    assert.ok(next, 'An unexpected provider request was made');
    if (next instanceof Error) throw next;
    return next;
  } });
  return { service, calls };
}

test('new rooms use opaque identifiers, private bounded configuration and a fixed API destination', async () => {
  const app = harness([reply(404), reply(200, room())]);
  const result = await app.service.ensureRoom(sessionId);
  assert.equal(result.url, url); assert.match(result.name, /^mwos-[a-f0-9]{32}$/);
  assert.equal(result.name.includes(sessionId), false);
  assert.equal(app.calls[1].target, 'https://api.daily.co/v1/rooms');
  assert.equal(app.calls[1].body.privacy, 'private');
  const props = app.calls[1].body.properties;
  assert.equal(props.exp, seconds + 7200); assert.equal(props.eject_at_room_exp, true);
  assert.equal(props.max_participants, 4); assert.equal(props.enable_knocking, false);
  assert.equal(props.enable_chat, false); assert.equal(props.enable_screenshare, false);
  assert.equal(props.enable_transcription_storage, false); assert.equal(props.permissions.canAdmin, false);
  assert.deepEqual(props.permissions.canSend, ['audio', 'video']);
  for (const call of app.calls) { assert.equal(call.redirect, 'error'); assert.ok(call.signal); }
});

test('repeated joins reuse a verified existing private room instead of creating another', async () => {
  const app = harness([reply(200, room()), reply(200, room())]);
  await app.service.ensureRoom(sessionId); await app.service.ensureRoom(sessionId);
  assert.equal(app.calls.length, 2); assert.ok(app.calls.every((call) => call.method === 'GET'));
});

test('a duplicate-room race fetches and validates the existing room before reuse', async () => {
  for (const status of [400, 409]) {
    const app = harness([reply(404), reply(status), reply(200, room())]);
    assert.equal((await app.service.ensureRoom(sessionId)).url, url);
    assert.equal(app.calls.length, 3);
  }
});

test('creation errors retain the original safe HTTP category if there was no duplicate room', async () => {
  const app = harness([reply(404), reply(400), reply(404)]);
  await assert.rejects(app.service.ensureRoom(sessionId), (error) => safeDiagnostic(error) === 'create-room HTTP 400');
});

test('public collisions, unsafe URLs, expired rooms and permissive configuration fail closed', async () => {
  const variants = [
    { ...room(), privacy: 'public' },
    { ...room(), url: `https://mwos-test.daily.co.evil.test/${name}` },
    { ...room(), config: { ...room().config, exp: seconds - 1 } },
    { ...room(), config: { ...room().config, exp: seconds + 24 * 3600 } },
    { ...room(), config: { ...room().config, eject_at_room_exp: false } },
    { ...room(), config: { ...room().config, enable_chat: true } },
    { ...room(), config: { ...room().config, enable_knocking: true } },
    { ...room(), config: { ...room().config, enable_screenshare: true } },
    { ...room(), config: { ...room().config, permissions: { canAdmin: true, canSend: true } } },
  ];
  for (const variant of variants) {
    const app = harness([reply(200, variant)]);
    await assert.rejects(app.service.ensureRoom(sessionId), /could not be verified/);
    assert.equal(app.calls.length, 1);
  }
});

test('room-check diagnostics contain only fixed field identifiers and never provider values', async () => {
  const returned = room();
  delete returned.config.enable_transcription_storage;
  returned.config.permissions.canAdmin = ['transcription'];
  returned.config.extra = 'secret-provider-payload';
  const app = harness([reply(200, returned)]);
  await assert.rejects(app.service.ensureRoom(sessionId), (error) => {
    assert.deepEqual(error.videoChecks, ['config.enable_transcription_storage', 'config.permissions.canAdmin']);
    assert.equal(safeDiagnostic(error), 'room-config-check [config.enable_transcription_storage,config.permissions.canAdmin]');
    assert.equal(JSON.stringify(error).includes('secret-provider-payload'), false);
    return true;
  });
  assert.equal(safeDiagnostic({ videoOperation: 'room-config-check', videoChecks: ['secret-key', url, 'config.exp'] }), 'room-config-check [config.exp]');
});

test('explicit empty admin capability arrays grant no powers but missing permissions still fail closed', async () => {
  const safe = room(); safe.config.permissions.canAdmin = [];
  assert.equal((await harness([reply(200, safe)]).service.ensureRoom(sessionId)).url, url);
  for (const permissions of [{ canSend: ['audio', 'video'] }, { canAdmin: false, canSend: [] }]) {
    const unsafe = room(); unsafe.config.permissions = permissions;
    await assert.rejects(harness([reply(200, unsafe)]).service.ensureRoom(sessionId), /could not be verified/);
  }
});

test('strict room URL validation rejects credentials, alternate hosts, ports and token parameters', () => {
  for (const value of [
    `http://mwos-test.daily.co/${name}`, `https://user:secret@mwos-test.daily.co/${name}`,
    `https://mwos-test.daily.co:443/${name}`, `https://evil.test/${name}`, `https://daily.co/${name}`,
    `https://mwos-test.daily.co/${name}?t=secret`, `https://mwos-test.daily.co/${name}#token`,
    `https://mwos-test.daily.co/${name}/`, `https://mwos-test.daily.co/another-room`,
  ]) assert.throws(() => normalizeDailyRoomUrl(value, name));
  assert.equal(normalizeDailyRoomUrl(url, name), url);
  assert.equal(managedRoomNameForSession({ id: sessionId, meeting_provider: 'external', meeting_code: name, meeting_url: url }), name);
  assert.equal(managedRoomNameForSession({ id: sessionId, meeting_provider: 'external', meeting_code: name, meeting_url: `https://evil.test/${name}` }), null);
});

test('admission tokens are room-scoped, short-lived, pseudonymous and have no admin capabilities', async () => {
  const app = harness([reply(200, { token }), reply(200, { token })]);
  const privateRoom = { name, url, expiresAt: seconds + 7200 };
  const patient = await app.service.mintAdmission(privateRoom, { sessionId, userId, role: 'patient' });
  await app.service.mintAdmission(privateRoom, { sessionId, userId: 'synthetic-clinician', role: 'doctor' });
  assert.equal(patient.roomUrl, url); assert.equal(patient.token, token);
  assert.equal(patient.expiresAt, '2026-10-28T10:10:00.000Z'); assert.equal(patient.roomExpiresAt, '2026-10-28T12:00:00.000Z');
  const props = app.calls[0].body.properties;
  assert.equal(props.room_name, name); assert.equal(props.exp, seconds + 600); assert.equal(props.nbf, seconds - 5);
  assert.equal(props.eject_at_token_exp, false, 'Admission expiry must not interrupt an ongoing consultation');
  assert.equal(props.is_owner, false); assert.equal(props.permissions.canAdmin, false);
  assert.equal(props.user_name, 'Patient'); assert.match(props.user_id, /^[a-f0-9]{32}$/); assert.notEqual(props.user_id, userId);
  assert.equal(props.start_cloud_recording, false); assert.equal(props.auto_start_transcription, false); assert.equal(props.enable_recording_ui, false);
  assert.equal(app.calls[1].body.properties.user_name, 'Care team'); assert.equal(app.calls[1].body.properties.is_owner, false);
  assert.equal(JSON.stringify(app.calls).includes(userId), false); assert.equal(JSON.stringify(app.calls).includes(sessionId), false);
});

test('provider responses and network errors never appear in sanitized failures', async () => {
  for (const response of [reply(401, { message: 'secret provider key test-only-key' }), new Error('secret provider key test-only-key'), reply(302)]) {
    const app = harness([response]);
    await assert.rejects(app.service.ensureRoom(sessionId), (error) => error.statusCode === 503 && !error.message.includes('test-only-key'));
  }
  const missing = createDailyVideoService({ apiKey: '', fetchImpl: async () => { throw Error('must not fetch'); } });
  assert.equal(missing.configured(), false);
  await assert.rejects(missing.ensureRoom(sessionId), /not been configured/);
});

test('room cleanup is idempotent for missing rooms and propagates provider failures', async () => {
  const app = harness([reply(200, { deleted: true }), reply(404), reply(503)]);
  await app.service.deleteRoom(sessionId); await app.service.deleteRoom(sessionId);
  await assert.rejects(app.service.deleteRoom(sessionId));
  assert.ok(app.calls.every((call) => call.method === 'DELETE' && call.target === `https://api.daily.co/v1/rooms/${name}`));
});

test('closing a call bans scoped participant identities before deleting and fails closed on ejection failure', async () => {
  const app = harness([reply(200, { ejectedIds: [] }), reply(200), reply(503)]);
  await app.service.closeRoom(sessionId, [userId]);
  assert.equal(app.calls[0].target, `https://api.daily.co/v1/rooms/${name}/eject`);
  assert.equal(app.calls[0].body.ban, true); assert.match(app.calls[0].body.user_ids[0], /^[a-f0-9]{32}$/);
  assert.equal(app.calls[1].method, 'DELETE');
  await assert.rejects(app.service.closeRoom(sessionId, [userId]));
  assert.equal(app.calls.length, 3, 'Failed ejection must not be treated as successful cleanup');
});

test('explicit smoke check cleans up synthetic rooms even when token creation fails', async () => {
  let deletions = 0;
  await assert.rejects(checkDailyConfiguration({
    configured: () => true, ensureRoom: async () => ({ name: 'synthetic' }),
    mintAdmission: async () => { throw Error('synthetic failure'); }, deleteRoom: async () => { deletions++; },
  }));
  assert.equal(deletions, 1);
});

test('successful smoke cleanup is not repeated, and secondary cleanup failures preserve primary diagnostics', async () => {
  let deletions = 0;
  await checkDailyConfiguration({
    configured: () => true, ensureRoom: async () => ({ name: 'synthetic' }), mintAdmission: async () => {},
    closeRoom: async () => {}, deleteRoom: async () => { deletions++; },
  });
  assert.equal(deletions, 0, 'closeRoom has already deleted the synthetic room');
  const primary = Object.assign(Error('Never log provider bodies'), { videoOperation: 'create-room', providerStatus: 400 });
  await assert.rejects(checkDailyConfiguration({
    configured: () => true, ensureRoom: async () => { throw primary; },
    deleteRoom: async () => { throw Object.assign(Error('Never log keys'), { videoOperation: 'delete-room', providerStatus: 503 }); },
  }), (error) => safeDiagnostic(error) === 'create-room HTTP 400; cleanup delete-room HTTP 503');
  assert.equal(safeDiagnostic({ videoOperation: 'secret-key', providerStatus: 'private-path' }), 'configuration-check');
});
