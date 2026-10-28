// Explicit operational smoke check, independent of builds/migrations. It uses
// synthetic opaque identifiers and never creates a clinical record or call.
const { randomUUID } = require('node:crypto');
const { createDailyVideoService, ROOM_CHECK_FIELDS } = require('./dailyVideo');

const checkDailyConfiguration = async (service = createDailyVideoService()) => {
  if (!service.configured()) throw Object.assign(new Error('Daily video is not configured.'), { videoOperation: 'configuration' });
  const sessionId = randomUUID();
  const participantIds = [randomUUID(), randomUUID()];
  let closed = false;
  let primaryFailure;
  try {
    const room = await service.ensureRoom(sessionId);
    await service.mintAdmission(room, { sessionId, userId: participantIds[0], role: 'patient' });
    await service.mintAdmission(room, { sessionId, userId: participantIds[1], role: 'doctor' });
    await service.closeRoom(sessionId, participantIds);
    closed = true;
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    // Attempt cleanup even if room validation or token minting fails after the
    // provider created the room. Any cleanup failure makes the check fail.
    if (!closed) {
      try { await service.deleteRoom(sessionId); } catch (cleanupError) {
        if (!primaryFailure) throw cleanupError;
        primaryFailure.videoCleanupOperation = cleanupError.videoOperation;
        primaryFailure.videoCleanupStatus = cleanupError.providerStatus;
      }
    }
  }
};

const safeDiagnostic = (error) => {
  const allowed = ['configuration', 'get-room', 'get-domain-config', 'create-room', 'mint-token', 'eject-participants', 'delete-room', 'room-url-check', 'room-config-check', 'token-response-check'];
  const category = allowed.includes(error?.videoOperation) ? error.videoOperation : 'configuration-check';
  const http = Number.isInteger(error?.providerStatus) && error.providerStatus >= 100 && error.providerStatus <= 599 ? ` HTTP ${error.providerStatus}` : '';
  const checks = category === 'room-config-check' && Array.isArray(error?.videoChecks)
    ? ROOM_CHECK_FIELDS.filter((field) => error.videoChecks.includes(field)) : [];
  const cleanup = allowed.includes(error?.videoCleanupOperation)
    ? `; cleanup ${error.videoCleanupOperation}${Number.isInteger(error.videoCleanupStatus) && error.videoCleanupStatus >= 100 && error.videoCleanupStatus <= 599 ? ` HTTP ${error.videoCleanupStatus}` : ''}`
    : '';
  return `${category}${http}${checks.length ? ` [${checks.join(',')}]` : ''}${cleanup}`;
};

if (require.main === module) {
  checkDailyConfiguration().then(() => {
    console.log('PASS Daily private-room creation, scoped admission tokens and cleanup.');
  }).catch((error) => {
    console.error(`FAIL Daily private video configuration check: ${safeDiagnostic(error)}.`);
    process.exitCode = 1;
  });
}

module.exports = { checkDailyConfiguration, safeDiagnostic };
