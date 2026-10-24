import { create } from 'zustand'

const defaults = { language: 'en', showClinicMedia: true, showTips: true }
export const normalizeSettings = (input = {}) => {
  const value = input && typeof input === 'object' ? input : {}
  return ({
  language: value.language === 'fil' ? 'fil' : 'en',
  showClinicMedia: typeof value.showClinicMedia === 'boolean' ? value.showClinicMedia : true,
  showTips: typeof value.showTips === 'boolean' ? value.showTips : true,
  })
}
const readSettings = () => {
  try { return normalizeSettings(JSON.parse(localStorage.getItem('mwos-display-settings') || '{}')) } catch { return defaults }
}
export const useSettingsStore = create((set, get) => ({
  preferences: readSettings(),
  update: (patch) => {
    const preferences = normalizeSettings({ ...get().preferences, ...patch })
    // Only non-clinical display choices belong in this browser's local storage.
    localStorage.setItem('mwos-display-settings', JSON.stringify(preferences))
    set({ preferences })
  },
}))

export const settingsSections = [
  { id: 'account', en: 'Account & security', fil: 'Account at seguridad', icon: 'compliance' },
  { id: 'language', en: 'Language', fil: 'Wika', icon: 'language' },
  { id: 'privacy-checkup', en: 'Privacy checkup', fil: 'Pagsusuri ng privacy', icon: 'privacyCheck' },
  { id: 'privacy', en: 'Privacy Center', fil: 'Sentro ng privacy', icon: 'lock' },
  { id: 'activity', en: 'Activity log', fil: 'Talaan ng aktibidad', icon: 'activity' },
  { id: 'content', en: 'Content preferences', fil: 'Mga kagustuhan sa nilalaman', icon: 'preferences' },
  { id: 'appearance', en: 'Appearance', fil: 'Hitsura', icon: 'appearance' },
]
