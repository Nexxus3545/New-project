import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { clinicContact } from '../src/utils/clinicContact.js'

let server, Contact
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } })
  Contact = (await server.ssrLoadModule('/src/components/common/ClinicContact.jsx')).default
})
after(async () => { await server?.close() })

test('public clinic contact matches owner-confirmed hours, email and corrected complete phone number', () => {
  assert.equal(clinicContact.phone.replace(/\s/g, ''), '09926821514')
  assert.equal(clinicContact.phoneHref, 'tel:+639926821514')
  assert.equal(clinicContact.email, 'nexxus1122@gmail.com')
  assert.equal(clinicContact.days, 'Monday - Sunday')
  assert.equal(clinicContact.hours, 'Open 24 hours')
  assert.equal(clinicContact.timezone, 'Philippine time (UTC+8)')
  const map = new URL(clinicContact.mapSearch)
  assert.equal(map.origin, 'https://www.google.com')
  assert.equal(map.searchParams.get('api'), '1')
  assert.match(map.searchParams.get('query'), /TMC Copino.*Gajo, Tiwi, Albay/)
})

test('hours and contact render real action links without promising around-the-clock consultations', () => {
  const html = renderToStaticMarkup(React.createElement(StaticRouter, {}, React.createElement(Contact)))
  assert.match(html, /Working hours/)
  assert.match(html, /24 hours daily/)
  assert.match(html, /Opening hours are not a confirmed consultation slot/)
  assert.match(html, /Temporary contact details/)
  assert.match(html, /href="tel:\+639926821514"/)
  assert.match(html, /href="mailto:nexxus1122@gmail.com"/)
  assert.match(html, /target="_blank" rel="noopener noreferrer"/)
  assert.match(html, /data-app-icon="externalLink"/)
  assert.match(html, /href="\/portal\?intent=appointment"/)
  assert.doesNotMatch(html, /&amp;nearr;|&nearr;|doctor available|provider available|guaranteed|Open now/i)
})

test('the clinic-photo Facebook link uses an SVG instead of an unsupported named arrow entity', () => {
  const page = fs.readFileSync(new URL('../src/pages/LandingPage.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /&nearr;/)
  assert.match(page, /Visit the clinic Facebook page <AppIcon name="externalLink"/)
  assert.match(page, /<ClinicContact \/>/)
})
