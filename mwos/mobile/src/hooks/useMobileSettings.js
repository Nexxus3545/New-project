import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

export const normalizeMobileSettings = (input = {}) => {
  const value = input && typeof input === 'object' ? input : {}
  return ({
  language: value.language === 'fil' ? 'fil' : 'en',
  theme: value.theme === 'dark' ? 'dark' : 'light',
  accent: ['coral', 'teal', 'graphite'].includes(value.accent) ? value.accent : 'coral',
  showClinicMedia: typeof value.showClinicMedia === 'boolean' ? value.showClinicMedia : true,
  showTips: typeof value.showTips === 'boolean' ? value.showTips : true,
  })
}
const key = 'mwos-mobile:display-settings'
export const useMobileSettings = create((set, get) => ({
  preferences: normalizeMobileSettings(), loaded: false,
  hydrate: async () => {
    try { set({ preferences: normalizeMobileSettings(JSON.parse(await AsyncStorage.getItem(key) || '{}')), loaded: true }) }
    catch { set({ loaded: true }) }
  },
  update: async (patch) => {
    const preferences = normalizeMobileSettings({ ...get().preferences, ...patch })
    // Device-wide display preferences only. Never store tokens, records, or activity here.
    await AsyncStorage.setItem(key, JSON.stringify(preferences))
    set({ preferences })
  },
}))

export const mobileSettingsSections = [
  { id: 'account', en: 'Account & security', fil: 'Account at seguridad', icon: 'account-lock-outline' },
  { id: 'language', en: 'Language', fil: 'Wika', icon: 'web' },
  { id: 'privacy-checkup', en: 'Privacy checkup', fil: 'Pagsusuri ng privacy', icon: 'shield-check-outline' },
  { id: 'privacy', en: 'Privacy Center', fil: 'Sentro ng privacy', icon: 'lock-outline' },
  { id: 'activity', en: 'Activity log', fil: 'Talaan ng aktibidad', icon: 'format-list-bulleted' },
  { id: 'content', en: 'Content preferences', fil: 'Mga kagustuhan sa nilalaman', icon: 'tune' },
  { id: 'appearance', en: 'Appearance', fil: 'Hitsura', icon: 'palette-outline' },
]

export const settingsPalette = (preferences) => {
  const dark = preferences.theme === 'dark'
  return {
    background: dark ? '#0f172a' : '#fffaf6', card: dark ? '#1e293b' : '#ffffff',
    text: dark ? '#f8fafc' : '#172033', muted: dark ? '#b8c4d7' : '#5b667a',
    border: dark ? '#475569' : '#e6dfe3', soft: dark ? '#334155' : '#f3edef',
    accent: { coral: '#984451', teal: '#0f766e', graphite: '#475569' }[preferences.accent],
  }
}
