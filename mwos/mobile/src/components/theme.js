export const colors = {
  // Teal — staff
  teal: {
    50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4',
    500: '#14b8a6', 600: '#0d9488', 700: '#0f766e',
  },
  // Rose — patient
  rose: {
    50: '#fff1f2', 100: '#ffe4e6',
    500: '#f43f5e', 600: '#e11d48', 700: '#be123c',
  },
  // Semantic
  success: '#0d9488',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#2563eb',
  // Neutrals
  white: '#ffffff',
  gray: {
    50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb',
    300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280',
    600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827',
  },
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24,
};

export const radius = {
  sm: 6, md: 10, lg: 14, xl: 18, full: 999,
};

export const shadow = {
  sm: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  md: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 4,
  },
};

export const typography = {
  h1: { fontSize: 24, fontWeight: '700', color: colors.gray[900] },
  h2: { fontSize: 20, fontWeight: '600', color: colors.gray[900] },
  h3: { fontSize: 16, fontWeight: '600', color: colors.gray[800] },
  body: { fontSize: 14, fontWeight: '400', color: colors.gray[700] },
  bodyMd: { fontSize: 15, fontWeight: '400', color: colors.gray[700] },
  small: { fontSize: 12, fontWeight: '400', color: colors.gray[500] },
  label: { fontSize: 13, fontWeight: '500', color: colors.gray[600] },
  mono: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
};
