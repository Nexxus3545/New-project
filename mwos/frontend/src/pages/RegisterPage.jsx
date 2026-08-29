import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const roles = ['patient', 'nurse', 'midwife', 'doctor', 'admin']
const steps = [
  { label: 'Patient Info', description: 'Identity and birth details' },
  { label: 'Contact', description: 'Reachability and location' },
  { label: 'Access', description: 'Role and sign-in details' },
  { label: 'Review', description: 'Confirm before creating the account' },
]

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register, isLoading, error, clearError } = useAuthStore()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    dateOfBirth: '',
    role: 'patient',
    password: '',
  })

  const onChange = (e) => {
    clearError()
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const isPatientRole = form.role === 'patient'

  const onSubmit = async (e) => {
    e.preventDefault()

    if (step < steps.length - 1) {
      if (step === 0 && (!form.firstName || !form.lastName || (isPatientRole && !form.dateOfBirth))) {
        return
      }
      if (step === 1 && !form.email) {
        return
      }
      setStep((current) => current + 1)
      return
    }

    const result = await register(form)
    if (result.success) {
      navigate(result.user.role === 'patient' ? '/my/dashboard' : '/dashboard')
    }
  }

  const goBack = () => {
    clearError()
    setStep((current) => Math.max(0, current - 1))
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-white/80 bg-white/85 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/75">
        <div className="flex flex-wrap items-center gap-2">
          {steps.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setStep(index)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                step === index
                  ? 'bg-[var(--accent)] text-white shadow-lg'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <h2 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-50">Create account</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          Set up a secure MWOS account to manage clinic follow-ups, records, and care team access.
        </p>
      </div>

      {error ? <div className="alert-critical text-sm">{error}</div> : null}

      <form onSubmit={onSubmit} className="rounded-[32px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="rounded-[28px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Steps</p>
            <div className="mt-4 space-y-3">
              {steps.map((item, index) => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                    step === index ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="space-y-5">
            {step === 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">First name</label>
                  <input name="firstName" value={form.firstName} onChange={onChange} className="input" placeholder="First name" required />
                </div>
                <div>
                  <label className="label">Last name</label>
                  <input name="lastName" value={form.lastName} onChange={onChange} className="input" placeholder="Last name" required />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Date of birth {isPatientRole ? '*' : ''}</label>
                  <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={onChange} className="input" required={isPatientRole} />
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="label">Email</label>
                  <input name="email" type="email" value={form.email} onChange={onChange} className="input" placeholder="Email" required />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input name="phone" value={form.phone} onChange={onChange} className="input" placeholder="Phone (optional)" />
                </div>
                <div>
                  <label className="label">City / Municipality</label>
                  <input name="city" value={form.city} onChange={onChange} className="input" placeholder="City (optional)" />
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Role</label>
                  <select name="role" value={form.role} onChange={onChange} className="input">
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={onChange}
                    className="input"
                    placeholder="Password (min 6 chars)"
                    minLength={6}
                    required
                  />
                </div>
                <div className="md:col-span-2 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Patient accounts use the clinic portal. Staff accounts open the internal workspace.
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Identity</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{form.firstName || 'First name'} {form.lastName || 'Last name'}</p>
                    <p className="mt-1 text-xs text-slate-500">{form.dateOfBirth || 'Date of birth not set yet'}</p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Access</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">{form.role}</p>
                    <p className="mt-1 text-xs text-slate-500">{form.email || 'Email not set yet'}</p>
                  </div>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                  Review the details, then create the account. You can still edit the previous steps before submitting.
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              {step > 0 ? (
                <button type="button" onClick={goBack} className="btn-secondary">
                  Back
                </button>
              ) : null}

              <button type="submit" disabled={isLoading} className="btn-primary flex-1 justify-center py-2.5">
                {isLoading ? 'Saving...' : step === steps.length - 1 ? 'Create account' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      </form>

      <p className="text-center text-sm text-slate-600 dark:text-slate-300">
        Already have an account? <Link to="/login" className="font-semibold text-[var(--accent)] hover:underline">Sign in</Link>
      </p>
    </div>
  )
}
