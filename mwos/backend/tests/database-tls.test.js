const { test } = require('node:test');
const assert = require('node:assert/strict');
const { databaseConnectionOptions } = require('../src/utils/databaseTls');
test('remote connections always verify certificates even when a URL requests weak sslmode', () => {
  for (const mode of ['disable', 'require', 'prefer', 'no-verify']) {
    const options = databaseConnectionOptions({ DATABASE_URL: `postgres://user:unused@db.example.invalid/db?sslmode=${mode}` });
    assert.equal(options.ssl.rejectUnauthorized, true);
    assert.equal(new URL(options.connectionString).searchParams.has('sslmode'), false);
  }
});
test('only local development may connect without TLS', () => {
  assert.equal(databaseConnectionOptions({ DB_HOST: '127.0.0.1' }).ssl, false);
  assert.equal(databaseConnectionOptions({ DB_HOST: 'localhost', NODE_ENV: 'production' }).ssl.rejectUnauthorized, true);
  assert.equal(databaseConnectionOptions({ DB_HOST: 'localhost', VERCEL: '1' }).ssl.rejectUnauthorized, true);
  assert.equal(databaseConnectionOptions({ DB_HOST: 'remote.example.invalid' }).ssl.rejectUnauthorized, true);
});
test('custom trusted CA is supported without disabling hostname or certificate checks', () => {
  const options = databaseConnectionOptions({ DB_HOST: 'remote.example.invalid', DATABASE_CA_CERT: 'BEGIN\\nTEST\\nEND' });
  assert.deepEqual(options.ssl, { rejectUnauthorized: true, ca: 'BEGIN\nTEST\nEND' });
});
