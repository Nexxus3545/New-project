const { managedRoomNameForSession } = require('./dailyVideo');
const { parseSchedule, parseDuration } = require('./teleconsultScheduling');
const invalidInput = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

// Legacy compatibility only; new consultations use provider-managed Daily rooms.
// No remote URL is fetched here.
const normalizeGoogleMeetUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\/meet\.google\.com\//i.test(value.trim())) {
    throw invalidInput('Use a valid HTTPS Google Meet link, such as https://meet.google.com/abc-defg-hij.');
  }
  let url;
  try { url = new URL(value.trim()); } catch { throw invalidInput('Invalid Google Meet link.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'meet.google.com' || url.username || url.password || url.port || !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname)) {
    throw invalidInput('Use a standard Google Meet room link. Other hosts and link formats are not accepted.');
  }
  return `https://meet.google.com/${url.pathname.split('/')[1]}`;
};

// The server provisions an embedded private room only when a participant joins.
// Client-provided links never become the room for a new consultation.
const buildTeleconsultMeetingDetails = () => ({ meetingProvider: 'external', meetingCode: null, meetingUrl: '' });

const transitions = {
  requested: new Set(['requested', 'scheduled', 'cancelled']),
  scheduled: new Set(['scheduled', 'active', 'cancelled']),
  active: new Set(['completed']),
  completed: new Set(),
  cancelled: new Set(),
};

const prepareTeleconsultUpdate = (session, body = {}, now = new Date()) => {
  const status = body.status || session.status;
  if (!transitions[session.status]?.has(status)) throw invalidInput('This consultation status transition is not allowed.', 409);
  const details = !['completed', 'cancelled'].includes(status) && managedRoomNameForSession(session)
    ? { meetingProvider: 'external', meetingCode: session.meeting_code, meetingUrl: session.meeting_url }
    : buildTeleconsultMeetingDetails();
  let startAt = status === 'scheduled' && Object.hasOwn(body, 'startAt') ? body.startAt : session.start_at;
  if (status === 'scheduled') startAt = parseSchedule(startAt instanceof Date ? startAt.toISOString() : startAt);
  if (status === 'requested') startAt = null;
  if (status === 'active') startAt = parseSchedule(startAt instanceof Date ? startAt.toISOString() : startAt);
  const durationMinutes = parseDuration(Object.hasOwn(body, 'durationMinutes') ? body.durationMinutes : (session.duration_minutes ?? 30));
  return { status, ...details, durationMinutes, startAt: startAt || null, endAt: status === 'completed' || status === 'cancelled' ? now.toISOString() : null };
};

module.exports = { buildTeleconsultMeetingDetails, normalizeGoogleMeetUrl, parseSchedule, prepareTeleconsultUpdate };
