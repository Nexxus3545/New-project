import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laborObservationSeries } from '../src/utils/laborObservations.js';
test('labor chart uses true elapsed time and preserves zero and missing observations', () => {
  const rows = laborObservationSeries([{ recorded_at: '2026-11-09T02:15:00Z', cervical_dilation: null }, { recorded_at: '2026-11-09T00:00:00Z', cervical_dilation: '0' }, { recorded_at: 'invalid' }, { recorded_at: '2026-11-09T00:15:00Z', cervical_dilation: '2' }]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].cervical_dilation, 0);
  assert.equal(rows[2].cervical_dilation, null);
  assert.equal(rows[1].timestamp - rows[0].timestamp, 15 * 60000);
  assert.equal(rows[2].timestamp - rows[1].timestamp, 120 * 60000);
});
