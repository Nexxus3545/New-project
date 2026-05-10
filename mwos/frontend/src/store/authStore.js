import { create } from 'zustand'
import api from '../utils/api'
import { useThemeStore } from './themeStore'

const getStoredUser = () => {
  try {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

const persistUser = (user) => {
  localStorage.setItem('user', JSON.stringify(user))
}

const clearStoredSession = () => {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
}

const applyAuthenticatedUser = (user, set) => {
  persistUser(user)
  useThemeStore.getState().initTheme(user?.uiPreferences)
  set({ user, isLoading: false, isHydrating: false, error: null })
}

export const useAuthStore = create((set, get) => ({
  user: getStoredUser(),
  isLoading: false,
  isHydrating: false,
  error: null,

  hydrateSession: async () => {
    const token = localStorage.getItem('accessToken')
    if (!token) {
      clearStoredSession()
      useThemeStore.getState().resetTheme()
      set({ user: null, isHydrating: false, isLoading: false, error: null })
      return
    }

    set({ isHydrating: true })
    try {
      const res = await api.get('/auth/me')
      applyAuthenticatedUser(res.data.data, set)
    } catch {
      clearStoredSession()
      useThemeStore.getState().resetTheme()
      set({ user: null, isHydrating: false, error: null })
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/login', { email, password })
      const { accessToken, refreshToken, user } = res.data.data
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
      applyAuthenticatedUser(user, set)
      return { success: true, user }
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please try again.'
      set({ isLoading: false, error: msg })
      return { success: false, error: msg }
    }
  },

  register: async (payload) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/register', payload)
      const { accessToken, refreshToken, user } = res.data.data
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
      applyAuthenticatedUser(user, set)
      return { success: true, user }
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed. Please try again.'
      set({ isLoading: false, error: msg })
      return { success: false, error: msg }
    }
  },

  forgotPassword: async (email) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/forgot-password', { email })
      set({ isLoading: false, error: null })
      return { success: true, message: res.data?.message || 'Reset link sent' }
    } catch (err) {
      const msg = err.response?.data?.message || 'Request failed. Please try again.'
      set({ isLoading: false, error: msg })
      return { success: false, error: msg }
    }
  },

  resetPassword: async (token, newPassword) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/reset-password', { token, newPassword })
      set({ isLoading: false, error: null })
      return { success: true, message: res.data?.message || 'Password reset complete' }
    } catch (err) {
      const msg = err.response?.data?.message || 'Password reset failed. Please try again.'
      set({ isLoading: false, error: msg })
      return { success: false, error: msg }
    }
  },

  updateCurrentUser: (user) => {
    applyAuthenticatedUser(user, set)
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {}

    clearStoredSession()
    useThemeStore.getState().resetTheme()
    set({ user: null, error: null, isLoading: false, isHydrating: false })
  },

  clearError: () => set({ error: null }),

  isAdmin: () => get().user?.role === 'admin',
  isDoctor: () => get().user?.role === 'doctor',
  isMidwife: () => get().user?.role === 'midwife',
  isNurse: () => get().user?.role === 'nurse',
  isPatient: () => get().user?.role === 'patient',
  isStaff: () => ['admin', 'doctor', 'midwife', 'nurse'].includes(get().user?.role),
}))
