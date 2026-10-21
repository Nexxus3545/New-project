import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import api from './api';

const callbackUrl = 'tmccopinomwos://oauth';
const errors = {
  oauth_account_exists: 'This email already has a clinic password account. Sign in with that password first.',
  oauth_role_restricted: 'Google sign-in is for patient accounts. Staff must use their clinic account.',
  oauth_account_inactive: 'This account is inactive. Please contact the clinic.',
  oauth_email_required: 'Google did not share a verified email address.',
  oauth_profile_incomplete: 'Your Google account needs a first and last name.',
};

export const signInWithGoogle = async () => {
  const { data } = await api.get('/auth/providers');
  if (!data?.data?.google) throw new Error('Google sign-in is unavailable right now. Please try again later.');
  const bytes = await Crypto.getRandomBytesAsync(32);
  const codeVerifier = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  const challenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const startUrl = `${api.defaults.baseURL}/auth/google?client=mobile&code_challenge_method=S256&code_challenge=${challenge}`;
  const result = await WebBrowser.openAuthSessionAsync(startUrl, callbackUrl);
  if (result.type !== 'success') return { cancelled: true };
  const match = result.url.match(/^tmccopinomwos:\/\/oauth\/?\?([^#]*)$/);
  if (!match) {
    throw new Error('The sign-in response was not recognized. Please start again.');
  }
  // React Native 0.74 does not implement WHATWG URL/searchParams getters.
  const params = new Map();
  for (const entry of match[1].split('&')) {
    const [key, ...value] = entry.split('=');
    const name = decodeURIComponent(key);
    if (params.has(name)) throw new Error('The sign-in response is ambiguous. Please start again.');
    params.set(name, decodeURIComponent(value.join('=').replace(/\+/g, ' ')));
  }
  const error = params.get('oauth_error');
  if (error) throw new Error(errors[error] || 'Google sign-in was not completed. Please try again.');
  const code = params.get('code');
  if (!code) throw new Error('The sign-in response is incomplete. Please start again.');
  const exchanged = await api.post('/auth/oauth/exchange', { code, codeVerifier });
  return exchanged.data.data;
};
