export const defaultAppearance = {
  theme: 'system',
  accent: 'teal',
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
    { value: 'teal', label: 'Lagoon' },
    { value: 'rose', label: 'Coral' },
    { value: 'amber', label: 'Sunrise' },
    { value: 'cyan', label: 'Skyline' },
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
  teal: {
    accent: '#0f766e',
    accentStrong: '#115e59',
    accentSoft: '#ccfbf1',
    accentGhost: '#f0fdfa',
    accentText: '#134e4a',
    accentRing: 'rgba(15, 118, 110, 0.28)',
    heroStart: '#0f766e',
    heroEnd: '#2dd4bf',
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
  cyan: {
    accent: '#0891b2',
    accentStrong: '#0e7490',
    accentSoft: '#cffafe',
    accentGhost: '#ecfeff',
    accentText: '#155e75',
    accentRing: 'rgba(8, 145, 178, 0.28)',
    heroStart: '#0e7490',
    heroEnd: '#22d3ee',
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
