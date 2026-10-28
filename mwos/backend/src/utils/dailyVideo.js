const { createHash, createHmac } = require('node:crypto');

const API_ROOT = 'https://api.daily.co/v1';
const ROOM_SECONDS = 2 * 60 * 60;
const ADMISSION_SECONDS = 10 * 60;
const videoError = (message = 'Video service is temporarily unavailable. Please try again.', statusCode = 503, diagnostics = {}) => Object.assign(new Error(message), { statusCode, ...diagnostics });
const roomUrlError = () => videoError('The video room could not be verified.', 503, { videoOperation: 'room-url-check' });
const roomNameForSession = (sessionId) => `mwos-${createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 32)}`;
const ROOM_CHECK_FIELDS = Object.freeze([
  'room.name', 'room.privacy', 'room.config', 'config.exp', 'config.eject_at_room_exp',
  'config.max_participants', 'config.enable_knocking', 'config.enable_chat', 'config.enable_screenshare',
  'config.enable_transcription_storage', 'config.permissions.canAdmin', 'config.permissions.canSend',
  'domain.config', 'domain.config.enable_transcription_storage',
]);

// URLs come only from the authenticated provider response. Neither a client URL
// nor a stored URL is ever used as a server-side fetch destination.
const normalizeDailyRoomUrl = (value, roomName) => {
  if (typeof value !== 'string' || !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.daily\.co\//.test(value)) throw roomUrlError();
  let url;
  try { url = new URL(value); } catch { throw roomUrlError(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== `/${roomName}`) throw roomUrlError();
  return url.href;
};

const managedRoomNameForSession = (session) => {
  const name = roomNameForSession(session.id);
  if (session.meeting_provider !== 'external' || session.meeting_code !== name) return null;
  try { normalizeDailyRoomUrl(session.meeting_url, name); return name; } catch { return null; }
};

const roomProperties = (now) => ({
  exp: now + ROOM_SECONDS,
  eject_at_room_exp: true,
  max_participants: 4,
  enable_knocking: false,
  enable_chat: false,
  enable_screenshare: false,
  enable_prejoin_ui: true,
  enable_live_captions_ui: false,
  enable_transcription_storage: false,
  enable_terse_logging: true,
  start_video_off: true,
  start_audio_off: true,
  // No participant, including the clinician, receives recording/transcription
  // admin privileges. Lifecycle management stays in the authenticated MWOS API.
  permissions: { hasPresence: true, canSend: ['audio', 'video'], canAdmin: false },
});

const validatePrivateRoom = (room, expectedName, now, { verifiedDomainStorageDisabled = false } = {}) => {
  const config = room?.config;
  const admin = config?.permissions?.canAdmin;
  const media = config?.permissions?.canSend;
  // Daily documents admin permissions as false or an array/set of capabilities.
  // An explicit empty array grants none; an omitted value is not accepted.
  const adminDisabled = admin === false || (Array.isArray(admin) && admin.length === 0);
  const checks = {
    'room.name': room?.name === expectedName,
    'room.privacy': room?.privacy === 'private',
    'room.config': Boolean(config && typeof config === 'object' && !Array.isArray(config)),
    'config.exp': Number.isInteger(config?.exp) && config.exp > now && config.exp <= now + ROOM_SECONDS + 60,
    'config.eject_at_room_exp': config?.eject_at_room_exp === true,
    'config.max_participants': Number.isInteger(config?.max_participants) && config.max_participants >= 1 && config.max_participants <= 4,
    'config.enable_knocking': config?.enable_knocking === false,
    'config.enable_chat': config?.enable_chat === false,
    'config.enable_screenshare': config?.enable_screenshare === false,
    'config.enable_transcription_storage': config?.enable_transcription_storage === false ||
      (verifiedDomainStorageDisabled && config && !Object.hasOwn(config, 'enable_transcription_storage')),
    'config.permissions.canAdmin': adminDisabled,
    'config.permissions.canSend': Array.isArray(media) && media.length === 2 && media.includes('audio') && media.includes('video'),
  };
  const videoChecks = Object.keys(checks).filter((field) => !checks[field]);
  if (videoChecks.length) {
    throw videoError('The private video room could not be verified.', 503, { videoOperation: 'room-config-check', videoChecks });
  }
  return { name: expectedName, url: normalizeDailyRoomUrl(room.url, expectedName), expiresAt: config.exp };
};

const createDailyVideoService = ({ apiKey = process.env.DAILY_API_KEY, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) => {
  const configured = () => typeof apiKey === 'string' && Boolean(apiKey.trim());
  const opaqueIdentity = (sessionId, userId) => {
    if (!configured()) throw videoError('Video calling has not been configured yet.', 503, { videoOperation: 'configuration' });
    return createHmac('sha256', apiKey).update(`${sessionId}:${userId}`).digest('hex').slice(0, 32);
  };
  const request = async (path, method = 'GET', body, accepted = []) => {
    const videoOperation = method === 'DELETE' ? 'delete-room' : path === '/' ? 'get-domain-config' : path === '/meeting-tokens' ? 'mint-token' : path.endsWith('/eject') ? 'eject-participants' : method === 'POST' ? 'create-room' : 'get-room';
    if (!configured()) throw videoError('Video calling has not been configured yet.', 503, { videoOperation: 'configuration' });
    let response;
    try {
      response = await fetchImpl(`${API_ROOT}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
    } catch { throw videoError(undefined, 503, { videoOperation }); }
    if (!response.ok) {
      if (accepted.includes(response.status)) return { status: response.status };
      // Provider response bodies can contain sensitive values; never propagate
      // them into application errors or logs.
      throw videoError(undefined, 503, { videoOperation, providerStatus: response.status });
    }
    if (method === 'DELETE') return { status: response.status };
    try { return { status: response.status, data: await response.json() }; } catch { throw videoError(undefined, 503, { videoOperation, providerStatus: response.status }); }
  };
  const ensureRoom = async (sessionId) => {
    const name = roomNameForSession(sessionId);
    const current = Math.floor(now() / 1000);
    let result = await request(`/rooms/${name}`, 'GET', undefined, [404]);
    if (result.status === 404) {
      result = await request('/rooms', 'POST', { name, privacy: 'private', properties: roomProperties(current) }, [400, 409]);
      // Daily may return 400 or 409 for a concurrent duplicate. The existing
      // room must still pass every private-room check before a token is minted.
      if ([400, 409].includes(result.status)) {
        const createStatus = result.status;
        result = await request(`/rooms/${name}`, 'GET', undefined, [404]);
        if (result.status === 404) throw videoError(undefined, 503, { videoOperation: 'create-room', providerStatus: createStatus });
      }
    }
    try { return validatePrivateRoom(result.data, name, current); } catch (error) {
      // Daily may omit this false-default field in room responses. Verify the
      // domain inheritance before accepting that one omission; no other missing
      // room safety setting receives a default here.
      if (error.videoOperation !== 'room-config-check' || error.videoChecks?.length !== 1 ||
          error.videoChecks[0] !== 'config.enable_transcription_storage' ||
          !result.data?.config || Object.hasOwn(result.data.config, 'enable_transcription_storage')) throw error;
      const domain = await request('/');
      const config = domain.data?.config;
      const isConfig = config && typeof config === 'object' && !Array.isArray(config);
      // Primary Daily documentation: transcripts are ephemeral by default, and
      // the domain OpenAPI gives enable_transcription_storage default:false.
      // https://docs.daily.co/docs/guides/features/transcription#storage
      // https://docs.daily.co/reference/rest-api/domain/set-domain-config
      const disabled = isConfig && (!Object.hasOwn(config, 'enable_transcription_storage') || config.enable_transcription_storage === false);
      if (!disabled) throw videoError('The private video room could not be verified.', 503, {
        videoOperation: 'room-config-check', videoChecks: [isConfig ? 'domain.config.enable_transcription_storage' : 'domain.config'],
      });
      return validatePrivateRoom(result.data, name, current, { verifiedDomainStorageDisabled: true });
    }
  };
  const mintAdmission = async (room, { sessionId, userId, role }) => {
    const current = Math.floor(now() / 1000);
    const exp = Math.min(current + ADMISSION_SECONDS, room.expiresAt);
    if (exp <= current) throw videoError('This video room has expired. Please contact the clinic.', 409);
    const properties = {
      room_name: room.name,
      nbf: current - 5,
      exp,
      eject_at_token_exp: false,
      is_owner: false,
      user_id: opaqueIdentity(sessionId, userId),
      user_name: role === 'patient' ? 'Patient' : 'Care team',
      enable_screenshare: false,
      enable_prejoin_ui: true,
      enable_recording_ui: false,
      enable_live_captions_ui: false,
      enable_terse_logging: true,
      start_cloud_recording: false,
      auto_start_transcription: false,
      start_video_off: true,
      start_audio_off: true,
      permissions: { hasPresence: true, canSend: ['audio', 'video'], canAdmin: false },
    };
    const result = await request('/meeting-tokens', 'POST', { properties });
    const token = result.data?.token;
    if (typeof token !== 'string' || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw videoError(undefined, 503, { videoOperation: 'token-response-check' });
    return { provider: 'daily', roomUrl: room.url, token, expiresAt: new Date(exp * 1000).toISOString(), roomExpiresAt: new Date(room.expiresAt * 1000).toISOString() };
  };
  const deleteRoom = async (sessionId) => {
    // The route passes a validated session identifier, never a client URL.
    await request(`/rooms/${roomNameForSession(sessionId)}`, 'DELETE', undefined, [404]);
  };
  const closeRoom = async (sessionId, participantIds) => {
    const userIds = [...new Set(participantIds)].map((id) => opaqueIdentity(sessionId, id));
    if (!userIds.length) throw videoError('The video call could not be closed safely.');
    // Ban scoped identities before deleting the room: already-issued admission
    // tokens cannot race a terminal status update and rejoin during cleanup.
    for (let offset = 0; offset < userIds.length; offset += 100) {
      await request(`/rooms/${roomNameForSession(sessionId)}/eject`, 'POST', { user_ids: userIds.slice(offset, offset + 100), ban: true }, [404]);
    }
    await deleteRoom(sessionId);
  };
  return { configured, ensureRoom, mintAdmission, deleteRoom, closeRoom };
};

// Resolve configuration at request time; no key is exposed through status.
const dailyVideo = {
  configured: () => Boolean(process.env.DAILY_API_KEY?.trim()),
  ensureRoom: (...args) => createDailyVideoService().ensureRoom(...args),
  mintAdmission: (...args) => createDailyVideoService().mintAdmission(...args),
  deleteRoom: (...args) => createDailyVideoService().deleteRoom(...args),
  closeRoom: (...args) => createDailyVideoService().closeRoom(...args),
};

module.exports = { dailyVideo, createDailyVideoService, roomNameForSession, normalizeDailyRoomUrl, managedRoomNameForSession, validatePrivateRoom, roomProperties, ROOM_CHECK_FIELDS };
