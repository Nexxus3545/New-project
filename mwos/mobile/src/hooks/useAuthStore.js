import { create } from 'zustand';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import api, { getToken, setToken, clearTokens, lockTokens, unlockRefreshToken, enableBiometricToken, removeBiometricToken, purgePrivateCache } from '../services/api';
import { signInWithGoogle } from '../services/googleSignIn';

const persistJson = async (key, value) => {
  let stored = value;
  if (key === 'user') {
    stored = {
      id: value.id, role: value.role, patientId: value.patientId,
      firstName: value.firstName, lastName: value.lastName, email: value.email, phone: value.phone,
      avatarUrl: value.avatarUrl?.length < 512 ? value.avatarUrl : null,
      uiPreferences: value.uiPreferences,
      staffProfile: value.staffProfile ? {
        professionalTitle: value.staffProfile.professionalTitle,
        licenseStatus: value.staffProfile.licenseStatus, isVerified: value.staffProfile.isVerified,
      } : null,
    };
  }
  await setToken(key, JSON.stringify(stored));
};

const saveSession = async ({ accessToken, refreshToken, user }) => {
  const previous = await getToken('user');
  let previousId;
  try { previousId = previous ? JSON.parse(previous).id : null; } catch {}
  if (previousId !== user.id) await removeBiometricToken();
  await setToken('accessToken', accessToken);
  await setToken('refreshToken', refreshToken);
  await persistJson('user', user);
  await setToken('stepUpToken', '');
  return await getToken('biometricEnabled') === 'true';
};

const getBiometricCapability = async () => {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) {
    return {
      available: false,
      label: 'biometric unlock',
      message: 'This device does not support fingerprint or face recognition.',
    };
  }

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) {
    return {
      available: false,
      label: 'biometric unlock',
      message: 'Set up a fingerprint or face recognition in your device settings first.',
    };
  }

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const supportsFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const supportsFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const supportsIris = types.includes(LocalAuthentication.AuthenticationType.IRIS);
  const faceLabel = Platform.OS === 'ios' ? 'Face ID' : 'face recognition';
  const methods = [
    supportsFace ? faceLabel : null,
    supportsFingerprint ? 'fingerprint' : null,
    supportsIris ? 'iris recognition' : null,
  ].filter(Boolean);

  return {
    available: methods.length > 0,
    label: methods.length > 1 ? methods.join(' or ') : (methods[0] || 'biometric unlock'),
    message: methods.length > 0
      ? `Use ${methods.join(' or ')} to unlock MWOS.`
      : 'This device does not have a supported fingerprint or face recognition method.',
  };
};

