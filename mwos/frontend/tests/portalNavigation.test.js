import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPortalDestination, getPortalIntent } from '../src/utils/portalNavigation.js'
import fs from 'node:fs'
import postcss from 'postcss'

test('public entry keeps appointment and team intent behind patient authentication', () => {
  assert.equal(getPortalDestination(null), '/login')
  assert.equal(getPortalDestination(null, 'appointment'), '/login?intent=appointment')
  assert.equal(getPortalDestination({ role: 'patient' }, 'appointment'), '/my/appointments')
  assert.equal(getPortalDestination({ role: 'patient' }, 'team'), '/my/doctors')
  assert.equal(getPortalDestination({ role: 'patient' }), '/my/dashboard')
})

test('portal routing uses only fixed local destinations and existing staff roles', () => {
  for (const role of ['admin', 'doctor', 'midwife', 'nurse']) assert.equal(getPortalDestination({ role }, 'appointment'), '/dashboard')
  assert.equal(getPortalDestination({ role: 'unknown' }, 'appointment'), '/')
  for (const value of ['https://external.invalid', '//external.invalid', '/patients/private', '__proto__', 'constructor']) {
    assert.equal(getPortalIntent(`?intent=${encodeURIComponent(value)}`), '')
    assert.equal(getPortalDestination({ role: 'patient' }, value), '/my/dashboard')
    assert.equal(getPortalDestination(null, value), '/login')
  }
  assert.equal(getPortalIntent('?intent=appointment&other=ignored'), 'appointment')
})

test('public homepage styles are contained and cannot restyle the existing clinic dashboard', () => {
  const css = postcss.parse(fs.readFileSync(new URL('../src/styles/landing.css', import.meta.url), 'utf8'))
  css.walkRules((rule) => {
    let parent = rule.parent
    while (parent) { if (parent.type === 'atrule' && parent.name.endsWith('keyframes')) return; parent = parent.parent }
    for (const selector of rule.selectors) assert.ok(selector.startsWith('.clinic-landing'), `Unscoped public selector: ${selector}`)
    assert.doesNotMatch(rule.selector, /\.clinic-hero(?:[\s{:.#>,]|$)/)
  })
})

test('care-team profiles do not invent live availability or rank providers', () => {
  const list = fs.readFileSync(new URL('../src/pages/patient/PatientDoctorsPage.jsx', import.meta.url), 'utf8')
  const profile = fs.readFileSync(new URL('../src/pages/patient/PatientDoctorDetailPage.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(list, /Top Doctors|>Available</)
  assert.doesNotMatch(profile, /Available this week|\['Mon', 'Wed', 'Fri'\]|Availability snapshot/)
  assert.match(profile, /No live availability feed is connected/)
})
