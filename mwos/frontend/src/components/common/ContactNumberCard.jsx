import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import { updateAccountProfile } from '../../utils/accountProfile'

export default function ContactNumberCard() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const updateCurrentUser = useAuthStore((state) => state.updateCurrentUser)
  const [phone, setPhone] = useState(null)
  const [notice, setNotice] = useState('')
  const { data: account = user } = useQuery({
    queryKey: ['auth-me'], queryFn: () => api.get('/auth/me').then((result) => result.data.data),
  })
  const save = useMutation({
    mutationFn: async () => {
      const entered = (phone ?? account?.phone ?? '').trim()
      if (entered && !/^(09\d{9}|\+?639\d{9}|9\d{9})$/.test(entered.replace(/[\s()-]/g, ''))) {
        throw new Error('Enter a Philippine mobile number, such as 0917 123 4567.')
      }
      return updateAccountProfile(api, { phone: entered })
    },
    onSuccess: (nextUser) => {
      updateCurrentUser(nextUser)
      queryClient.setQueryData(['auth-me'], nextUser)
      setPhone(null)
      queryClient.invalidateQueries({ queryKey: ['patients-me-settings'] })
      setNotice('Contact number saved. It is not SMS-verified and cannot be used for account recovery yet.')
    },
  })
  return (
    <section className="card space-y-4" aria-labelledby="contact-recovery-title">
      <div>
        <p className="section-kicker">Contact & recovery</p>
        <h2 id="contact-recovery-title" className="section-title">Your mobile contact number</h2>
        <p className="text-sm text-slate-500">Add your number after signing in. Saving it does not verify ownership.</p>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); setNotice(''); save.mutate() }} className="space-y-3">
        <label className="label" htmlFor="contact-recovery-phone">Mobile number</label>
        <input id="contact-recovery-phone" type="tel" autoComplete="tel" className="input"
          placeholder="0917 123 4567" value={phone ?? account?.phone ?? ''}
          onChange={(event) => { setPhone(event.target.value); setNotice(''); save.reset() }} />
        <button type="submit" className="btn-primary" disabled={save.isPending || !account}>
          {save.isPending ? 'Saving...' : 'Save contact number'}
        </button>
      </form>
      {save.error ? <p role="alert" className="text-sm text-red-600">{save.error.response?.data?.message || save.error.message}</p> : null}
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
      <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
        SMS verification and SMS recovery are not connected yet. No verification code will be sent.
        For Google accounts, recover access through Google, then return to MWOS.
      </p>
      <a href="https://accounts.google.com/signin/recovery" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[var(--accent)] underline">
        Open Google account recovery
      </a>
    </section>
  )
}
