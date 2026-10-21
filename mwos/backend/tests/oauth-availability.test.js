const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

process.env.NODE_ENV = 'test';
process.env.GOOGLE_CLIENT_ID = 'mwos-google-test-client';
process.env.GOOGLE_CLIENT_SECRET = 'mwos-google-test-secret';
process.env.GOOGLE_CALLBACK_URL = ' http://localhost:5000/api/auth/google/callback\r\n';
process.env.FACEBOOK_APP_ID = 'mwos-facebook-test-app';
process.env.FACEBOOK_APP_SECRET = 'mwos-facebook-test-secret';
process.env.FACEBOOK_CALLBACK_URL = '\thttp://localhost:5000/api/auth/facebook/callback\n';

const database = require('../src/config/database');
let databaseReady = true;
database.testConnection = async () => databaseReady;

const app = require('../src/index');
let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await database.pool.end();
});

test('provider availability reflects a ready database and configured providers', async () => {
  const response = await fetch(`${baseUrl}/api/auth/providers`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(payload.data, { google: true, facebook: true });
});

test('both OAuth starts use the configured provider callback', async () => {
  for (const provider of ['google', 'facebook']) {
    const response = await fetch(`${baseUrl}/api/auth/${provider}`, { redirect: 'manual' });
    const location = new URL(response.headers.get('location'));

    assert.equal(response.status, 302);
    assert.equal(location.searchParams.get('redirect_uri'), process.env[`${provider.toUpperCase()}_CALLBACK_URL`].trim());
    assert.ok(location.searchParams.get('state'));
  }
});

test('native Google start accepts S256 state but does not permit arbitrary redirect URLs', async () => {
  const challenge = 'x'.repeat(43);
  const response = await fetch(`${baseUrl}/api/auth/google?client=mobile&code_challenge_method=S256&code_challenge=${challenge}`, { redirect: 'manual' });
  const state = new URL(response.headers.get('location')).searchParams.get('state');
  assert.equal(response.status, 302);
  assert.match(state, /^m1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
  const invalid = await fetch(`${baseUrl}/api/auth/google?client=mobile&redirect_uri=https://attacker.invalid`, { redirect: 'manual' });
  assert.equal(invalid.status, 400);
});

test('legacy public SMS login endpoints are retired', async () => {
  for (const endpoint of ['request', 'verify']) {
    const response = await fetch(`${baseUrl}/api/auth/sms-login/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 410);
  }
});

test('a disconnected database blocks provider starts before leaving MWOS', async () => {
  databaseReady = false;

  const availability = await fetch(`${baseUrl}/api/auth/providers`);
  const availabilityPayload = await availability.json();
  assert.deepEqual(availabilityPayload.data, { google: false, facebook: false });

  const start = await fetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });
  const destination = new URL(start.headers.get('location'));
  assert.equal(start.status, 302);
  assert.equal(destination.searchParams.get('oauth_error'), 'oauth_service_unavailable');
});
