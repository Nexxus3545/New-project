const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const { once } = require('node:events');
const { Client } = require('pg');
const { databaseConnectionOptions } = require('../src/utils/databaseTls');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures/database-tls', name), 'utf8');

// Complete a real PostgreSQL SSLRequest and TLS handshake before accepting the
// startup packet. No patient data, network service, or real database is used.
async function postgresTlsServer(t, certificate = 'matching') {
  const sockets = new Set();
  let startups = 0;
  const secureContext = tls.createSecureContext({
    cert: fixture(`${certificate}-cert.pem`), key: fixture(`${certificate}-key.pem`),
  });
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.once('data', (request) => {
      assert.equal(request.readInt32BE(0), 8);
      assert.equal(request.readInt32BE(4), 80877103);
      socket.write('S');
      const secure = new tls.TLSSocket(socket, { isServer: true, secureContext });
      secure.on('error', () => socket.destroy());
      secure.once('data', (startup) => {
        assert.equal(startup.readInt32BE(4), 196608);
        startups += 1;
        // AuthenticationOk followed by ReadyForQuery, enough for pg.connect().
        secure.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]));
        secure.on('data', () => secure.end());
      });
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  return { port: server.address().port, startups: () => startups };
}

function clientFor(server, extra = {}) {
  return new Client({
    ...databaseConnectionOptions({
      DATABASE_URL: `postgres://synthetic:unused@127.0.0.1:${server.port}/synthetic?sslmode=no-verify`,
      NODE_ENV: 'production',
      ...extra,
    }),
    connectionTimeoutMillis: 3000,
  });
}

test('pg actually connects when the server certificate is signed by the configured CA', async (t) => {
  const server = await postgresTlsServer(t);
  const client = clientFor(server, { DATABASE_CA_CERT: fixture('ca.pem') });
  t.after(() => client.end());
  await client.connect();
  assert.equal(client.connection.stream.authorized, true);
  assert.equal(server.startups(), 1);
});

test('pg rejects an untrusted certificate even when the connection URL asks for no verification', async (t) => {
  const server = await postgresTlsServer(t);
  const client = clientFor(server);
  t.after(() => client.end());
  await assert.rejects(client.connect(), (error) => ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(error.code));
  assert.equal(server.startups(), 0, 'No PostgreSQL startup or credentials may cross a failed TLS handshake');
});

test('pg rejects a trusted certificate issued for a different hostname', async (t) => {
  const server = await postgresTlsServer(t, 'wrong-host');
  const client = clientFor(server, { DATABASE_CA_CERT: fixture('ca.pem') });
  t.after(() => client.end());
  await assert.rejects(client.connect(), (error) => error.code === 'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(server.startups(), 0);
});
