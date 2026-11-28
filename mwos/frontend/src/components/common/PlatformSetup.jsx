import React, { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import PlatformLogo from './PlatformLogo'
import { getDevicePlatform, requestAppInstall, useInstallApp } from '../../utils/installApp'

export default function PlatformSetup({ card, focusOnChange }) {
  const { installed, canInstall } = useInstallApp()
  const heading = useRef(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const sameDevice = getDevicePlatform() === card.id

  useEffect(() => {
    setNotice('')
    if (focusOnChange) {
      heading.current?.focus({ preventScroll: true })
      heading.current?.scrollIntoView({ block: 'start' })
    }
  }, [card.id, focusOnChange])

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
      <p>Install MWOS from your browser and connect to the internet to use your clinic account.</p>
    </div>
  </section>
}
