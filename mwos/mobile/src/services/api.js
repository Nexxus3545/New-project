import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEFAULT_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:5000/api',
  ios: 'http://127.0.0.1:5000/api',
  default: 'http://localhost:5000/api',
});

const BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_BASE_URL;

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
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    console.error('SecureStore set error:', e);
  }
};

const clearTokens = async () => {
  try {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('user');
    await SecureStore.deleteItemAsync('stepUpToken');
  } catch {}
};

const clearStepUp = async () => {
  try {
    await SecureStore.deleteItemAsync('stepUpToken');
  } catch {}
};

const buildCacheKey = (config) => {
  const params = config?.params ? JSON.stringify(config.params) : '';
  return `offline-cache:${config?.url || ''}:${params}`;
};

const saveGetCache = async (config, data) => {
  try {
    if (config.method?.toLowerCase() !== 'get') return;
    await AsyncStorage.setItem(
      buildCacheKey(config),
      JSON.stringify({ cachedAt: new Date().toISOString(), data })
    );
  } catch {}
};

const loadGetCache = async (config) => {
  try {
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

    if (error.response?.status === 401 && !original?._retry) {
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

export { getToken, setToken, clearTokens };
export default api;
