export const defaultAppearance = {
  theme: 'light',
  accent: 'rose',
  density: 'comfortable',
  surface: 'solid',
  motion: 'full',
}

export const appearanceOptions = {
  theme: [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ],
  accent: [
    { value: 'blush', label: 'Blush' },
    { value: 'rose', label: 'Coral' },
    { value: 'lavender', label: 'Lavender' },
    { value: 'amber', label: 'Sunrise' },
    { value: 'slate', label: 'Graphite' },
  ],
  density: [
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'compact', label: 'Compact' },
  ],
  surface: [
    { value: 'solid', label: 'Solid' },
    { value: 'glass', label: 'Glass' },
  ],
  motion: [
    { value: 'full', label: 'Full motion' },
    { value: 'reduced', label: 'Reduced motion' },
  ],
}

export const accentPresets = {
  blush: {
    accent: '#f472b6',
    accentStrong: '#be185d',
    accentSoft: '#fce7f3',
    accentGhost: '#fff1f7',
    accentText: '#9d174d',
    accentRing: 'rgba(244, 114, 182, 0.28)',
    heroStart: '#f9a8d4',
    heroEnd: '#fde7f3',
  },
  rose: {
    accent: '#e11d48',
    accentStrong: '#be123c',
    accentSoft: '#ffe4e6',
    accentGhost: '#fff1f2',
    accentText: '#9f1239',
    accentRing: 'rgba(225, 29, 72, 0.28)',
    heroStart: '#be123c',
    heroEnd: '#fb7185',
  },
  lavender: {
    accent: '#a855f7',
    accentStrong: '#7c3aed',
    accentSoft: '#f3e8ff',
    accentGhost: '#faf5ff',
    accentText: '#6b21a8',
    accentRing: 'rgba(168, 85, 247, 0.28)',
    heroStart: '#c084fc',
    heroEnd: '#f5d0fe',
  },
  amber: {
    accent: '#d97706',
    accentStrong: '#b45309',
    accentSoft: '#fef3c7',
    accentGhost: '#fffbeb',
    accentText: '#92400e',
    accentRing: 'rgba(217, 119, 6, 0.28)',
    heroStart: '#b45309',
    heroEnd: '#f59e0b',
  },
  slate: {
    accent: '#475569',
    accentStrong: '#334155',
    accentSoft: '#e2e8f0',
    accentGhost: '#f8fafc',
    accentText: '#1e293b',
    accentRing: 'rgba(71, 85, 105, 0.28)',
    heroStart: '#334155',
    heroEnd: '#64748b',
  },
}

export const normalizeAppearance = (input = {}) => ({
  ...defaultAppearance,
  ...Object.fromEntries(
    Object.entries(input || {}).filter(([key, value]) => {
      const allowed = appearanceOptions[key]?.map((option) => option.value)
      return allowed?.includes(value)
    })
  ),
})
