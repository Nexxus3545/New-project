import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const { default: CoverCard } = await server.ssrLoadModule('/src/components/common/CoverCard.jsx')

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
