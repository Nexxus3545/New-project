const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const readPoolOptions = (overrides = {}) => JSON.parse(execFileSync(process.execPath, ['-e', `
  const { pool } = require('./src/config/database');
  console.log(JSON.stringify({ max: pool.options.max, timeout: pool.options.connectionTimeoutMillis }));
  pool.end();
`], {
  cwd: require('node:path').resolve(__dirname, '..'),
  encoding: 'utf8',
  env: {
    ...process.env,
    VERCEL: '',
    AWS_LAMBDA_FUNCTION_NAME: '',
    DATABASE_POOL_MAX: '',
    DATABASE_CONNECTION_TIMEOUT_MS: '',
    ...overrides,
  },
}));

test('serverless connections allow a managed database to wake without increasing pool size', () => {
  assert.deepEqual(readPoolOptions({ VERCEL: '1' }), { max: 1, timeout: 10000 });
  assert.deepEqual(readPoolOptions({ AWS_LAMBDA_FUNCTION_NAME: 'mwos-api' }), { max: 1, timeout: 10000 });
});

test('local development keeps its existing pool defaults', () => {
  assert.deepEqual(readPoolOptions(), { max: 20, timeout: 2000 });
});

test('connection budgets are configurable and invalid values use safe defaults', () => {
  assert.deepEqual(readPoolOptions({ VERCEL: '1', DATABASE_CONNECTION_TIMEOUT_MS: '15000' }), { max: 1, timeout: 15000 });
  assert.deepEqual(readPoolOptions({ VERCEL: '1', DATABASE_CONNECTION_TIMEOUT_MS: '-1' }), { max: 1, timeout: 10000 });
});
