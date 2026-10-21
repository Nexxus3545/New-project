export const PRODUCTION_API_URL = 'https://tmc-copino-mwos-api.vercel.app/api';

export const resolveApiUrl = (configured) => {
  const value = configured?.trim().replace(/\/+$/, '') || PRODUCTION_API_URL;
  if (!/^https?:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/.test(value)) throw new Error('Invalid MWOS API URL.');
  return value.endsWith('/api') ? value : `${value}/api`;
};

export const isPublicAuthRequest = (path) => [
  '/auth/login', '/auth/register', '/auth/refresh', '/auth/providers',
  '/auth/oauth/exchange', '/auth/forgot-password', '/auth/reset-password',
].includes(path);
