export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_BYTES = 72
const utf8Bytes = (text) => [...text].reduce((size, character) => {
  const code = character.codePointAt(0)
  return size + (code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4)
}, 0)

export function passwordPolicyChecks(value) {
  const text = typeof value === 'string' ? value : ''
  return {
    length: typeof value === 'string' && [...text].length >= PASSWORD_MIN_LENGTH,
    letter: /\p{L}/u.test(text),
    number: /[0-9]/.test(text),
    symbol: /[\p{P}\p{S}]/u.test(text),
    supported: typeof value === 'string' && utf8Bytes(text) <= PASSWORD_MAX_BYTES && !/[\u0000-\u001f\u007f]/.test(text),
  }
}

export const passwordMeetsPolicy = (value) => Object.values(passwordPolicyChecks(value)).every(Boolean)
export function passwordPolicyError(value) {
  if (typeof value !== 'string') return 'Enter a password with at least 8 characters, including a letter, a number, and a symbol.'
  if (utf8Bytes(value) > PASSWORD_MAX_BYTES) return 'Password is too long. Shorten it and try again.'
  return passwordMeetsPolicy(value) ? null : 'Use at least 8 characters with a letter, a number, and a symbol. Spaces do not count as symbols; control characters are not allowed.'
}
