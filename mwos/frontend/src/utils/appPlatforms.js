export const platformOptions = [
  {
    id: 'windows',
    name: 'Windows',
    type: 'Desktop web app',
    description: 'Launch your clinic workspace from your Start menu or desktop.',
    browser: 'Microsoft Edge or Google Chrome',
    steps: [
      'Open this page in Microsoft Edge or Google Chrome on Windows.',
      'Choose Install MWOS below when available, or use the browser menu: Apps → Install this site as an app (Edge), or Cast, save and share → Install page as app (Chrome).',
      'Confirm installation. Open MWOS from your Start menu and sign in with your existing account.',
    ],
  },
  {
    id: 'android',
    name: 'Android',
    type: 'Mobile web app',
    description: 'Keep appointments, messages, and telehealth on your home screen.',
    browser: 'Google Chrome',
    steps: [
      'Open this page in Google Chrome on your Android phone.',
      'Choose Install MWOS below when available. You can also open the browser menu (⋮), then choose Add to Home screen → Install.',
      'Open the MWOS icon on your home screen and sign in. Allow camera and microphone access when joining a consultation.',
    ],
  },
]
