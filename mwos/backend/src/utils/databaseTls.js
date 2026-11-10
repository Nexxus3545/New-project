const fs = require('node:fs');

function databaseConnectionOptions(env = process.env) {
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const production = env.NODE_ENV === 'production' || env.VERCEL === '1' || Boolean(env.AWS_LAMBDA_FUNCTION_NAME);
  const host = connectionString ? new URL(connectionString).hostname : (env.DB_HOST || 'localhost');
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
  const options = {};
  if (connectionString) {
    const url = new URL(connectionString);
    // pg's URL sslmode parsing can replace the explicit verified TLS settings.
    for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
    options.connectionString = url.toString();
  } else {
    Object.assign(options, { host, port: Number(env.DB_PORT) || 5432, database: env.DB_NAME || 'mwos_db', user: env.DB_USER || 'mwos_user', password: env.DB_PASSWORD || 'mwos_password_2024' });
  }
  if (loopback && !production && env.DATABASE_SSL !== 'true') {
    options.ssl = false;
  } else {
    options.ssl = { rejectUnauthorized: true };
    const ca = env.DATABASE_CA_CERT?.replace(/\\n/g, '\n') || (env.DATABASE_CA_CERT_PATH ? fs.readFileSync(env.DATABASE_CA_CERT_PATH, 'utf8') : null);
    if (ca) options.ssl.ca = ca;
  }
  return options;
}
module.exports = { databaseConnectionOptions };
