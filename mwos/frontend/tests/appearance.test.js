import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultAppearance, appearanceOptions, getAppearancePalette, normalizeAppearance } from '../src/utils/appearance.js'
import backendAppearance from '../../backend/src/utils/appearance.js'

const luminance = (hex) => hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
  .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
const contrast = (foreground, background) => {
  const a = luminance(foreground), b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

test('only theme mode remains customizable and old account/browser options migrate to fixed blush defaults', () => {
  assert.deepEqual(Object.keys(appearanceOptions), ['theme'])
  for (const input of [null, {}, 'invalid', { accent: 'slate', density: 'compact', surface: 'glass', motion: 'full', unrelated: 'ignored' }]) {
    assert.deepEqual(normalizeAppearance(input), defaultAppearance)
    assert.deepEqual(backendAppearance.sanitizeUiPreferences(input), defaultAppearance)
  }
  for (const theme of ['light', 'dark', 'system']) {
    const input = { theme, accent: 'rose', density: 'compact', motion: 'full' }
    assert.deepEqual(normalizeAppearance(input), { ...defaultAppearance, theme })
    assert.deepEqual(backendAppearance.sanitizeUiPreferences(input), normalizeAppearance(input))
  }
})

test('blush text, selected controls, links and white button labels retain at least 4.5:1 contrast', () => {
  for (const theme of ['light', 'dark']) {
    const palette = getAppearancePalette(theme)
    const page = theme === 'dark' ? '#0f172a' : '#fff7fa'
    for (const [foreground, background] of [
      ['#ffffff', palette.accent], ['#ffffff', palette.heroStart], ['#ffffff', palette.heroEnd],
      [palette.accentLink, page], [palette.accentText, palette.accentSoft], [palette.accentStrong, page],
    ]) assert.ok(contrast(foreground, background) >= 4.5, `${theme}: ${foreground} on ${background}`)
  }
  for (const pair of [['#382c35', '#fff2f7'], ['#65535f', '#fff2f7'], ['#f7edf3', '#281e29'], ['#d5bdcd', '#281e29'], ['#766473', '#ffffff'], ['#b5a3b4', '#0f172a']]) {
    assert.ok(contrast(...pair) >= 4.5)
  }
})
