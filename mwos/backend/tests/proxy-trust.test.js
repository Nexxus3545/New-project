const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

for (const hosted of [false, true]) {
  test(hosted ? 'Vercel visitors have separate rate-limit buckets' : 'Direct servers ignore untrusted forwarding headers', () => {
    const script = `
      require('dotenv').config();
      require('./src/config/database').testConnection = async () => true;
      const app = require('./src/index');
      const server = app.listen(0, '127.0.0.1', async () => {
        try {
          const remaining = [];
          for (const ip of ['198.51.100.1','198.51.100.2','198.51.100.1']) {
            const response = await fetch('http://127.0.0.1:' + server.address().port + '/health', { headers: {'X-Forwarded-For': ip} });
            if (response.status !== 200) throw new Error('Health request failed');
            remaining.push(Number(response.headers.get('ratelimit-remaining')));
          }
          console.log('RESULT:' + JSON.stringify(remaining));
        } catch(error) { console.error(error); process.exitCode = 1; }
        finally { server.close(); }
      });
    `;
    const output = execFileSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'test', VERCEL: hosted ? '1' : '0' },
      encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const buckets = JSON.parse(output.match(/RESULT:(\[[^\n]+\])/)[1]);
    assert.deepEqual(buckets, hosted ? [499,499,498] : [499,498,497]);
  });
}
