const assert = require('node:assert/strict');
const { test } = require('node:test');
const { guideReply } = require('../src/utils/assistantGuide');

test('guide routes patient and staff scheduling questions to their own portal', () => {
  const patient = guideReply('Paano ako magpa appointment?', 'patient');
  const staff = guideReply('How do I review appointment requests?', 'admin');
  assert.equal(patient.topic, 'scheduling');
  assert.equal(patient.route, '/my/scheduling');
  assert.equal(staff.topic, 'scheduling');
  assert.equal(staff.route, '/scheduling');
});

test('guide keeps clinical and urgent questions out of diagnostic answers', () => {
  const clinical = guideReply('What medicine should I take for this symptom?', 'patient');
  const urgent = guideReply('I have severe bleeding and cannot breathe', 'patient');
  assert.equal(clinical.topic, 'medical-question');
  assert.equal(clinical.route, '/my/messages');
  assert.match(clinical.answer, /clinician|propesyonal/i);
  assert.equal(urgent.topic, 'emergency');
  assert.equal(urgent.route, '/my/emergency');
  assert.match(urgent.answer, /emergency|emergency department|serbisyong pang-emergency/i);
});

test('guide uses only a recognised prior topic for a brief follow-up', () => {
  const continued = guideReply('How do I open it?', 'patient', 'telehealth');
  const ignored = guideReply('How do I open it?', 'patient', 'unknown-topic');
  assert.equal(continued.topic, 'telehealth');
  assert.equal(continued.route, '/my/telehealth');
  assert.equal(ignored.topic, 'clarify');
  assert.equal(ignored.route, null);
});
