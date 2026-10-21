import { useEffect, useState } from 'react'
import api, { socialAuthAvailable } from '../utils/api'

const unavailableProviders = { google: false }

export const getSignInProviderNote = (providers, checkFailed) => {
  if (!providers) return 'Checking sign-in options...'
  if (checkFailed) return "We couldn't check Google sign-in availability. Please use the email and password form."
  if (!providers.google) return 'Google sign-in is unavailable right now. Use the email and password form to continue.'
  return 'Google sign-in is for patient accounts. Staff should use their clinic email and password.'
}

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
          setProviders({ google: data?.data?.google === true })
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

  const note = getSignInProviderNote(providers, checkFailed)

  return { providers, note }
}
