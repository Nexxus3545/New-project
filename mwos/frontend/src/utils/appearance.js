export const defaultAppearance = {
  theme: 'light',
  accent: 'blush',
  density: 'comfortable',
  surface: 'solid',
  motion: 'reduced',
}

export const appearanceOptions = {
  theme: [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ],
}

export const accentPresets = {
  blush: {
    accent: '#98405f',
    accentStrong: '#78334f',
    accentSoft: '#fae7ef',
    accentGhost: '#fff5f9',
    accentText: '#78334f',
    accentLink: '#98405f',
    accentRing: 'rgba(152, 64, 95, 0.42)',
    heroStart: '#71334d',
    heroEnd: '#98405f',
  },
}

export const getAppearancePalette = (theme = 'light') => theme === 'dark' ? {
  ...accentPresets.blush,
  accentStrong: '#f2bdd1',
  accentSoft: '#3b2532',
  accentGhost: '#271c25',
  accentText: '#f8d9e5',
  accentLink: '#f2bdd1',
  accentRing: 'rgba(242, 189, 209, 0.6)',
  heroStart: '#442536',
  heroEnd: '#5c3146',
} : accentPresets.blush

// Legacy palettes/spacing cannot override the clinic's fixed, readable defaults.
export const normalizeAppearance = (input = {}) => ({
  ...defaultAppearance,
  theme: appearanceOptions.theme.some((option) => option.value === input?.theme) ? input.theme : defaultAppearance.theme,
})
