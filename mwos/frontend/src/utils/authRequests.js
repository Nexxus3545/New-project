const publicAuthPaths = new Set([
  '/auth/login', '/auth/register', '/auth/refresh',
  '/auth/forgot-password', '/auth/reset-password', '/auth/providers',
  '/auth/sms-login/request', '/auth/sms-login/verify',
  '/auth/webauthn/login/start', '/auth/webauthn/login/finish',
  '/auth/oauth/exchange',
])

export const isPublicAuthRequest = (url) => {
  if (!url) return false
  try {
    const path = new URL(url, 'https://mwos.invalid').pathname
      .replace(/^\/api(?:\/v1)?(?=\/)/, '')
      .replace(/\/+$/, '')
    return publicAuthPaths.has(path)
  } catch {
    return false
  }
}

export const getAuthRecoveryAction = (error) => {
  const request = error.config
  if (error.response?.status !== 401 || !request || request._retry || isPublicAuthRequest(request.url)) {
    return 'none'
  }
  return error.response.data?.code === 'TOKEN_EXPIRED' ? 'refresh' : 'logout'
}
