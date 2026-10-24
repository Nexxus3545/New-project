const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const babel = require('@babel/core');

function runtime() {
  const cache = new Map();
  let fail = false;
  const exports = {};
  const code = babel.transformSync(fs.readFileSync(path.join(__dirname, '../src/hooks/useMobileSettings.js'), 'utf8'), {
    babelrc: false, configFile: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  vm.runInNewContext(code, { exports, require: (name) => name === 'zustand' ? require('zustand') : {
    getItem: async (key) => cache.get(key) ?? null,
    setItem: async (key, value) => { if (fail) throw new Error('Storage blocked'); cache.set(key, value); },
  } });
  return { ...exports, cache, deny: () => { fail = true; } };
}

test('mobile preferences allow only safe display fields and recover malformed values', async () => {
  const app = runtime();
  for (const value of [null, 42, 'text', [], {}]) {
    assert.equal(app.normalizeMobileSettings(value).language, 'en');
  }
  const settings = app.normalizeMobileSettings({ language: 'fil', theme: 'dark', accent: 'teal', showClinicMedia: false, showTips: false, accessToken: 'secret', patientId: 'private' });
  assert.deepEqual(JSON.parse(JSON.stringify(settings)), { language: 'fil', theme: 'dark', accent: 'teal', showClinicMedia: false, showTips: false });
  assert.equal(app.normalizeMobileSettings({ theme: 'bad', accent: 'bad', showTips: 'false' }).showTips, true);
  app.cache.set('mwos-mobile:display-settings', '{broken');
  await app.useMobileSettings.getState().hydrate();
  assert.equal(app.useMobileSettings.getState().loaded, true);
});

test('mobile settings persist without tokens and failed persistence leaves current state intact', async () => {
  const app = runtime();
  await app.useMobileSettings.getState().update({ language: 'fil', theme: 'dark', showTips: false, accessToken: 'never-store' });
  const stored = app.cache.get('mwos-mobile:display-settings');
  assert.doesNotMatch(stored, /accessToken|never-store/);
  app.useMobileSettings.setState({ loaded: false });
  await app.useMobileSettings.getState().hydrate();
  assert.equal(app.useMobileSettings.getState().preferences.language, 'fil');
  assert.equal(app.useMobileSettings.getState().preferences.showTips, false);
  app.deny();
  await assert.rejects(app.useMobileSettings.getState().update({ language: 'en' }), /Storage blocked/);
  assert.equal(app.useMobileSettings.getState().preferences.language, 'fil');
});

test('mobile settings menu has unique accessible destinations and real appearance palettes', () => {
  const app = runtime();
  assert.equal(app.mobileSettingsSections.length, 7);
  assert.equal(new Set(app.mobileSettingsSections.map((item) => item.id)).size, 7);
  for (const item of app.mobileSettingsSections) assert.ok(item.icon && item.en && item.fil);
  const light = app.settingsPalette(app.normalizeMobileSettings({ theme: 'light' }), 'light');
  const dark = app.settingsPalette(app.normalizeMobileSettings({ theme: 'dark' }), 'light');
  assert.notEqual(light.background, dark.background);
  assert.notEqual(light.text, dark.text);
});

test('native settings are authenticated, use own activity, and never request device permissions on review', () => {
  const source = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const screen = source('screens/SettingsScreen.js');
  assert.match(screen, /api.get\('\/account\/activity'\)/);
  assert.match(screen, /enabled: section === 'activity'/);
  assert.match(screen, /getForegroundPermissionsAsync/);
  assert.match(screen, /getPermissionsAsync/);
  assert.doesNotMatch(screen, /requestForegroundPermissionsAsync|requestPermissionsAsync|old_values|new_values/);
  assert.match(screen, /SMS ownership is not verified/);
  assert.match(source('navigation/RootNavigator.js'), /user && \(!isPatient \|\| user.patientId\).*name="Settings"/);
  const home = source('screens/patient/PatientHomeScreen.js');
  assert.match(home, /contentPreferences.showClinicMedia/);
  assert.match(home, /contentPreferences.showTips/);
  assert.match(home, /SavedClinicReadings/);
});

function screenRuntime(app, activity = { data: [] }) {
  const calls = [];
  const queries = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: 'Fragment', useState: (value) => [value, () => {}], useEffect: () => {},
  };
  const native = Object.fromEntries(['ScrollView', 'Switch', 'Text', 'TouchableOpacity', 'View'].map((key) => [key, key]));
  const stubs = {
    react,
    'react-native': { ...native, AppState: {}, Linking: { openSettings: async () => {} } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 20 }) },
    '@tanstack/react-query': { useQuery: (options) => { queries.push(options); return activity; } },
    'expo-location': {}, 'expo-notifications': {},
    '../services/api': { get: async (url) => { calls.push(['api', url]); return { data: { data: [] } }; } },
    '../hooks/useAuthStore': { useAuthStore: () => ({ user: { id: 'own-user', role: 'patient', email: 'test@example.invalid' }, biometricAvailable: false, biometricEnabled: false }) },
    '../hooks/useMobileSettings': { ...app, useMobileSettings: () => app.useMobileSettings.getState() },
    '../components/Icon': { MobileIcon: 'MobileIcon' },
    '../components/ContactNumberCard': 'ContactNumberCard',
  };
  const module = { exports: {} };
  const code = babel.transformSync(fs.readFileSync(path.join(__dirname, '../src/screens/SettingsScreen.js'), 'utf8'), {
    babelrc: false, configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-react-jsx'), require.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    assert.ok(name in stubs, `Unexpected dependency: ${name}`); return stubs[name];
  } });
  const render = (section) => module.exports.default({ route: { params: { section } }, navigation: {
    push: (...args) => calls.push(['push', ...args]), navigate: (...args) => calls.push(['navigate', ...args]), goBack: () => calls.push(['back']),
  } });
  return { render, queries, calls };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  if (tree && typeof tree === 'object') return textOf(tree.props?.children);
  return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
}
test('native Settings renders seven actionable icon rows and accessible saved appearance choices', async () => {
  const app = runtime();
  const screen = screenRuntime(app);
  const menu = nodes(screen.render());
  const links = menu.filter((node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel !== 'Back');
  assert.equal(links.length, 7);
  links.find((node) => node.props.accessibilityLabel === 'Appearance').props.onPress();
  assert.deepEqual(JSON.parse(JSON.stringify(screen.calls[0])), ['push', 'Settings', { section: 'appearance' }]);
  const choices = nodes(screen.render('appearance'));
  const dark = choices.find((node) => node.props.accessibilityRole === 'radio' && textOf(node) === 'Dark');
  assert.equal(dark.props.accessibilityState.checked, false);
  await dark.props.onPress();
  assert.equal(app.useMobileSettings.getState().preferences.theme, 'dark');
  assert.equal(nodes(screen.render('appearance')).find((node) => node.props.accessibilityRole === 'radio' && textOf(node) === 'Dark').props.accessibilityState.checked, true);
  assert.match(textOf(screen.render('appearance')), /Other mobile screens keep their current clinic styling/);
  const fil = nodes(screen.render('language')).find((node) => node.props.accessibilityRole === 'radio' && textOf(node) === 'Filipino');
  await fil.props.onPress();
  assert.match(textOf(screen.render()), /Mga setting.*Wika.*Hitsura/);
});
test('native activity errors are not shown as empty success and content switches change real preferences', async () => {
  const app = runtime();
  const screen = screenRuntime(app, { isError: true });
  const failed = screen.render('activity');
  assert.match(textOf(failed), /Activity could not be loaded/);
  assert.doesNotMatch(textOf(failed), /No recorded activity yet/);
  const query = screen.queries[0];
  assert.equal(query.enabled, true);
  assert.deepEqual(Array.from(query.queryKey), ['own-account-activity-mobile', 'own-user']);
  await query.queryFn();
  assert.deepEqual(screen.calls[0], ['api', '/account/activity']);
  const toggles = nodes(screen.render('content')).filter((node) => node.type === 'Switch');
  assert.equal(toggles.length, 2);
  await toggles[0].props.onValueChange(false);
  assert.equal(app.useMobileSettings.getState().preferences.showClinicMedia, false);
  assert.match(textOf(screen.render('content')), /safety alerts/);
});
