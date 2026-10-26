const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const policy = require('../renderer/platformAccess.cjs');

// Execute the real renderer with an isolated DOM, storage and API, never Electron or a clinic service.
async function renderer(role, storedRole) {
  const nodes = new Map(), storage = new Map(), requests = [];
  const user = { id: 'synthetic-user', firstName: 'Test', lastName: 'Only', role };
  if (storedRole) {
    storage.set('desktop-user', JSON.stringify({ ...user, role: storedRole }));
    storage.set('desktop-access-token', 'test-only-saved-token');
  }
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, textContent: '', innerHTML: '', value: '', events: {},
      addEventListener(event, callback) { this.events[event] = callback; }, querySelectorAll: () => [] });
    return nodes.get(id);
  };
  const api = { defaults: { headers: { common: {} } },
    get: async (url) => {
      requests.push(['GET', url]);
      return { data: { data: url === '/auth/me' ? user : url === '/media-feed/posts' ? [] : {} } };
    },
    post: async (url) => {
      requests.push(['POST', url]);
      assert.equal(url, '/auth/login');
      return { data: { data: { user, accessToken: 'test-only-access' } } };
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8')
    .replace(/^import axios from 'axios'\r?\n/m, '')
    .replace(/^import \{ isDesktopStaffAccount, requireDesktopStaffAccount \} from '\.\/platformAccess.cjs'\r?\n/m, '');
  await vm.runInNewContext(`(async () => { ${source}\n })()`, {
    ...policy, axios: { create: () => api },
    document: { getElementById: node, documentElement: { classList: { toggle() {}, contains: () => false } } },
    window: { mwosDesktop: { platform: 'fixture' }, setTimeout, clearTimeout },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    console, setTimeout, clearTimeout,
  }, { filename: 'isolated-desktop-renderer.js' });
  return { nodes, storage, requests, signIn: () => node('login-form').events.submit({ preventDefault() {} }) };
}

test('desktop accepts exactly the four clinic staff roles', () => {
  for (const role of ['admin', 'doctor', 'midwife', 'nurse']) assert.equal(policy.requireDesktopStaffAccount({ role }).role, role);
  for (const user of [null, {}, { role: 'patient' }, { role: 'unknown' }]) {
    assert.throws(() => policy.requireDesktopStaffAccount(user), (error) => error.code === 'DESKTOP_STAFF_ONLY');
  }
});

test('desktop patient or unknown-role sign-in never saves credentials or loads a workspace', async () => {
  for (const role of ['patient', 'unknown']) {
    const app = await renderer(role);
    await app.signIn();
    assert.equal(app.storage.has('desktop-user'), false);
    assert.equal(app.storage.has('desktop-access-token'), false);
    assert.deepEqual(app.requests, [['POST', '/auth/login']]);
    assert.match(app.nodes.get('login-result').textContent, /Patients can use the mobile app or the web patient portal/);
  }
});

test('desktop restores only a server-confirmed staff session', async () => {
  for (const role of ['patient', 'unknown']) {
    const app = await renderer(role, 'admin');
    assert.deepEqual(app.requests, [['GET', '/auth/me']]);
    assert.equal(app.storage.has('desktop-user'), false);
    assert.equal(app.storage.has('desktop-access-token'), false);
  }
});

test('an old desktop patient cache cannot activate or fetch patient panels', async () => {
  const app = await renderer('patient', 'patient');
  assert.deepEqual(app.requests, [['GET', '/auth/me']]);
  for (const [id, node] of app.nodes) if (/^patient-.*-panel$/.test(id)) assert.equal(node.hidden, true);
  assert.match(app.nodes.get('hero-title').textContent, /clinic operations/);
});

test('each staff role can log in and load only the staff workspace', async () => {
  for (const role of ['admin', 'doctor', 'midwife', 'nurse']) {
    const app = await renderer(role);
    await app.signIn();
    assert.equal(JSON.parse(app.storage.get('desktop-user')).role, role);
    assert.equal(app.storage.get('desktop-access-token'), 'test-only-access');
    assert.ok(app.requests.some(([method, url]) => method === 'GET' && url === '/reports/dashboard'));
    assert.equal(app.requests.some(([, url]) => url === '/patients/me' || url === '/reports/patient-dashboard'), false);
  }
});
