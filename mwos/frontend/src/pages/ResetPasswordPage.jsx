import React, { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ResetPasswordPage() {
  const [search] = useSearchParams()
  const token = useMemo(() => search.get('token') || '', [search])
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const { resetPassword, isLoading, error, clearError } = useAuthStore()

  const onSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
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

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          name="password"
          type="password"
          minLength={6}
          value={password}
          onChange={(e) => {
            clearError()
            setPassword(e.target.value)
          }}
          className="input"
          placeholder="New password"
          required
        />
        <button type="submit" disabled={isLoading || !token} className="btn-primary w-full justify-center py-2.5">
          {isLoading ? 'Resetting password...' : 'Reset password'}
        </button>
      </form>

      <p className="text-sm text-gray-600 dark:text-slate-300 mt-4 text-center">
        Back to <Link to="/login" className="text-teal-600 hover:underline">Sign in</Link>
      </p>
    </div>
  )
}
