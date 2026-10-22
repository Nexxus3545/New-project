const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { test } = require('node:test');
const babel = require('@babel/core');

function runtime() {
  const secure = new Map();
  const cache = new Map();
  const writes = [];
  const requests = [];
  const hooks = {};
  let denied = false;
  let enrolled = true;
  let browserResult = { type: 'success', url: 'tmccopinomwos://oauth?code=test-code' };
  let browserUrl;
  const user = { id: 'patient-user', role: 'patient', patientId: 'patient-record', firstName: 'Test', lastName: 'Patient', email: 'test@example.invalid' };
  const session = { accessToken: 'test-access-token', refreshToken: 'test-refresh-token', user };
  const api = {
    defaults: {}, interceptors: {
      request: { use: (success) => { hooks.request = success; } },
      response: { use: (success, failure) => { hooks.response = success; hooks.failure = failure; } },
    },
    get: async (url) => {
      requests.push({ url });
      return { data: { data: url === '/auth/providers' ? { google: true } : user } };
    },
    post: async (url, body) => { requests.push({ url, body }); return { data: { data: session } }; },
    patch: async (url, body) => {
      requests.push({ url, body, method: 'patch' });
      return { data: { data: { ...user, phone: body.phone } } };
    },
  };
  const modules = new Map();
  const stubs = {
    axios: { create: (config) => { api.defaults = config; return api; } },
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      getItemAsync: async (key, options) => {
        if (denied && options?.requireAuthentication) throw new Error('Biometric unlock cancelled');
        return secure.get(key) ?? null;
      },
      setItemAsync: async (key, value, options) => { secure.set(key, value); writes.push({ key, value, options }); },
      deleteItemAsync: async (key) => { secure.delete(key); },
    },
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => cache.get(key) ?? null,
      setItem: async (key, value) => cache.set(key, value),
      getAllKeys: async () => [...cache.keys()],
      multiRemove: async (keys) => keys.forEach((key) => cache.delete(key)),
    },
    'react-native': { Platform: { OS: 'android' } },
    'expo-local-authentication': {
      hasHardwareAsync: async () => true, isEnrolledAsync: async () => enrolled,
      supportedAuthenticationTypesAsync: async () => [1],
      AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
      authenticateAsync: async () => ({ success: true }),
    },
    'expo-crypto': {
      getRandomBytesAsync: async (length) => crypto.randomBytes(length),
      CryptoDigestAlgorithm: { SHA256: 'sha256' }, CryptoEncoding: { BASE64: 'base64' },
      digestStringAsync: async (algorithm, input) => crypto.createHash(algorithm).update(input).digest('base64'),
    },
    'expo-web-browser': {
      openAuthSessionAsync: async (url, callback) => {
        browserUrl = url;
        assert.equal(callback, 'tmccopinomwos://oauth');
        return browserResult;
      },
    },
  };
  const load = (relative) => {
    const file = path.resolve(__dirname, '..', relative);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const code = babel.transformSync(fs.readFileSync(file, 'utf8'), {
      babelrc: false, configFile: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code;
    vm.runInNewContext(code, {
      module, exports: module.exports, URL, process: { env: {} }, console,
      require: (name) => {
        if (name in stubs) return stubs[name];
        if (name.startsWith('.')) return load(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(file), name.endsWith('.js') ? name : name + '.js')));
        return require(name);
      },
    }, { filename: file });
    return module.exports;
  };
  return { load, secure, cache, writes, requests, hooks, user, session,
    deny: (value) => { denied = value; }, enroll: (value) => { enrolled = value; },
    browser: (value) => { browserResult = value; }, browserUrl: () => browserUrl,
  };
}

test('mobile uses the deployed API unless explicitly overridden for development', () => {
  const { resolveApiUrl, isPublicAuthRequest } = runtime().load('src/services/apiConfig.js');
  assert.equal(resolveApiUrl(), 'https://tmc-copino-mwos-api.vercel.app/api');
  assert.equal(resolveApiUrl(' http://10.0.2.2:5000/ '), 'http://10.0.2.2:5000/api');
  assert.equal(isPublicAuthRequest('/auth/oauth/exchange'), true);
  assert.equal(isPublicAuthRequest('/auth/me'), false);
});

test('Metro ignores generated native caches while preserving source files and default exclusions', () => {
  const module = { exports: {} };
  const defaultRule = /existing-exclusion/;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../metro.config.js'), 'utf8'), {
    module, __dirname, require: () => ({
      getDefaultConfig: () => ({ resolver: { blockList: defaultRule }, transformer: {}, watcher: {} }),
    }),
  });
  const blocked = (file) => module.exports.resolver.blockList.some((rule) => rule.test(file));
  assert.ok(blocked('C:\\app\\node_modules\\expo-modules-core\\android\\.cxx\\release\\native.json'));
  assert.ok(blocked('/app/node_modules/expo/android/build/intermediates/metadata.json'));
  assert.ok(blocked('/app/node_modules/react-native/ReactAndroid/build/generated/native.json'));
  assert.ok(blocked('existing-exclusion'));
  assert.equal(blocked('/app/src/services/api.js'), false);
  assert.equal(blocked('/app/node_modules/expo/src/Expo.ts'), false);
});

