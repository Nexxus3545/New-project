// Real browser/API/database checks against the disposable integration fixture only.
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const fixture = JSON.parse(fs.readFileSync(process.env.MWOS_TEST_FIXTURE || path.resolve(__dirname, '../../../../tmp/workflow-browser-fixture.json'), 'utf8'));
if (!/^mwos_verify_\d+$/.test(fixture.database) || new URL(fixture.apiBase).hostname !== '127.0.0.1') throw new Error('Isolated local test fixture required');
const origin = 'http://localhost:3001';
const date = new Date(Date.now() + 4 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
async function request(role, method, endpoint, body) {
  const r = await fetch(fixture.apiBase + endpoint, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fixture.tokens[role]}`, ...(role === 'admin' ? { 'X-Step-Up-Token': fixture.step } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(f => { localStorage.setItem('accessToken', f.tokens.patient); localStorage.setItem('user', JSON.stringify({ id: f.users.patient.id, role: 'patient', firstName: 'Synthetic', patientId: f.patients.patient.id })); }, fixture);
    await context.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/my/appointments');
    await page.getByLabel('Preferred date', { exact: true }).fill(date);
    await page.getByLabel('Preferred time', { exact: true }).fill('13:00');
    await page.getByRole('button', { name: 'Send appointment request', exact: true }).click();
    await page.getByRole('heading', { name: 'Your appointment request was saved' }).waitFor();
    let rows = (await request('patient', 'GET', '/appointments?limit=200')).body.data;
    const created = rows.find(x => new Date(x.scheduled_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === date && x.scheduled_time.startsWith('13:00'));
    assert.ok(created, 'Browser request persisted');
    await page.reload();
    const createdRow = page.getByRole('region', { name: 'Appointment history' }).locator('li').filter({ hasText: new RegExp('1:00 PM') }).last();
    await createdRow.getByRole('button', { name: 'Change schedule', exact: true }).click();
    await page.getByLabel('New preferred time').fill('14:00');
    await page.getByRole('button', { name: 'Save preferred schedule', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Preferred schedule updated' }).waitFor();
    rows = (await request('patient', 'GET', '/appointments?limit=200')).body.data;
    assert.equal(rows.find(x => x.id === created.id).scheduled_time, '14:00:00');
    assert.equal((await request('other', 'PATCH', `/appointments/${created.id}`, { status: 'cancelled' })).status, 403);
    const conflict = await request('patient', 'POST', '/appointments', { patientId: fixture.patients.patient.id, scheduledDate: date, scheduledTime: '15:00' });
    assert.equal(conflict.status, 201);
    await page.getByRole('region', { name: 'Appointment history' }).locator('li').filter({ hasText: '2:00 PM' }).getByRole('button', { name: 'Change schedule', exact: true }).click();
    await page.getByLabel('New preferred time').fill('15:00');
    await page.getByRole('button', { name: 'Save preferred schedule', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /conflict|overlap|already|another/i }).waitFor();
    await page.getByRole('button', { name: 'Keep appointment' }).click();
    assert.equal((await request('admin', 'PATCH', `/appointments/${created.id}`, { status: 'confirmed' })).status, 200);
    assert.equal((await request('patient', 'PATCH', `/appointments/${created.id}`, { scheduledTime: '16:00' })).status, 409);
    assert.equal((await request('patient', 'PATCH', `/appointments/${conflict.body.data.id}`, { status: 'cancelled' })).status, 200);
    await page.reload();
    assert.equal(await page.getByRole('region', { name: 'Appointment history' }).locator('li').filter({ hasText: '2:00 PM' }).getByRole('button', { name: 'Change schedule', exact: true }).count(), 0);
    const history = page.getByRole('region', { name: 'Appointment history' });
    const row = history.locator('li').filter({ hasText: '2:00 PM' });
    await row.getByRole('button', { name: 'Cancel appointment', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Appointment cancelled' }).waitFor();
    await page.reload();
    await row.getByText('cancelled', { exact: true }).waitFor();
    assert.equal(await row.getByRole('button').count(), 0);
    assert.equal((await request('patient', 'PATCH', `/appointments/${created.id}`, { scheduledTime: '16:00' })).status, 409);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.resolve(__dirname, '../../../../output/readiness/patient-appointments-phone.png'), fullPage: true });
    console.log(JSON.stringify({ result: 'passed', checks: ['patient browser create/reload', 'reschedule persistence', 'overlap rejected and shown', 'foreign-patient update denied', 'confirmed schedule protected', 'cancel/reload', 'closed request protected', '390px layout'], database: fixture.database }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
