import React from 'react'

const iconProps = {
  'aria-hidden': true,
  focusable: 'false',
}

export function GoogleProviderIcon({ className = 'auth-provider-icon' }) {
  return (
    <svg {...iconProps} className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.8 12.23c0-.71-.06-1.39-.18-2.04H12v3.86h5.5a4.7 4.7 0 0 1-2.04 3.09v2.5h3.3c1.93-1.78 3.04-4.4 3.04-7.41Z" />
      <path fill="#34A853" d="M12 22c2.75 0 5.05-.91 6.73-2.46l-3.3-2.5c-.91.61-2.08.98-3.43.98-2.65 0-4.9-1.79-5.7-4.2H2.9v2.58A10.16 10.16 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.3 13.82A6.1 6.1 0 0 1 6 12c0-.63.11-1.24.3-1.82V7.6H2.9A10 10 0 0 0 2 12c0 1.61.39 3.13.9 4.4l3.4-2.58Z" />
      <path fill="#EA4335" d="M12 5.98c1.5 0 2.85.52 3.91 1.54l2.93-2.92C17.04 2.92 14.74 2 12 2a10.16 10.16 0 0 0-9.1 5.6l3.4 2.58c.8-2.41 3.05-4.2 5.7-4.2Z" />
    </svg>
  )
}

export function FacebookProviderIcon({ className = 'auth-provider-icon' }) {
  return (
    <svg {...iconProps} className={className} viewBox="0 0 24 24">
      <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.03 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.8-4.7 4.56-4.7 1.32 0 2.7.24 2.7.24v2.97h-1.52c-1.5 0-1.97.94-1.97 1.9v2.28h3.35l-.54 3.49H13.9V24C19.61 23.1 24 18.1 24 12.07Z" />
      <path fill="#FFFFFF" d="M16.71 15.56 17.25 12h-3.35V9.72c0-.97.47-1.9 1.97-1.9h1.52V4.85s-1.38-.24-2.7-.24c-2.76 0-4.56 1.68-4.56 4.7V12H7.08v3.56h3.05V24c.61.1 1.23.15 1.87.15.64 0 1.27-.05 1.87-.15v-8.44h2.84Z" />
    </svg>
  )
}

export function SmsProviderIcon({ className = 'auth-provider-icon' }) {
  return (
    <svg {...iconProps} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M8 7h8M8 11h8M9.5 16h5" />
    </svg>
  )
}
