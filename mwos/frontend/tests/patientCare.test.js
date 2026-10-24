import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasMaternalCare, generalAppointments, isMaternalAppointment, appointmentLabel } from '../src/utils/patientCare.js'
import { getRecordedVitals } from '../src/utils/recordedCare.js'

test('care type never guesses pregnancy from gender', () => {
  for (const gender of ['male', 'female', 'other', 'prefer_not_to_say', null]) {
    assert.equal(hasMaternalCare({ gender, care_type: 'general' }), false)
  }
  assert.equal(hasMaternalCare({ careType: 'maternal' }), true)
  assert.equal(hasMaternalCare({ care_type: 'general', pregnancies: [{ status: 'active' }] }), true)
  assert.equal(hasMaternalCare({ pregnancies: [{ status: 'delivered' }] }), false)
})

test('general visits and readings do not require pregnancy data', () => {
  assert.equal(generalAppointments[0].value, 'consultation')
  for (const option of generalAppointments) assert.equal(isMaternalAppointment(option.value), false)
  assert.equal(isMaternalAppointment('prenatal'), true)
  assert.equal(appointmentLabel('consultation'), 'General checkup')
  const readings = getRecordedVitals({ pulse_rate: 74, temperature: '36.7', fetal_heart_rate: 145 })
  assert.deepEqual(readings.map((item) => item.key), ['bp', 'pulse', 'weight', 'temperature'])
  assert.equal(readings[1].value, 74)
  assert.equal(readings[3].value, 36.7)
  assert.ok(!readings.some((item) => /fetal/i.test(item.label)))
})
