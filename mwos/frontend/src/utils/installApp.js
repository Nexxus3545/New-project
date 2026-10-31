import { useSyncExternalStore } from 'react'

const subscribers = new Set()
let promptEvent = null
let initialized = false
let state = { canInstall: false, installed: false }
const publish = change => {
  state = { ...state, ...change }
  subscribers.forEach(notify => notify())
}

export function getDevicePlatform(device = navigator) {
  const agent = device.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && device.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(agent)) return 'android'
  if (/Windows/i.test(agent)) return 'windows'
  if (/Macintosh|Mac OS/i.test(agent)) return 'macos'
  return ''
}

export function initializeInstallApp() {
  if (initialized) return
  initialized = true
  const standalone = window.matchMedia('(display-mode: standalone)')
  const updateDisplay = () => publish({ installed: standalone.matches || navigator.standalone === true })
  updateDisplay()
  standalone.addEventListener('change', updateDisplay)
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    promptEvent = event
    publish({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    promptEvent = null
    publish({ installed: true, canInstall: false })
  })
  // Register only the production worker, including local production previews.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => console.warn('MWOS offline connection screen could not be registered.'))
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }
}

export function useInstallApp() {
  return useSyncExternalStore(notify => {
    subscribers.add(notify)
    return () => subscribers.delete(notify)
  }, () => state, () => state)
}

export async function requestAppInstall() {
  const event = promptEvent
  if (!event) return 'unavailable'
  promptEvent = null
  publish({ canInstall: false })
  try {
    // Called directly from the user's click, while browser activation is available.
    await event.prompt()
    const choice = await event.userChoice
    return choice.outcome
  } catch {
    return 'unavailable'
  }
}
