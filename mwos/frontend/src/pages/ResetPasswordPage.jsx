import React, { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import PasswordRequirements from '../components/common/PasswordRequirements'
import { passwordPolicyError, passwordMeetsPolicy } from '../utils/passwordPolicy'

export default function ResetPasswordPage() {
  const [search] = useSearchParams()
  const token = useMemo(() => search.get('token') || '', [search])
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const { resetPassword, isLoading, error, clearError } = useAuthStore()

  const onSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    const validationError = passwordPolicyError(password)
    if (validationError) { setPasswordError(validationError); return }
    const result = await resetPassword(token, password)
    if (result.success) setMessage(result.message)
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-1">Reset password</h2>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">Set a new password for your account.</p>

      {!token ? <div className="alert-warning mb-4 text-sm">Missing reset token in URL.</div> : null}
      {error ? <div className="alert-critical mb-4 text-sm">{error}</div> : null}
      {message ? <div className="alert-success mb-4 text-sm">{message}</div> : null}
      {passwordError ? <div className="alert-critical mb-4 text-sm" role="alert">{passwordError}</div> : null}

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="label" htmlFor="reset-password">New password</label>
        <input
          id="reset-password"
          name="password"
          type="password"
          minLength={8}
          autoComplete="new-password"
          aria-describedby="reset-password-requirements"
          value={password}
          onChange={(e) => {
            clearError()
            setPasswordError('')
            setPassword(e.target.value)
          }}
          className="input"
          placeholder="New password"
          required
        />
        <PasswordRequirements password={password} id="reset-password-requirements" />
        <button type="submit" disabled={isLoading || !token || !passwordMeetsPolicy(password)} className="btn-primary w-full justify-center py-2.5">
          {isLoading ? 'Resetting password...' : 'Reset password'}
        </button>
      </form>

      <p className="text-sm text-gray-600 dark:text-slate-300 mt-4 text-center">
        Back to <Link to="/login" className="text-[var(--accent)] hover:text-[var(--accent-strong)] hover:underline">Sign in</Link>
      </p>
    </div>
  )
}
