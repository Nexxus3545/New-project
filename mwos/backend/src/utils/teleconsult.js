const crypto = require('crypto');

const SUPPORTED_PROVIDERS = new Set(['jitsi', 'zoom', 'twilio_video', 'external']);

const normalizeProvider = (value) => {
  const provider = String(value || process.env.TELECONSULT_PROVIDER || 'jitsi').trim().toLowerCase();
  return SUPPORTED_PROVIDERS.has(provider) ? provider : 'jitsi';
};

const slugify = (value = 'mwos-teleconsult') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 32) || 'mwos-teleconsult';

const buildTeleconsultMeetingDetails = ({
  threadId,
  patientId = null,
  clinicianId = null,
  title = null,
  reason = null,
  provider = null,
  baseUrl = null,
}) => {
  const meetingProvider = normalizeProvider(provider);
  const resolvedBaseUrl = String(
    baseUrl
    || process.env.TELECONSULT_MEETING_BASE_URL
    || 'https://meet.jit.si'
  ).replace(/\/+$/, '');

  const roomSeed = [threadId, patientId, clinicianId, title, reason].filter(Boolean).join(':');
  const roomHash = crypto.createHash('sha1').update(roomSeed || 'mwos-teleconsult').digest('hex').slice(0, 12);
  const roomSlug = slugify(title || reason || 'mwos-teleconsult');
  const meetingCode = `${roomSlug}-${String(threadId || 'thread').slice(0, 8)}-${roomHash}`;
  const meetingUrl = `${resolvedBaseUrl}/${encodeURIComponent(meetingCode)}`;

  return {
    meetingProvider,
    meetingCode,
    meetingUrl,
  };
};

module.exports = {
  buildTeleconsultMeetingDetails,
  normalizeProvider,
  slugify,
};
