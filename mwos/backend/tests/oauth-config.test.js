const assert = require('node:assert/strict');
const { test } = require('node:test');

const configured = {
  GOOGLE_CLIENT_ID: 'google-test-client',
  GOOGLE_CLIENT_SECRET: 'google-test-secret',
  GOOGLE_CALLBACK_URL: 'https://mwos.example/api/auth/google/callback',
  FACEBOOK_APP_ID: 'facebook-test-app',
  FACEBOOK_APP_SECRET: 'facebook-test-secret',
  FACEBOOK_CALLBACK_URL: 'https://mwos.example/api/auth/facebook/callback',
};

const loadConfig = (values) => {
  const previous = Object.fromEntries(Object.keys(configured).map((key) => [key, process.env[key]]));
  const configPath = require.resolve('../src/config/oauth');
  try {
    for (const key of Object.keys(configured)) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    delete require.cache[configPath];
    return require(configPath);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[configPath];
  }
};

test('OAuth settings remove spaces and line breaks accidentally copied around values', () => {
  const padded = Object.fromEntries(Object.entries(configured).map(([key, value]) => [key, ` \t${value}\r\n`]));
  const config = loadConfig(padded);

  assert.deepEqual(config.getProviderConfig('google'), {
    clientId: configured.GOOGLE_CLIENT_ID,
    clientSecret: configured.GOOGLE_CLIENT_SECRET,
    callbackUrl: configured.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email'],
  });
  assert.deepEqual(config.getProviderConfig('facebook'), {
    clientId: configured.FACEBOOK_APP_ID,
    clientSecret: configured.FACEBOOK_APP_SECRET,
    callbackUrl: configured.FACEBOOK_CALLBACK_URL,
    scope: ['email'],
  });
  assert.equal(config.isProviderConfigured('google'), true);
  assert.equal(config.isProviderConfigured('facebook'), true);
});

test('whitespace-only settings never activate a provider', () => {
  for (const key of Object.keys(configured)) {
    const config = loadConfig({ ...configured, [key]: ' \t\r\n' });
    const provider = key.startsWith('GOOGLE_') ? 'google' : 'facebook';
    const otherProvider = provider === 'google' ? 'facebook' : 'google';
    assert.equal(config.isProviderConfigured(provider), false, key);
    assert.equal(config.isProviderConfigured(otherProvider), true, key);
  }
});

test('missing OAuth settings remain disabled without affecting unknown providers', () => {
  const config = loadConfig({});
  assert.equal(config.isProviderConfigured('google'), false);
  assert.equal(config.isProviderConfigured('facebook'), false);
  assert.equal(config.isProviderConfigured('unknown'), false);
  assert.equal(config.getProviderConfig('unknown'), null);
});
