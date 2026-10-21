const crypto = require('crypto');

const MOBILE_CALLBACK = 'tmccopinomwos://oauth';
const challengePattern = /^[A-Za-z0-9_-]{43}$/;
const verifierPattern = /^[A-Za-z0-9._~-]{43,128}$/;

const createState = (query = {}) => {
  const nonce = crypto.randomBytes(32).toString('base64url');
  if (query.client === undefined) return nonce;
  if (query.client !== 'mobile' || query.code_challenge_method !== 'S256' || !challengePattern.test(query.code_challenge || '')) {
    throw new Error('The mobile sign-in request is invalid. Restart sign-in from the MWOS app.');
  }
  return `m1.${nonce}.${query.code_challenge}`;
};

const readMobileState = (state) => {
  const parts = String(state || '').split('.');
  return parts.length === 3 && parts[0] === 'm1' && challengePattern.test(parts[1]) && challengePattern.test(parts[2])
    ? { codeChallenge: parts[2] }
    : null;
};

const codeHash = (code, challenge = '') => crypto.createHash('sha256')
  .update(challenge ? `${code}.${challenge}` : code)
  .digest('hex');

const verifierChallenge = (verifier) => {
  if (typeof verifier !== 'string' || !verifierPattern.test(verifier)) throw new Error('Invalid sign-in proof.');
  return crypto.createHash('sha256').update(verifier).digest('base64url');
};

module.exports = { MOBILE_CALLBACK, createState, readMobileState, codeHash, verifierChallenge };
