import { create } from 'zustand';
import api, { getToken, setToken, clearTokens } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async () => {
    try {
      const userStr = await getToken('user');
      const accessToken = await getToken('accessToken');
      if (userStr && accessToken) {
        set({ user: JSON.parse(userStr), isInitialized: true });
      } else {
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
      await setToken('user', JSON.stringify(user));
      set({ user, isLoading: false, error: null });
      return { success: true, user };
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Check your connection.';
      set({ isLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch {}
    await clearTokens();
    set({ user: null, error: null });
  },

  clearError: () => set({ error: null }),
  isPatient: () => get().user?.role === 'patient',
  isStaff: () => ['admin', 'doctor', 'midwife', 'nurse'].includes(get().user?.role),
}));
