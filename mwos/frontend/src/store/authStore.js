import { create } from 'zustand'
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'
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

const persistStepUpToken = (token) => {
  if (token) localStorage.setItem('stepUpToken', token)
  else localStorage.removeItem('stepUpToken')
}

const clearStoredSession = () => {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
  localStorage.removeItem('stepUpToken')
}

const applyAuthenticatedUser = (user, set) => {
  persistUser(user)
  useThemeStore.getState().initTheme(user?.uiPreferences)
  set({ user, isLoading: false, isHydrating: false, error: null })
}

const setSessionTokens = (accessToken, refreshToken, stepUpToken = null) => {
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
  persistStepUpToken(stepUpToken)
}

export const useAuthStore = create((set, get) => ({
  user: getStoredUser(),
  stepUpToken: localStorage.getItem('stepUpToken'),
  isLoading: false,
  isHydrating: false,
  error: null,

  hydrateSession: async () => {
    const token = localStorage.getItem('accessToken')
    if (!token) {
      clearStoredSession()
      useThemeStore.getState().resetTheme()
      set({ user: null, stepUpToken: null, isHydrating: false, isLoading: false, error: null })
      return
    }

    set({ isHydrating: true })
    try {
      const res = await api.get('/auth/me')
      const storedStepUp = localStorage.getItem('stepUpToken')
      applyAuthenticatedUser(res.data.data, set)
      set({ stepUpToken: storedStepUp })
    } catch {
      clearStoredSession()
      useThemeStore.getState().resetTheme()
      set({ user: null, stepUpToken: null, isHydrating: false, error: null })
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/login', { email, password })
      const { accessToken, refreshToken, user } = res.data.data
      setSessionTokens(accessToken, refreshToken)
      applyAuthenticatedUser(user, set)
      set({ stepUpToken: null })
      return { success: true, user }
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please try again.'
      set({ isLoading: false, error: msg })
      return { success: false, error: msg }
    }
  },

  loginWithPasskey: async (email) => {
    set({ isLoading: true, error: null })
    try {
      if (!browserSupportsWebAuthn()) {
        throw new Error('WebAuthn is not supported in this browser.')
      }

      const startRes = await api.post('/auth/webauthn/login/start', { email: email.trim() })
      const { options, sessionToken } = startRes.data.data
      const credential = await startAuthentication({ optionsJSON: options })
      const finishRes = await api.post('/auth/webauthn/login/finish', { credential, sessionToken })
      const { accessToken, refreshToken, stepUpToken, user } = finishRes.data.data
      setSessionTokens(accessToken, refreshToken, stepUpToken || null)
      applyAuthenticatedUser(user, set)
      set({ stepUpToken: stepUpToken || null })
      return { success: true, user, stepUpToken }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Passkey sign-in failed.'
      set({ isLoading: false, error: msg })
      return { success: false, error: msg }
    }
  },

  registerPasskey: async (purpose = 'critical') => {
    set({ isLoading: true, error: null })
    try {
      if (!browserSupportsWebAuthn()) {
        throw new Error('WebAuthn is not supported in this browser.')
      }

      const startRes = await api.post('/auth/webauthn/register/start', { purpose })
      const { options, sessionToken } = startRes.data.data
      const credential = await startRegistration({ optionsJSON: options })
      const finishRes = await api.post('/auth/webauthn/register/finish', {
        credential,
        sessionToken,
        label: 'Browser passkey',
      })

      set({ isLoading: false, error: null })
      return { success: true, ...finishRes.data.data }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Passkey registration failed.'
      set({ isLoading: false, error: msg })
      return { success: false, error: msg }
    }
  },

  requestOtp: async (purpose = 'critical') => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/otp/request', { purpose })
      set({ isLoading: false, error: null })
      return { success: true, ...res.data.data }
    } catch (err) {
      const msg = err.response?.data?.message || 'Request failed. Please try again.'
      set({ isLoading: false, error: msg })
      return { success: false, error: msg }
    }
  },

  verifyOtp: async ({ challengeId, code, purpose = 'critical' }) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/otp/verify', { challengeId, code, purpose })
      const { stepUpToken } = res.data.data
      persistStepUpToken(stepUpToken)
      set({ isLoading: false, error: null, stepUpToken })
      return { success: true, stepUpToken }
    } catch (err) {
      const msg = err.response?.data?.message || 'OTP verification failed. Please try again.'
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
    set({ user: null, error: null, isLoading: false, isHydrating: false, stepUpToken: null })
  },

  clearError: () => set({ error: null }),
  clearStepUp: () => {
    persistStepUpToken(null)
    set({ stepUpToken: null })
  },
  isAdmin: () => get().user?.role === 'admin',
  isDoctor: () => get().user?.role === 'doctor',
  isMidwife: () => get().user?.role === 'midwife',
  isNurse: () => get().user?.role === 'nurse',
  isPatient: () => get().user?.role === 'patient',
  isStaff: () => ['admin', 'doctor', 'midwife', 'nurse'].includes(get().user?.role),
}))
