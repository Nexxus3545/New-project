import { useEffect, useState } from 'react'
import api, { socialAuthAvailable } from '../utils/api'

const unavailableProviders = { google: false, facebook: false }

export default function useSignInProviders() {
  const [providers, setProviders] = useState(null)
  const [checkFailed, setCheckFailed] = useState(false)

  useEffect(() => {
    if (!socialAuthAvailable) {
      setProviders(unavailableProviders)
      return undefined
    }

    const controller = new AbortController()
    api.get('/auth/providers', { timeout: 6000, signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setProviders({ google: data?.data?.google === true, facebook: data?.data?.facebook === true })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setProviders(unavailableProviders)
          setCheckFailed(true)
        }
      })
    return () => controller.abort()
  }, [])

  const note = !providers
    ? 'Checking sign-in options...'
    : checkFailed
      ? "We couldn't check social sign-in availability. Please use the email and password form."
      : !providers.google && !providers.facebook
        ? 'Google and Facebook are being set up. Use the email and password form to continue.'
        : 'Google and Facebook are for patient accounts. Staff should use their clinic email and password.'

  return { providers, note }
}
