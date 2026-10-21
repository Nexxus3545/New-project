const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const { MOBILE_CALLBACK, createState, readMobileState, codeHash, verifierChallenge } = require('../src/utils/oauthHandoff');

test('web OAuth keeps the existing state and code hash format', () => {
  const state = createState({});
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(readMobileState(state), null);
  assert.equal(codeHash('code'), crypto.createHash('sha256').update('code').digest('hex'));
});

test('native sign-in requires S256 and binds the one-time code to the original app', () => {
  const verifier = crypto.randomBytes(32).toString('hex');
  const challenge = verifierChallenge(verifier);
  const state = createState({ client: 'mobile', code_challenge: challenge, code_challenge_method: 'S256' });
  assert.deepEqual(readMobileState(state), { codeChallenge: challenge });
  assert.equal(codeHash('code', challenge), codeHash('code', verifierChallenge(verifier)));
  assert.notEqual(codeHash('code', challenge), codeHash('code'));
  assert.notEqual(codeHash('code', challenge), codeHash('code', verifierChallenge('x'.repeat(64))));
  assert.equal(MOBILE_CALLBACK, 'tmccopinomwos://oauth');
});

test('arbitrary redirect targets, weak PKCE, and malformed proofs are not accepted', () => {
  for (const query of [{ client: 'other' }, { client: 'mobile' }, { client: 'mobile', code_challenge: 'x'.repeat(43), code_challenge_method: 'plain' }]) {
    assert.throws(() => createState(query));
  }
  for (const proof of ['', 'short', 'x'.repeat(129), '!'.repeat(64)]) assert.throws(() => verifierChallenge(proof));
  assert.equal(readMobileState('m1.bad.bad'), null);
});
