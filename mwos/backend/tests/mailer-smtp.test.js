const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const nodemailer = require('nodemailer');

test('real mail library delivers to a loopback SMTP fixture and reports rejected recipients', { timeout: 15000 }, async () => {
  const originalEnv = { ...process.env };
  const createTransport = nodemailer.createTransport;
  const sockets = new Set();
  const messages = [];
  let rejectRecipient = false;
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('220 localhost fixture SMTP\r\n');
    let buffer = '', data = null;
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === '.') { messages.push(data.join('\r\n')); data = null; socket.write('250 queued fixture\r\n'); }
          else data.push(line);
        } else if (/^EHLO\b/i.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH PLAIN\b/i.test(line)) socket.write('235 authenticated fixture\r\n');
        else if (/^RCPT TO:/i.test(line)) socket.write(rejectRecipient ? '550 fixture rejected\r\n' : '250 accepted\r\n');
        else if (line === 'DATA') { data = []; socket.write('354 end with dot\r\n'); }
        else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    delete process.env.VERCEL_ENV;
    Object.assign(process.env, {
      NODE_ENV: 'production', EMAIL_HOST: '127.0.0.1', EMAIL_PORT: String(server.address().port),
      EMAIL_USER: 'fixture@example.invalid', EMAIL_PASS: 'fixture-only',
      EMAIL_FROM: 'MWOS fixture <fixture@example.invalid>',
    });
    nodemailer.createTransport = (options) => {
      assert.equal(options.requireTLS, true);
      assert.equal(options.disableFileAccess, true);
      assert.equal(options.disableUrlAccess, true);
      assert.equal(options.host, '127.0.0.1');
      // Only this synthetic loopback fixture skips TLS; production policy stays asserted above.
      return createTransport({ ...options, requireTLS: false, ignoreTLS: true });
    };
    const { sendMail } = require('../src/utils/mailer');
    const result = await sendMail({ to: 'patient@example.invalid', subject: 'Fixture appointment', text: 'Synthetic appointment notice only.' });
    assert.equal(result.accepted, true);
    assert.ok(result.messageId);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Subject: Fixture appointment/);
    assert.match(messages[0], /Synthetic appointment notice only\./);
    rejectRecipient = true;
    await assert.rejects(sendMail({ to: 'rejected@example.invalid', subject: 'Fixture only', text: 'Not delivered' }), { code: 'EENVELOPE' });
    assert.equal(messages.length, 1);
  } finally {
    nodemailer.createTransport = createTransport;
    process.env = originalEnv;
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});
