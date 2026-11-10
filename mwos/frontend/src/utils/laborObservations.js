export function laborObservationSeries(records = []) {
  return records.map(record => ({ ...record, timestamp: Date.parse(record.recorded_at), cervical_dilation: record.cervical_dilation == null || record.cervical_dilation === '' ? null : Number(record.cervical_dilation) }))
    .filter(record => Number.isFinite(record.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(record => ({ ...record, cervical_dilation: Number.isFinite(record.cervical_dilation) ? record.cervical_dilation : null }));
}
export const laborTimeLabel = timestamp => new Date(timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
