import { create } from 'zustand'
import { accentPresets, defaultAppearance, normalizeAppearance } from '../utils/appearance'

const getStoredAppearance = () => {
  try {
    const explicit = localStorage.getItem('appearance')
    if (explicit) return normalizeAppearance(JSON.parse(explicit))

    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser)
      return normalizeAppearance(parsedUser?.uiPreferences || {})
    }
  } catch {}

  return defaultAppearance
}

const resolveThemeMode = (theme) => {
  if (theme === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return theme
}

const applyAppearance = (appearance) => {
  const normalized = normalizeAppearance(appearance)
  const palette = accentPresets[normalized.accent] || accentPresets.rose
  const resolvedTheme = resolveThemeMode(normalized.theme)
  const root = document.documentElement

  root.classList.toggle('dark', resolvedTheme === 'dark')
  root.classList.toggle('ui-compact', normalized.density === 'compact')
  root.classList.toggle('ui-glass', normalized.surface === 'glass')
  root.classList.toggle('ui-motion-reduced', normalized.motion === 'reduced')

  root.style.setProperty('--accent', palette.accent)
  root.style.setProperty('--accent-strong', palette.accentStrong)
  root.style.setProperty('--accent-soft', palette.accentSoft)
  root.style.setProperty('--accent-ghost', palette.accentGhost)
  root.style.setProperty('--accent-text', palette.accentText)
  root.style.setProperty('--accent-ring', palette.accentRing)
  root.style.setProperty('--hero-start', palette.heroStart)
  root.style.setProperty('--hero-end', palette.heroEnd)

  localStorage.setItem('appearance', JSON.stringify(normalized))
  return { normalized, resolvedTheme }
}

export const useThemeStore = create((set, get) => ({
  preferences: defaultAppearance,
  resolvedTheme: 'light',

  initTheme: (initialPreferences) => {
    const source = initialPreferences ? normalizeAppearance(initialPreferences) : getStoredAppearance()
    const { normalized, resolvedTheme } = applyAppearance(source)
    set({ preferences: normalized, resolvedTheme })
  },

  setPreferences: (nextPreferences) => {
    const { normalized, resolvedTheme } = applyAppearance(nextPreferences)
    set({ preferences: normalized, resolvedTheme })
  },

  updatePreference: (key, value) => {
    const next = { ...get().preferences, [key]: value }
    const { normalized, resolvedTheme } = applyAppearance(next)
    set({ preferences: normalized, resolvedTheme })
  },

  toggleTheme: () => {
    const current = get().preferences.theme
    const nextTheme = current === 'dark' ? 'light' : 'dark'
    const next = { ...get().preferences, theme: nextTheme }
    const { normalized, resolvedTheme } = applyAppearance(next)
    set({ preferences: normalized, resolvedTheme })
  },

  resetTheme: () => {
    const { normalized, resolvedTheme } = applyAppearance(defaultAppearance)
    set({ preferences: normalized, resolvedTheme })
  },
}))
