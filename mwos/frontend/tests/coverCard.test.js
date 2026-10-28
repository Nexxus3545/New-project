import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { existsSync } from 'node:fs'
import { clinicFacilities, clinicTourFacilities, getDeliveryFacility } from '../src/utils/clinicFacilities.js'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const { default: CoverCard } = await server.ssrLoadModule('/src/components/common/CoverCard.jsx')
const { default: FacilityPhoto } = await server.ssrLoadModule('/src/components/common/FacilityPhoto.jsx')

test('the five facility photographs exist and have descriptive accessible captions', () => {
  assert.equal(clinicTourFacilities.length, 5)
  assert.equal(new Set(clinicTourFacilities.map((facility) => facility.src)).size, 5)
  for (const facility of clinicTourFacilities) {
    assert.ok(existsSync(`public${facility.src}`), facility.src)
    const html = renderToStaticMarkup(React.createElement(FacilityPhoto, { facility }))
    assert.ok(html.includes(`src="${facility.src}"`))
    assert.ok(html.includes(facility.alt))
    assert.match(html, /Room availability is confirmed by the clinic/)
  }
})

test('postnatal aliases show the ward while delivery routes show the birthing room', () => {
  for (const path of ['/postnatal-care', '/postnatal-monitoring']) assert.equal(getDeliveryFacility(path), clinicFacilities.ward)
  for (const path of ['/deliveries', '/labor-delivery']) assert.equal(getDeliveryFacility(path), clinicFacilities.birthing)
})

test('module covers render their supplied photo while retaining readable content', () => {
  for (const image of ['/reference/appointments-hero.jpg', '/reference/patient-intake.jpg', '/reference/reports-hero.jpg', '/clinic/prenatal-exam-room.jpg']) {
    const html = renderToStaticMarkup(React.createElement(CoverCard, { image, title: 'Clinic module', chips: ['Saved records'] }))
    assert.ok(html.includes(`src="${image}"`), image)
    assert.match(html, /object-cover/)
    assert.match(html, /from-black\/80/)
    assert.match(html, /Clinic module/)
    assert.match(html, /Saved records/)
    assert.match(html, /alt="" aria-hidden="true"/)
  }
})

test('covers without a photo retain their gradient without a broken image', () => {
  const html = renderToStaticMarkup(React.createElement(CoverCard, { title: 'Clinic module' }))
  assert.doesNotMatch(html, /<img/)
  assert.match(html, /bg-gradient-to-br/)
  assert.match(html, /Clinic module/)
})
