const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const source = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const care = () => import('data:text/javascript;base64,' + Buffer.from(source('utils/patientCare.js')).toString('base64'));

test('mobile general-care choices do not infer pregnancy from gender', async () => {
  const { hasMaternalCare, genderOptions, isMaternalAppointment } = await care();
  assert.ok(genderOptions.some((option) => option.value === 'male'));
  assert.equal(hasMaternalCare({ gender: 'male', care_type: 'general' }), false);
  assert.equal(hasMaternalCare({ gender: 'female', care_type: 'general' }), false);
  assert.equal(hasMaternalCare({ care_type: 'general', pregnancies: [{ status: 'active' }] }), true);
  assert.equal(isMaternalAppointment('consultation'), false);
  assert.equal(isMaternalAppointment('postnatal'), true);
});

test('mobile clinic readings are saved values, never fetal defaults for general care', async () => {
  const { savedMetrics } = await care();
  assert.deepEqual(savedMetrics(null).map((metric) => metric.value), Array(4).fill('Not recorded'));
  const general = savedMetrics({ bp_systolic: 120, pulse_rate: 75, temperature: '36.5', fetal_heart_rate: 145 });
  assert.equal(general[0].value, 'Not recorded');
  assert.equal(general[2].value, 75);
  assert.equal(general[3].value, 36.5);
  assert.ok(!general.some((metric) => /fetal/i.test(metric.label)));
  assert.equal(savedMetrics({ fetal_heart_rate: 145 }, true)[2].value, 145);
});

test('mobile registration, Google completion, profile and booking carry the new choices', () => {
  for (const file of ['screens/RegisterScreen.js', 'screens/CompletePatientProfileScreen.js', 'screens/patient/PatientProfileScreen.js']) {
    assert.match(source(file), /PatientCareFields/);
  }
  const appointments = source('screens/patient/PatientAppointmentsScreen.js');
  assert.match(appointments, /useState\('consultation'\)/);
  assert.match(appointments, /pregnancyId: isMaternalAppointment\(appointmentType\)/);
  for (const file of ['screens/patient/PatientHomeScreen.js', 'screens/patient/PatientVitalsScreen.js']) {
    assert.doesNotMatch(source(file), /RealtimeVitalsPanel|PregnancyWireframeScene/);
    assert.match(source(file), /SavedClinicReadings/);
  }
});
