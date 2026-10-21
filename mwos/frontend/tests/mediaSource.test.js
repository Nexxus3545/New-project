import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getMediaSource, CLINIC_TULI_REPLAY } from '../src/utils/mediaSource.js'

test('public Facebook videos use a fixed video embed, while a clinic page is only a link', () => {
  const video = getMediaSource('https://web.facebook.com/clinic/videos/123456789/')
  assert.equal(video.kind, 'embed')
  assert.equal(new URL(video.embedUrl).hostname, 'www.facebook.com')
  assert.equal(new URL(video.embedUrl).pathname, '/plugins/video.php')
  assert.equal(getMediaSource('https://www.facebook.com/people/clinic/123/').kind, 'link')
  assert.equal(getMediaSource(CLINIC_TULI_REPLAY).kind, 'link')
})
test('direct video files and YouTube have playable sources without embedding arbitrary websites', () => {
  assert.equal(getMediaSource('https://cdn.example/video.mp4?token=public').kind, 'video')
  assert.equal(getMediaSource('https://youtu.be/abcdefghijk').kind, 'embed')
  assert.equal(getMediaSource('https://untrusted.example/page').kind, 'link')
  for (const url of ['javascript:alert(1)', 'http://cdn.example/video.mp4', 'https://name:password@example.com/v.mp4']) {
    assert.equal(getMediaSource(url), null)
  }
})
