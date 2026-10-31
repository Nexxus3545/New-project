import React, { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import PlatformLogo from './PlatformLogo'
import { getDevicePlatform, requestAppInstall, useInstallApp } from '../../utils/installApp'

export const platformOptions = [
  { id: 'windows', name: 'Windows', type: 'Desktop web app', description: 'Launch your clinic workspace from your Start menu or desktop.', browser: 'Microsoft Edge or Google Chrome', steps: ['Open this page in Microsoft Edge or Google Chrome on Windows.', 'Choose Install MWOS below when available, or use the browser menu: Apps → Install this site as an app (Edge), or Cast, save and share → Install page as app (Chrome).', 'Confirm installation. Open MWOS from your Start menu and sign in with your existing account.'] },
  { id: 'android', name: 'Android', type: 'Mobile web app', description: 'Keep appointments, messages, and telehealth on your home screen.', browser: 'Google Chrome', steps: ['Open this page in Google Chrome on your Android phone.', 'Choose Install MWOS below when available. You can also open the browser menu (⋮), then choose Add to Home screen → Install.', 'Open the MWOS icon on your home screen and sign in. Allow camera and microphone access when joining a consultation.'] },
  { id: 'macos', name: 'macOS', type: 'Desktop web app', description: 'Open the same MWOS system in its own window from your Dock.', browser: 'Safari on macOS Sonoma or later, or Chrome', steps: ['Open this page in Safari on macOS Sonoma (14) or later.', 'Choose File → Add to Dock, name the app MWOS, then select Add. In Chrome, use Install MWOS when offered, or the browser’s install menu.', 'Launch MWOS from your Dock or Applications and sign in. On older versions of Safari, use the web portal or Chrome.'] },
  { id: 'ios', name: 'iOS', type: 'Mobile web app', description: 'Add MWOS to your iPhone or iPad and open your care portal directly.', browser: 'Safari', steps: ['Open this page in Safari on your iPhone or iPad.', 'Open Share (or the page menu, then Share), and choose Add to Home Screen. Keep Open as Web App enabled if that option appears, then tap Add.', 'Open MWOS from your home screen and sign in. Allow camera and microphone access when joining a consultation.'] },
]

export default function PlatformSetup({ platform, focusOnChange }) {
  const { installed, canInstall } = useInstallApp()
  const device = getDevicePlatform()
  const card = platformOptions.find(item => item.id === platform) || platformOptions[0]
  const heading = useRef(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const sameDevice = !device || device === card.id

  useEffect(() => {
    setNotice('')
    if (focusOnChange) {
      heading.current?.focus({ preventScroll: true })
      heading.current?.scrollIntoView({ block: 'start' })
    }
  }, [platform, focusOnChange])

  const install = async () => {
    setBusy(true)
    const result = await requestAppInstall()
    setNotice(result === 'accepted'
      ? 'Installation requested. Finish in your browser, then open MWOS from your device.'
      : result === 'dismissed' ? 'Installation cancelled. You can try again from your browser menu or open MWOS now.'
        : 'Use the browser steps below to install, or open MWOS now.')
    setBusy(false)
  }

  return <section className="download-setup" aria-labelledby="setup-title">
    <div className="download-setup-intro">
      <span className="download-setup-ready">{installed && sameDevice ? 'Installed on this device' : 'Web app available now'}</span>
      <h2 id="setup-title" ref={heading} tabIndex={-1}><PlatformLogo platform={card.id} /> MWOS for {card.name}</h2>
      <p>Your existing MWOS account opens the same appointments, records, messages, and telehealth, with access based on your role.</p>
      <p className="download-setup-browser">Use {card.browser}.</p>
      {!sameDevice && <p className="download-device-note">Viewing {card.name} setup. Open this page on your {card.name} device to install there.</p>}
      <div className="download-setup-actions">
        {sameDevice && canInstall && !installed && <button className="download-install-button" type="button" onClick={install} disabled={busy}>{busy ? 'Opening installer…' : 'Install MWOS'}</button>}
        <Link className="download-open-button" to="/portal">Open MWOS <span aria-hidden="true">→</span></Link>
        <Link className="download-account-link" to="/register">Create patient account</Link>
      </div>
      <p role="status" className="download-install-notice">{installed && sameDevice ? 'MWOS is installed. Open it from your device’s app icon, or continue here.' : notice}</p>
    </div>
    <div className="download-setup-steps">
      <h3>{installed && sameDevice ? 'For another device' : 'Install on your device'}</h3>
      <ol>{card.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <p>Internet is required. This installs the MWOS web app; it is not an APK, EXE, or App Store download.</p>
    </div>
  </section>
}
