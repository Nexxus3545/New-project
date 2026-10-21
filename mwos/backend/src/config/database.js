const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const isServerlessRuntime = process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const requestedPoolSize = Number.parseInt(process.env.DATABASE_POOL_MAX, 10);
const requestedConnectionTimeout = Number.parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS, 10);
const defaultPoolSize = isServerlessRuntime ? 1 : 20;

const poolConfig = {
  // A serverless instance can scale horizontally. Keeping one connection per
  // warm instance prevents it from exhausting a managed Postgres pool.
  max: Number.isInteger(requestedPoolSize) && requestedPoolSize > 0
    ? requestedPoolSize
    : defaultPoolSize,
  idleTimeoutMillis: 30000,
  // This also limits pool queue waits, including managed database cold starts.
  connectionTimeoutMillis: Number.isInteger(requestedConnectionTimeout) && requestedConnectionTimeout > 0
    ? requestedConnectionTimeout
    : isServerlessRuntime ? 10000 : 2000,
};

if (connectionString) {
  // Managed providers such as Neon require an encrypted connection.
  poolConfig.connectionString = connectionString;
  poolConfig.ssl = { rejectUnauthorized: false };
} else {
  Object.assign(poolConfig, {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'mwos_db',
    user: process.env.DB_USER || 'mwos_user',
    password: process.env.DB_PASSWORD || 'mwos_password_2024',
  });
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Query executed', { text: text.substring(0, 80), duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
};

const getClient = () => pool.connect();

const testConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Database connected:', res.rows[0].now);
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
};

module.exports = { query, getClient, pool, testConnection };
