import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const { forgotPassword, isLoading, error, clearError } = useAuthStore()

  const onSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    const result = await forgotPassword(email)
    if (result.success) setMessage(result.message)
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-1">Forgot password</h2>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">Enter your account email to receive a reset link.</p>

      {error ? <div className="alert-critical mb-4 text-sm">{error}</div> : null}
      {message ? <div className="alert-success mb-4 text-sm">{message}</div> : null}

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            clearError()
            setEmail(e.target.value)
          }}
          className="input"
          placeholder="you@example.com"
          required
        />
        <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-2.5">
          {isLoading ? 'Sending link...' : 'Send reset link'}
        </button>
      </form>

      <p className="text-sm text-gray-600 dark:text-slate-300 mt-4 text-center">
        Back to <Link to="/login" className="text-[var(--accent)] hover:text-[var(--accent-strong)] hover:underline">Sign in</Link>
      </p>
    </div>
  )
}
