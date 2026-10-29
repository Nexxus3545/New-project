const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;

function passwordPolicyChecks(value) {
  const text = typeof value === 'string' ? value : '';
  return {
    length: typeof value === 'string' && [...text].length >= PASSWORD_MIN_LENGTH,
    letter: /\p{L}/u.test(text),
    number: /[0-9]/.test(text),
    symbol: /[\p{P}\p{S}]/u.test(text),
    supported: typeof value === 'string' && Buffer.byteLength(text, 'utf8') <= PASSWORD_MAX_BYTES && !/[\u0000-\u001f\u007f]/.test(text),
  };
}

function passwordPolicyError(value) {
  const checks = passwordPolicyChecks(value);
  if (typeof value !== 'string') return 'Enter a password with at least 8 characters, including a letter, a number, and a symbol.';
  if (Buffer.byteLength(value, 'utf8') > PASSWORD_MAX_BYTES) return 'Password is too long. Shorten it and try again.';
  if (!Object.values(checks).every(Boolean)) return 'Use at least 8 characters with a letter, a number, and a symbol. Spaces do not count as symbols; control characters are not allowed.';
  return null;
}

module.exports = { PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES, passwordPolicyChecks, passwordPolicyError };