test('Google sign-in binds browser callback to a fresh S256 proof before saving a session', async () => {
  const r = runtime();
  const store = r.load('src/hooks/useAuthStore.js').useAuthStore;
  const result = await store.getState().loginWithGoogle();
  assert.equal(result.success, true);
  const exchange = r.requests.find((request) => request.url === '/auth/oauth/exchange');
  assert.equal(exchange.body.code, 'test-code');
  const challenge = crypto.createHash('sha256').update(exchange.body.codeVerifier).digest('base64url');
  assert.equal(new URL(r.browserUrl()).searchParams.get('code_challenge'), challenge);
  assert.equal(r.secure.get('accessToken'), r.session.accessToken);
  assert.equal(store.getState().user.id, r.user.id);
});

test('cancelled or unexpected Google callbacks never issue a session', async () => {
  for (const result of [{ type: 'cancel' }, { type: 'success', url: 'attacker://oauth?code=test-code' }]) {
    const r = runtime();
    r.browser(result);
    const store = r.load('src/hooks/useAuthStore.js').useAuthStore;
    assert.equal((await store.getState().loginWithGoogle()).success, false);
    assert.equal(r.secure.has('accessToken'), false);
    assert.equal(r.requests.some((request) => request.url === '/auth/oauth/exchange'), false);
  }
});

test('fingerprint lock removes usable tokens and cancelled biometric access does not restore the user', async () => {
  const r = runtime();
  const store = r.load('src/hooks/useAuthStore.js').useAuthStore;
  await store.getState().login('test@example.invalid', 'test');
  assert.equal((await store.getState().enableBiometricUnlock()).success, true);
  assert.ok(r.writes.some((write) => write.key === 'biometricRefreshToken' && write.options.requireAuthentication));
  await store.getState().lockForBiometric();
  assert.equal(r.secure.has('accessToken'), false);
  assert.equal(r.secure.has('refreshToken'), false);
  assert.equal(store.getState().user, null);
  r.deny(true);
  assert.equal((await store.getState().loginWithBiometrics()).success, false);
  assert.equal(store.getState().user, null);
  r.deny(false);
  assert.equal((await store.getState().loginWithBiometrics()).success, true);
  assert.equal(store.getState().user.id, r.user.id);
});

test('an unenrolled phone cannot enable biometrics and old biometric flags are safely migrated', async () => {
  const r = runtime();
  r.enroll(false);
  const store = r.load('src/hooks/useAuthStore.js').useAuthStore;
  assert.equal((await store.getState().enableBiometricUnlock()).success, false);
  r.secure.set('biometricEnabled', 'true');
  r.secure.set('accessToken', 'old-access');
  r.secure.set('user', JSON.stringify(r.user));
  await store.getState().initialize();
  assert.equal(store.getState().biometricEnabled, false);
  assert.equal(r.secure.get('accessToken'), 'old-access');
});

test('private patient responses are not cached in plain device storage', async () => {
  const r = runtime();
  const api = r.load('src/services/api.js');
  await r.hooks.response({ config: { url: '/patients/me', method: 'get' }, data: { sensitive: 'not-to-be-cached' } });
  assert.equal(r.cache.size, 0);
  await r.hooks.response({ config: { url: '/media-feed/posts', method: 'get' }, data: { data: [] } });
  assert.equal(r.cache.size, 1);
  r.cache.set('offline-cache:/patients/me:', 'old private data');
  await api.purgePrivateCache();
  assert.equal(r.cache.has('offline-cache:/patients/me:'), false);
});

test('public login errors do not clear a saved session', async () => {
  const r = runtime();
  r.load('src/services/api.js');
  r.secure.set('refreshToken', 'saved-session');
  const error = { config: { url: '/auth/login' }, response: { status: 401 } };
  await assert.rejects(r.hooks.failure(error), (received) => received === error);
  assert.equal(r.secure.get('refreshToken'), 'saved-session');
});

test('saving a contact after restoring the small cache preserves the current profile avatar', async () => {
  const r = runtime();
  const avatar = 'data:image/png;base64,' + 'A'.repeat(4000);
  r.user.avatarUrl = avatar;
  const store = r.load('src/hooks/useAuthStore.js').useAuthStore;
  await store.getState().login('test@example.invalid', 'test');
  await store.getState().initialize();
  assert.equal(store.getState().user.avatarUrl, null);
  assert.equal((await store.getState().updateContact('09170000000')).success, true);
  const updated = r.requests.find((request) => request.method === 'patch');
  assert.ok(r.requests.some((request) => request.url === '/auth/me'));
  assert.equal(updated.body.avatarUrl, avatar);
  assert.equal(updated.body.phone, '09170000000');
});
