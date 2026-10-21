const assert = require('node:assert/strict');
const { after, test } = require('node:test');

const database = require('../src/config/database');
const originalQuery = database.query;
let inFlight = false;
let scope;
const totals = {
  total_patients: '3', active_pregnancies: '1', today_appointments: '2',
  deliveries_this_month: '0', high_risk_patients: '1', pending_bills: '0',
  low_inventory: '2', recent_alerts: '1', unread_threads: '1', open_care_tasks: '2',
  total_users: '4', weekly_active_users: '3', media_uploads: '2',
  documents_uploaded: '1', medicine_uploads: '2', total_reviews: '3',
  average_rating: '4.67', latest_backup: null,
};

database.query = async (sql, params) => {
  if (inFlight) throw new Error('timeout exceeded when trying to connect');
  inFlight = true;
  try {
    await new Promise(setImmediate);
    if (sql.includes('AS total_patients')) {
      scope = params;
      return { rows: [totals] };
    }
    return { rows: [] };
  } finally {
    inFlight = false;
  }
};
const { getDashboard } = require('../src/controllers/report.controller');

after(async () => {
  database.query = originalQuery;
  await database.pool.end();
});

test('dashboard returns its complete response with only one available database connection', async () => {
  for (const role of ['admin', 'midwife']) {
    let response;
    let failure;
    await getDashboard(
      { user: { id: '00000000-0000-0000-0000-000000000001', role } },
      { json: (payload) => { response = payload; } },
      (error) => { failure = error; }
    );

    assert.equal(failure, undefined);
    assert.equal(response.success, true);
    assert.equal(response.data.stats.totalPatients, 3);
    assert.equal(response.data.stats.totalUsers, 4);
    assert.equal(response.data.stats.averageRating, 4.67);
    assert.equal(Object.keys(response.data.stats).length, 17);
    assert.deepEqual(response.data.deliveryTrend, []);
    assert.deepEqual(response.data.todayAppointments, []);
    assert.deepEqual(response.data.usageTrend, []);
    assert.equal(response.data.backupStatus, null);
    assert.deepEqual(scope, ['00000000-0000-0000-0000-000000000001', role]);
  }
});
