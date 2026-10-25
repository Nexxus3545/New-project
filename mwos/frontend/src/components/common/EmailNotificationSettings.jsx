import React from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'

export default function EmailNotificationSettings() {
  const settings = useQuery({ queryKey: ['email-notification-settings'], queryFn: () => api.get('/notifications/settings').then((response) => response.data.data) })
  return <section className="card space-y-3" aria-label="Email and Google sign-in security">
    <h2 className="section-title">Email and Google sign-in security</h2>
    {settings.isLoading ? <p role="status" className="text-sm text-slate-500">Checking clinic email availability...</p> : settings.isError ? <p role="alert" className="text-sm text-slate-500">Email availability could not be checked. Please ask the clinic before relying on email updates.</p> : <>
      <p className="text-sm text-slate-600 dark:text-slate-300">{settings.data?.configured ? 'The clinic email sender is configured. Google sign-in alerts and appointment schedule/status updates can be sent to the verified email linked through Google. Changing your profile email does not change this recipient.' : 'The clinic email sender is not connected yet. Sign-in and appointment alerts remain available in MWOS Notifications; email delivery is not active.'}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">{settings.data?.googleEmailCodeRequired ? 'An additional email code is required after Google identity verification. Access is not granted until the code is verified.' : 'The additional Google email-code check is not active yet. The clinic must verify email delivery before enabling it.'}</p>
      <p className="text-xs text-slate-500">{settings.data?.deliveryVerified ? 'The clinic has recorded a sender delivery check.' : 'Successful delivery to a real inbox has not been recorded. Configured credentials alone do not prove delivery.'}</p>
    </>}
    <p className="text-xs leading-5 text-slate-500">Appointment emails exclude symptoms, diagnoses, and pregnancy details. Email delivery can be delayed or filtered as spam; always check the latest appointment status in MWOS.</p>
  </section>
}
