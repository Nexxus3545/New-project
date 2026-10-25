const DEFAULT_UI_PREFERENCES = {
  theme: 'light',
  accent: 'blush',
  density: 'comfortable',
  surface: 'solid',
  motion: 'reduced',
};

const sanitizeUiPreferences = (input = {}) => ({
  ...DEFAULT_UI_PREFERENCES,
  theme: ['system', 'light', 'dark'].includes(input?.theme) ? input.theme : 'light',
});

module.exports = { DEFAULT_UI_PREFERENCES, sanitizeUiPreferences };
