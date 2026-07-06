export const colors = {
  brand: {
    pearl: '#fffaf6',
    blush: '#fff0ef',
    rose: '#ec6f75',
    copper: '#9c5960',
    lilac: '#f6e7e4',
    midnight: '#111827',
  },
  teal: {
    50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4',
    500: '#14b8a6', 600: '#0d9488', 700: '#0f766e',
  },
  rose: {
    50: '#fff1f2', 100: '#ffe4e6',
    500: '#f43f5e', 600: '#e11d48', 700: '#be123c',
  },
  success: '#0d9488',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#2563eb',
  white: '#ffffff',
  gray: {
    50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb',
    300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280',
    600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827',
  },
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
}

export const radius = {
  sm: 8, md: 14, lg: 20, xl: 28, full: 999,
}

export const shadow = {
  sm: {
    shadowColor: '#6b4450', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },
  md: {
    shadowColor: '#6b4450', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14, shadowRadius: 24, elevation: 10,
  },
  lg: {
    shadowColor: '#6b4450', shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18, shadowRadius: 30, elevation: 14,
  },
}

export const typography = {
  h1: { fontSize: 28, fontWeight: '700', color: colors.gray[900] },
  h2: { fontSize: 22, fontWeight: '700', color: colors.gray[900] },
  h3: { fontSize: 16, fontWeight: '600', color: colors.gray[800] },
  body: { fontSize: 14, fontWeight: '400', color: colors.gray[700] },
  bodyMd: { fontSize: 15, fontWeight: '400', color: colors.gray[700] },
  small: { fontSize: 12, fontWeight: '400', color: colors.gray[500] },
  label: { fontSize: 13, fontWeight: '500', color: colors.gray[600] },
  mono: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
}