const authenticateWithBiometrics = async (promptMessage) => {
  const capability = await getBiometricCapability();
  if (!capability.available) {
    throw new Error(capability.message);
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    promptDescription: 'Use your enrolled fingerprint or face recognition to continue.',
    cancelLabel: 'Cancel',
    fallbackLabel: '',
    disableDeviceFallback: true,
    requireConfirmation: true,
    // Health records require Android Class 3 biometrics, such as a fingerprint
    // or supported 3D face scan. iOS ignores this Android-only setting.
    biometricsSecurityLevel: 'strong',
  });

  if (!result.success) {
    const errors = {
      not_enrolled: 'Set up a fingerprint or face recognition in your device settings first.',
      not_available: 'Biometric authentication is not available on this device.',
      lockout: 'Biometric unlock is temporarily locked. Use your password to sign in.',
      user_cancel: 'Biometric unlock was cancelled.',
      authentication_failed: 'We could not verify your fingerprint or face. Please try again.',
    };
    throw new Error(errors[result.error] || 'Biometric unlock was not completed.');
  }

  return capability;
};

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  stepUpToken: null,
  biometricEnabled: false,
  biometricPending: false,
  biometricAvailable: false,
  biometricLabel: 'biometric unlock',

  initialize: async () => {
    try {
      const userStr = await getToken('user');
      const accessToken = await getToken('accessToken');
      const stepUpToken = await getToken('stepUpToken');
      let biometricEnabled = await getToken('biometricEnabled');
      if (biometricEnabled === 'true' && await getToken('biometricVaultVersion') !== '1') {
        // Old builds did not protect the saved refresh token with device biometrics.
        await removeBiometricToken();
        biometricEnabled = 'false';
      }
      const capability = await getBiometricCapability();
      const storedUser = userStr ? JSON.parse(userStr) : null;
      const requiresBiometricUnlock = biometricEnabled === 'true' && Boolean(storedUser);
      await purgePrivateCache();
      if (requiresBiometricUnlock) await lockTokens();

      set({
        // A device with biometric unlock enabled must re-authenticate before
        // restoring a saved clinical session after the app has been closed.
        user: requiresBiometricUnlock || !accessToken ? null : storedUser,
        stepUpToken: stepUpToken || null,
        biometricEnabled: biometricEnabled === 'true',
        biometricPending: requiresBiometricUnlock,
        biometricAvailable: capability.available,
        biometricLabel: capability.label,
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
      const biometricEnabled = await saveSession({ accessToken, refreshToken, user });
      set({ user, isLoading: false, error: null, stepUpToken: null, biometricPending: false, biometricEnabled });
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

      const capability = await getBiometricCapability();
      if (!capability.available) throw new Error(capability.message);
      // The operating system gates this refresh token with its enrolled biometrics.
      const refreshToken = await unlockRefreshToken();
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
      set({
        user,
        isLoading: false,
        error: null,
        biometricPending: false,
        biometricAvailable: capability.available,
        biometricLabel: capability.label,
      });
      return { success: true, user };
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Biometric unlock failed.';
      set({ isLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  loginWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      const session = await signInWithGoogle();
      if (session.cancelled) { set({ isLoading: false }); return { success: false, cancelled: true }; }
      const biometricEnabled = await saveSession(session);
      set({ user: session.user, isLoading: false, error: null, stepUpToken: null, biometricPending: false, biometricEnabled });
      return { success: true, user: session.user };
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Google sign-in was not completed.';
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  completeGoogleProfile: async (form) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/auth/oauth/complete-profile', form);
      const user = response.data.data;
      await persistJson('user', user);
      set({ user, isLoading: false });
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Your patient details could not be saved.';
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  updateContact: async (phone) => {
    set({ isLoading: true, error: null });
    try {
      const user = get().user;
      const response = await api.patch('/auth/profile', {
        email: user.email, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl, phone,
      });
      await persistJson('user', response.data.data);
      set({ user: response.data.data, isLoading: false });
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Your contact number could not be saved.';
      set({ isLoading: false, error: message });
      return { success: false, error: message };
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
      const biometricEnabled = await saveSession({ accessToken, refreshToken, user });
      set({ user, isLoading: false, error: null, stepUpToken: null, biometricPending: false, biometricEnabled });
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
    set({ isLoading: true, error: null });
    try {
      const capability = await authenticateWithBiometrics('Enable MWOS biometric unlock');
      await enableBiometricToken();
      set({
        biometricEnabled: true,
        biometricPending: false,
        biometricAvailable: capability.available,
        biometricLabel: capability.label,
        isLoading: false,
      });
      return { success: true, label: capability.label };
    } catch (error) {
      const message = error.message || 'Biometric unlock could not be enabled.';
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  disableBiometricUnlock: async () => {
    try {
      await removeBiometricToken();
    } catch {}
    set({ biometricEnabled: false, biometricPending: false });
  },

  lockForBiometric: async () => {
    if (!get().biometricEnabled || !get().user) {
      return;
    }

    // The saved profile and refresh token stay in encrypted device storage.
    // Only the in-memory session is locked until the user authenticates again.
    set({ user: null, stepUpToken: null, biometricPending: true, error: null });
    await lockTokens();
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch {}
    await clearTokens();
    set({ user: null, error: null, stepUpToken: null, biometricEnabled: false, biometricPending: false });
  },

  clearError: () => set({ error: null }),
  clearStepUp: async () => {
    await setToken('stepUpToken', '');
    set({ stepUpToken: null });
  },
  isPatient: () => get().user?.role === 'patient',
  isStaff: () => ['admin', 'doctor', 'midwife', 'nurse'].includes(get().user?.role),
}));
