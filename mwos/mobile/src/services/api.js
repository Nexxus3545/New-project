import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveApiUrl, isPublicAuthRequest } from './apiConfig';

const BASE_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL);
const biometricOptions = {
  requireAuthentication: true,
  keychainService: 'mwos-biometric-session',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: 'Unlock your MWOS session',
};

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

const getToken = async (key) => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

const setToken = async (key, value) => {
  if (key === 'refreshToken' && await getToken('biometricEnabled') === 'true') {
    await SecureStore.setItemAsync('biometricRefreshToken', value, biometricOptions);
  }
  await SecureStore.setItemAsync(key, value);
};

const unlockRefreshToken = () => SecureStore.getItemAsync('biometricRefreshToken', biometricOptions);
const enableBiometricToken = async () => {
  const token = await getToken('refreshToken');
  if (!token) throw new Error('Sign in again before enabling fingerprint unlock.');
  await SecureStore.setItemAsync('biometricRefreshToken', token, biometricOptions);
  await setToken('biometricEnabled', 'true');
  await setToken('biometricVaultVersion', '1');
};
const removeBiometricToken = async () => {
  await SecureStore.deleteItemAsync('biometricRefreshToken', biometricOptions);
  await SecureStore.deleteItemAsync('biometricEnabled');
  await SecureStore.deleteItemAsync('biometricVaultVersion');
};
const lockTokens = async () => {
  await SecureStore.deleteItemAsync('accessToken');
  await SecureStore.deleteItemAsync('refreshToken');
  await SecureStore.deleteItemAsync('stepUpToken');
};

const clearTokens = async () => {
  try {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('user');
    await SecureStore.deleteItemAsync('stepUpToken');
    await removeBiometricToken();
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith('offline-cache:')));
  } catch {}
};

const clearStepUp = async () => {
  try {
    await SecureStore.deleteItemAsync('stepUpToken');
  } catch {}
};

const buildCacheKey = (config) => {
  const params = config?.params ? JSON.stringify(config.params) : '';
  return `public-cache:${config?.url || ''}:${params}`;
};
const isPublicContent = (config) => ['/media-feed/posts', '/reviews/summary'].includes(config?.url);
const purgePrivateCache = async () => {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith('offline-cache:')));
};

const saveGetCache = async (config, data) => {
  try {
    if (config.method?.toLowerCase() !== 'get' || !isPublicContent(config)) return;
    await AsyncStorage.setItem(
      buildCacheKey(config),
      JSON.stringify({ cachedAt: new Date().toISOString(), data })
    );
  } catch {}
};

const loadGetCache = async (config) => {
  try {
    if (!isPublicContent(config)) return null;
    const cachedRaw = await AsyncStorage.getItem(buildCacheKey(config));
    if (!cachedRaw) return null;
    const parsed = JSON.parse(cachedRaw);
    return parsed?.data || null;
  } catch {
    return null;
  }
};

api.interceptors.request.use(
  async (config) => {
    if (isPublicAuthRequest(config.url)) {
      delete config.headers.Authorization;
      delete config.headers['X-Step-Up-Token'];
      return config;
    }
    const token = await getToken('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;

    const stepUpToken = await getToken('stepUpToken');
    if (stepUpToken) config.headers['X-Step-Up-Token'] = stepUpToken;

    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

api.interceptors.response.use(
  async (res) => {
    await saveGetCache(res.config, res.data);
    return res;
  },
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && original && !original._retry && !isPublicAuthRequest(original.url)) {
      if (error.response?.data?.code === 'TOKEN_EXPIRED') {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          });
        }

        original._retry = true;
        isRefreshing = true;

        const refreshToken = await getToken('refreshToken');
        if (!refreshToken) {
          processQueue(error, null);
          isRefreshing = false;
          await clearTokens();
          return Promise.reject(error);
        }

        try {
          const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
          const { accessToken, refreshToken: newRefresh } = res.data.data;
          await setToken('accessToken', accessToken);
          await setToken('refreshToken', newRefresh);
          processQueue(null, accessToken);
          original.headers.Authorization = `Bearer ${accessToken}`;
          return api(original);
        } catch (refreshError) {
          processQueue(refreshError, null);
          await clearTokens();
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      await clearTokens();
    }

    if (error.response?.status === 403 && ['STEP_UP_REQUIRED', 'STEP_UP_PURPOSE_MISMATCH'].includes(error.response?.data?.code)) {
      await clearStepUp();
    }

    if (!error.response && original?.method?.toLowerCase() === 'get') {
      const cached = await loadGetCache(original);
      if (cached) {
        return {
          data: cached,
          status: 200,
          statusText: 'OFFLINE_CACHE',
          headers: {},
          config: original,
          request: {},
        };
      }
    }

    return Promise.reject(error);
  }
);

export { getToken, setToken, clearTokens, lockTokens, unlockRefreshToken, enableBiometricToken, removeBiometricToken, purgePrivateCache };
export default api;
