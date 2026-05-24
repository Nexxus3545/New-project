import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const roles = ['patient', 'nurse', 'midwife', 'doctor', 'admin']

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register, isLoading, error, clearError } = useAuthStore()
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

  const onSubmit = async (e) => {
    e.preventDefault()
    const result = await register(form)
    if (result.success) {
      navigate(result.user.role === 'patient' ? '/my/dashboard' : '/dashboard')
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-1">Create account</h2>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">Register to start using MWOS</p>

      {error ? <div className="alert-critical mb-4 text-sm">{error}</div> : null}

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input name="firstName" value={form.firstName} onChange={onChange} className="input" placeholder="First name" required />
          <input name="lastName" value={form.lastName} onChange={onChange} className="input" placeholder="Last name" required />
        </div>
        <input name="email" type="email" value={form.email} onChange={onChange} className="input" placeholder="Email" required />
        <input name="phone" value={form.phone} onChange={onChange} className="input" placeholder="Phone (optional)" />
        {form.role === 'patient' ? (
          <>
            <input name="city" value={form.city} onChange={onChange} className="input" placeholder="City (optional)" />
            <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={onChange} className="input" required />
          </>
        ) : null}

        <select name="role" value={form.role} onChange={onChange} className="input">
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>

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

        <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-2.5">
          {isLoading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-gray-600 dark:text-slate-300 mt-4 text-center">
        Already have an account? <Link to="/login" className="text-teal-600 hover:underline">Sign in</Link>
      </p>
    </div>
  )
}
