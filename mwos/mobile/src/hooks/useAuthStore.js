import { create } from 'zustand';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import api, { getToken, setToken, clearTokens } from '../services/api';

const persistJson = async (key, value) => {
  await setToken(key, JSON.stringify(value));
};

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  stepUpToken: null,
  biometricEnabled: false,

  initialize: async () => {
    try {
      const userStr = await getToken('user');
      const accessToken = await getToken('accessToken');
      const stepUpToken = await getToken('stepUpToken');
      const biometricEnabled = await getToken('biometricEnabled');

      set({
        user: userStr ? JSON.parse(userStr) : null,
        stepUpToken: stepUpToken || null,
        biometricEnabled: biometricEnabled === 'true',
        isInitialized: true,
      });

      if (!accessToken && !userStr) {
        set({ isInitialized: true });
      }
    } catch {
      set({ isInitialized: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/auth/login', { email: email.trim(), password });
      const { accessToken, refreshToken, user } = res.data.data;
      await setToken('accessToken', accessToken);
      await setToken('refreshToken', refreshToken);
      await persistJson('user', user);
      await setToken('stepUpToken', '');
      set({ user, isLoading: false, error: null, stepUpToken: null });
      return { success: true, user };
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Check your connection.';
      set({ isLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  loginWithBiometrics: async () => {
    set({ isLoading: true, error: null });
    try {
      if (!get().biometricEnabled) {
        throw new Error('Biometric unlock is not enabled for this device.');
      }

      const biometricsAvailable = await LocalAuthentication.hasHardwareAsync();
      const enrolled = biometricsAvailable && await LocalAuthentication.isEnrolledAsync();
      if (!biometricsAvailable || !enrolled) {
        throw new Error('Biometric authentication is not available on this device.');
      }

      const prompt = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock MWOS',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
      });

      if (!prompt.success) {
        throw new Error('Biometric authentication was cancelled.');
      }

      const refreshToken = await getToken('refreshToken');
      if (!refreshToken) {
        throw new Error('No saved session is available to unlock.');
      }

      const refreshRes = await api.post('/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefresh } = refreshRes.data.data;
      await setToken('accessToken', accessToken);
      await setToken('refreshToken', newRefresh);

      const meRes = await api.get('/auth/me');
      const user = meRes.data.data;
      await persistJson('user', user);
      set({ user, isLoading: false, error: null });
      return { success: true, user };
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Biometric unlock failed.';
      set({ isLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  registerPatient: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/auth/register', {
        ...payload,
        role: 'patient',
        email: payload.email?.trim(),
      });
      const { accessToken, refreshToken, user } = res.data.data;
      await setToken('accessToken', accessToken);
      await setToken('refreshToken', refreshToken);
      await persistJson('user', user);
      await setToken('stepUpToken', '');
      set({ user, isLoading: false, error: null, stepUpToken: null });
      return { success: true, user };
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed. Please try again.';
      set({ isLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  requestOtp: async (purpose = 'critical') => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/auth/otp/request', { purpose });
      set({ isLoading: false, error: null });
      return { success: true, ...res.data.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'Request failed. Please try again.';
      set({ isLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  verifyOtp: async ({ challengeId, code, purpose = 'critical' }) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/auth/otp/verify', { challengeId, code, purpose });
      const { stepUpToken } = res.data.data;
      await setToken('stepUpToken', stepUpToken);
      set({ isLoading: false, error: null, stepUpToken });
      return { success: true, stepUpToken };
    } catch (err) {
      const msg = err.response?.data?.message || 'OTP verification failed. Please try again.';
      set({ isLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  enableBiometricUnlock: async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Enable biometric unlock',
      cancelLabel: 'Cancel',
    });
    if (!result.success) {
      return { success: false, error: 'Biometric enrollment was cancelled.' };
    }

    await setToken('biometricEnabled', 'true');
    set({ biometricEnabled: true });
    return { success: true };
  },

  disableBiometricUnlock: async () => {
    try {
      await SecureStore.deleteItemAsync('biometricEnabled');
    } catch {}
    set({ biometricEnabled: false });
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch {}
    await clearTokens();
    set({ user: null, error: null, stepUpToken: null });
  },

  clearError: () => set({ error: null }),
  clearStepUp: async () => {
    await setToken('stepUpToken', '');
    set({ stepUpToken: null });
  },
  isPatient: () => get().user?.role === 'patient',
  isStaff: () => ['admin', 'doctor', 'midwife', 'nurse'].includes(get().user?.role),
}));
