import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import postcss from 'postcss'

const stylesheet = postcss.parse(fs.readFileSync(new URL('../src/styles/landing.css', import.meta.url), 'utf8'))
const page = fs.readFileSync(new URL('../src/pages/LandingPage.jsx', import.meta.url), 'utf8')
const declarations = {}
stylesheet.walkRules('.clinic-landing', (rule) => rule.walkDecls((decl) => { declarations[decl.prop] = decl.value }))
const luminance = (hex) => hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
  .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)

test('public blush palette keeps strong text contrast without relying on headline shadow', () => {
  const paper = declarations['--clinic-paper']
  assert.ok(contrast(declarations['--clinic-ink'], paper) >= 7)
  assert.ok(contrast(declarations['--clinic-muted'], paper) >= 7)
  assert.ok(contrast(declarations['--clinic-rose'], paper) >= 4.5)
  assert.ok(contrast('#ffffff', declarations['--clinic-rose']) >= 4.5)
})

test('hero uses the same upright font throughout instead of a separate italic first-embrace style', () => {
  const title = page.match(/<h1 id="clinic-hero-title">(.*?)<\/h1>/)[1]
  assert.doesNotMatch(title, /<em|<i[\s>]|<br/)
  assert.match(title, /className="clinic-hero-emphasis"/)
  let shadow
  stylesheet.walkRules('.clinic-landing .clinic-public-hero .clinic-hero-emphasis', (rule) => rule.walkDecls('text-shadow', (decl) => { shadow = decl.value }))
  assert.ok(shadow, 'The requested emphasis is a subtle shadow, not another typeface')
})
