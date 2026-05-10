import React, { startTransition, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { accentPresets, appearanceOptions, normalizeAppearance } from '../utils/appearance'

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(new Error('Unable to read image file'))
  reader.readAsDataURL(file)
})

const initialsFromName = (firstName, lastName) => `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase()

const AppearanceGroup = ({ label, description, field, value, options, onChange }) => (
  <div className="space-y-3">
    <div>
      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{label}</p>
      <p className="text-xs text-gray-500 dark:text-slate-400">{description}</p>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(field, option.value)}
          className={`appearance-choice ${value === option.value ? 'active' : ''}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
)

export default function AccountCenterPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const updateCurrentUser = useAuthStore((state) => state.updateCurrentUser)
  const logout = useAuthStore((state) => state.logout)
  const themePreferences = useThemeStore((state) => state.preferences)
  const setThemePreferences = useThemeStore((state) => state.setPreferences)

  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatarUrl: '',
  })
  const [patientForm, setPatientForm] = useState({
    dateOfBirth: '',
    civilStatus: '',
    bloodType: '',
    address: '',
    city: '',
    allergies: '',
    existingConditions: '',
    currentMedications: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    philhealthId: '',
  })
  const [appearanceForm, setAppearanceForm] = useState(normalizeAppearance(user?.uiPreferences || themePreferences))
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [profileNotice, setProfileNotice] = useState('')
  const [patientNotice, setPatientNotice] = useState('')
  const [appearanceNotice, setAppearanceNotice] = useState('')
  const [securityNotice, setSecurityNotice] = useState('')
  const [localError, setLocalError] = useState('')

  const { data: account, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.get('/auth/me').then((response) => response.data.data),
    initialData: user,
  })

  const { data: patientProfile } = useQuery({
    queryKey: ['patients-me-settings'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
    enabled: account?.role === 'patient',
  })

  useEffect(() => {
    if (!account) return

    setProfileForm({
      firstName: account.firstName || '',
      lastName: account.lastName || '',
      email: account.email || '',
      phone: account.phone || '',
      avatarUrl: account.avatarUrl || '',
    })
    const nextAppearance = normalizeAppearance(account.uiPreferences || {})
    setAppearanceForm(nextAppearance)
    setThemePreferences(nextAppearance)
  }, [account, setThemePreferences])

  useEffect(() => {
    if (!patientProfile) return

    setPatientForm({
      dateOfBirth: patientProfile.date_of_birth?.slice(0, 10) || '',
      civilStatus: patientProfile.civil_status || '',
      bloodType: patientProfile.blood_type || '',
      address: patientProfile.address || '',
      city: patientProfile.city || '',
      allergies: patientProfile.allergies || '',
      existingConditions: patientProfile.existing_conditions || '',
      currentMedications: patientProfile.current_medications || '',
      emergencyContactName: patientProfile.emergency_contact_name || '',
      emergencyContactPhone: patientProfile.emergency_contact_phone || '',
      emergencyContactRelation: patientProfile.emergency_contact_relation || '',
      philhealthId: patientProfile.philhealth_id || '',
    })
  }, [patientProfile])

  const profileMutation = useMutation({
    mutationFn: (payload) => api.patch('/auth/profile', payload).then((response) => response.data.data),
    onSuccess: (nextUser) => {
      updateCurrentUser(nextUser)
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
      setProfileNotice('Profile details updated successfully.')
      setLocalError('')
    },
    onError: (error) => {
      setLocalError(error.response?.data?.message || 'Unable to update account profile.')
    },
  })

  const patientMutation = useMutation({
    mutationFn: (payload) => api.patch('/patients/me', payload).then((response) => response.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients-me-settings'] })
      setPatientNotice('Personal and medical details saved.')
      setLocalError('')
    },
    onError: (error) => {
      setLocalError(error.response?.data?.message || 'Unable to save patient details.')
    },
  })

  const appearanceMutation = useMutation({
    mutationFn: (payload) => api.patch('/auth/preferences', { uiPreferences: payload }).then((response) => response.data.data),
    onSuccess: (nextUser) => {
      updateCurrentUser(nextUser)
      setThemePreferences(nextUser.uiPreferences)
      setAppearanceNotice('Appearance preferences synced across your account.')
      setLocalError('')
    },
    onError: (error) => {
      setLocalError(error.response?.data?.message || 'Unable to save appearance preferences.')
    },
  })

  const passwordMutation = useMutation({
    mutationFn: (payload) => api.patch('/auth/change-password', payload),
    onSuccess: async () => {
      await logout()
      navigate('/login')
    },
    onError: (error) => {
      setLocalError(error.response?.data?.message || 'Unable to change password.')
    },
  })

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 1_200_000) {
      setLocalError('Please choose an image smaller than 1.2 MB.')
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      startTransition(() => {
        setProfileForm((current) => ({ ...current, avatarUrl: dataUrl }))
        setLocalError('')
      })
    } catch (error) {
      setLocalError(error.message)
    }
  }

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    setProfileNotice('')
    try {
      await profileMutation.mutateAsync(profileForm)
    } catch {}
  }

  const handlePatientSubmit = async (event) => {
    event.preventDefault()
    setPatientNotice('')
    try {
      await patientMutation.mutateAsync(patientForm)
    } catch {}
  }

  const handleAppearanceSubmit = async (event) => {
    event.preventDefault()
    setAppearanceNotice('')
    try {
      await appearanceMutation.mutateAsync(appearanceForm)
    } catch {}
  }

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    setSecurityNotice('')

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setLocalError('New password and confirmation do not match.')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      setLocalError('New password must be at least 8 characters.')
      return
    }

    try {
      await passwordMutation.mutateAsync({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setSecurityNotice('Password updated. Please sign in again.')
    } catch {}
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><div className="loading-spinner h-10 w-10" /></div>
  }

  const previewPalette = accentPresets[appearanceForm.accent] || accentPresets.teal

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden p-0">
        <div
          className="relative overflow-hidden px-6 py-8 text-white"
          style={{ background: 'linear-gradient(135deg, var(--hero-start), var(--hero-end))' }}
        >
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="account-avatar h-20 w-20 text-lg">
                {profileForm.avatarUrl ? (
                  <img src={profileForm.avatarUrl} alt="Profile avatar" className="h-full w-full rounded-[28px] object-cover" />
                ) : (
                  initialsFromName(profileForm.firstName, profileForm.lastName)
                )}
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-white/70">Account Center</p>
                <h1 className="mt-2 text-3xl font-semibold">{profileForm.firstName || 'Your'} {profileForm.lastName || 'Profile'}</h1>
                <p className="mt-2 text-sm text-white/80">
                  Manage personal details, secure your login, and make the interface feel like your own.
                </p>
              </div>
            </div>
            <div className="grid gap-3 text-sm text-white/80 md:text-right">
              <div>
                <p className="text-white/60">Role</p>
                <p className="font-semibold capitalize">{account?.role}</p>
              </div>
              <div>
                <p className="text-white/60">Primary login</p>
                <p className="font-semibold">{profileForm.email}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {localError ? <div className="alert-critical text-sm">{localError}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <form className="card space-y-5" onSubmit={handleProfileSubmit}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="section-title mb-1">Identity & Login</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">Update your name, login email, phone, and profile image.</p>
              </div>
              {profileNotice ? <span className="badge badge-success">{profileNotice}</span> : null}
            </div>

            <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
              <div className="space-y-3">
                <div className="account-avatar h-36 w-36 text-3xl">
                  {profileForm.avatarUrl ? (
                    <img src={profileForm.avatarUrl} alt="Current avatar" className="h-full w-full rounded-[32px] object-cover" />
                  ) : (
                    initialsFromName(profileForm.firstName, profileForm.lastName)
                  )}
                </div>
                <label className="btn-secondary w-full justify-center cursor-pointer">
                  Upload photo
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </label>
                {profileForm.avatarUrl ? (
                  <button
                    type="button"
                    className="btn-ghost w-full justify-center"
                    onClick={() => setProfileForm((current) => ({ ...current, avatarUrl: '' }))}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">First name</label>
                  <input className="input" value={profileForm.firstName} onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Last name</label>
                  <input className="input" value={profileForm.lastName} onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Login email</label>
                  <input className="input" type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Mobile number</label>
                  <input className="input" value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? 'Saving profile...' : 'Save identity'}
              </button>
            </div>
          </form>

          {account?.role === 'patient' ? (
            <form className="card space-y-5" onSubmit={handlePatientSubmit}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="section-title mb-1">Personal & Medical Details</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Keep your profile, address, and care details up to date for staff and future visits.</p>
                </div>
                {patientNotice ? <span className="badge badge-success">{patientNotice}</span> : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Date of birth</label>
                  <input className="input" type="date" value={patientForm.dateOfBirth} onChange={(event) => setPatientForm((current) => ({ ...current, dateOfBirth: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Civil status</label>
                  <input className="input" value={patientForm.civilStatus} onChange={(event) => setPatientForm((current) => ({ ...current, civilStatus: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Blood type</label>
                  <input className="input" value={patientForm.bloodType} onChange={(event) => setPatientForm((current) => ({ ...current, bloodType: event.target.value }))} />
                </div>
                <div>
                  <label className="label">PhilHealth ID</label>
                  <input className="input" value={patientForm.philhealthId} onChange={(event) => setPatientForm((current) => ({ ...current, philhealthId: event.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Address</label>
                  <input className="input" value={patientForm.address} onChange={(event) => setPatientForm((current) => ({ ...current, address: event.target.value }))} />
                </div>
                <div>
                  <label className="label">City</label>
                  <input className="input" value={patientForm.city} onChange={(event) => setPatientForm((current) => ({ ...current, city: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Allergies</label>
                  <input className="input" value={patientForm.allergies} onChange={(event) => setPatientForm((current) => ({ ...current, allergies: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Existing conditions</label>
                  <input className="input" value={patientForm.existingConditions} onChange={(event) => setPatientForm((current) => ({ ...current, existingConditions: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Current medications</label>
                  <input className="input" value={patientForm.currentMedications} onChange={(event) => setPatientForm((current) => ({ ...current, currentMedications: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Emergency contact</label>
                  <input className="input" value={patientForm.emergencyContactName} onChange={(event) => setPatientForm((current) => ({ ...current, emergencyContactName: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Emergency phone</label>
                  <input className="input" value={patientForm.emergencyContactPhone} onChange={(event) => setPatientForm((current) => ({ ...current, emergencyContactPhone: event.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Emergency relationship</label>
                  <input className="input" value={patientForm.emergencyContactRelation} onChange={(event) => setPatientForm((current) => ({ ...current, emergencyContactRelation: event.target.value }))} />
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" className="btn-primary" disabled={patientMutation.isPending}>
                  {patientMutation.isPending ? 'Saving details...' : 'Save personal info'}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div className="space-y-6">
          <form className="card space-y-5" onSubmit={handleAppearanceSubmit}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="section-title mb-1">Appearance</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">Choose how the interface feels on every sign-in.</p>
              </div>
              {appearanceNotice ? <span className="badge badge-success">{appearanceNotice}</span> : null}
            </div>

            <div
              className="rounded-3xl border border-white/60 p-4 shadow-sm"
              style={{ background: `linear-gradient(145deg, ${previewPalette.accentGhost}, ${previewPalette.accentSoft})` }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em]" style={{ color: previewPalette.accentText }}>Live preview</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">Modern, calm, and reliable.</p>
                </div>
                <div className="flex gap-2">
                  {appearanceOptions.accent.map((option) => (
                    <span
                      key={option.value}
                      className={`h-3 w-3 rounded-full ${appearanceForm.accent === option.value ? 'ring-4 ring-white' : ''}`}
                      style={{ background: accentPresets[option.value].accent }}
                    />
                  ))}
                </div>
              </div>
              <div className={`grid gap-3 ${appearanceForm.density === 'compact' ? 'grid-cols-2 text-xs' : 'grid-cols-1 text-sm'}`}>
                <div className="rounded-2xl bg-white/80 p-3 shadow-sm backdrop-blur">
                  <p className="font-semibold text-slate-900">Dashboard cards</p>
                  <p className="mt-1 text-slate-500">Adapts spacing, mood, and emphasis.</p>
                </div>
                <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
                  <div className="mb-2 h-2 w-24 rounded-full" style={{ background: previewPalette.accent }} />
                  <div className="h-2 w-16 rounded-full bg-white/40" />
                </div>
              </div>
            </div>

            <AppearanceGroup
              label="Theme mode"
              description="Use system theme or pin the interface to light or dark."
              field="theme"
              value={appearanceForm.theme}
              options={appearanceOptions.theme}
              onChange={(field, value) => {
                const next = { ...appearanceForm, [field]: value }
                setAppearanceForm(next)
                setThemePreferences(next)
              }}
            />
            <AppearanceGroup
              label="Accent palette"
              description="Change the personality of buttons, active states, and highlights."
              field="accent"
              value={appearanceForm.accent}
              options={appearanceOptions.accent}
              onChange={(field, value) => {
                const next = { ...appearanceForm, [field]: value }
                setAppearanceForm(next)
                setThemePreferences(next)
              }}
            />
            <AppearanceGroup
              label="Density"
              description="Choose roomier spacing or a tighter workspace."
              field="density"
              value={appearanceForm.density}
              options={appearanceOptions.density}
              onChange={(field, value) => {
                const next = { ...appearanceForm, [field]: value }
                setAppearanceForm(next)
                setThemePreferences(next)
              }}
            />
            <AppearanceGroup
              label="Surface style"
              description="Solid cards for clarity or glass surfaces for a lighter feel."
              field="surface"
              value={appearanceForm.surface}
              options={appearanceOptions.surface}
              onChange={(field, value) => {
                const next = { ...appearanceForm, [field]: value }
                setAppearanceForm(next)
                setThemePreferences(next)
              }}
            />
            <AppearanceGroup
              label="Motion"
              description="Reduce visual motion for a calmer experience."
              field="motion"
              value={appearanceForm.motion}
              options={appearanceOptions.motion}
              onChange={(field, value) => {
                const next = { ...appearanceForm, [field]: value }
                setAppearanceForm(next)
                setThemePreferences(next)
              }}
            />

            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={appearanceMutation.isPending}>
                {appearanceMutation.isPending ? 'Saving appearance...' : 'Save appearance'}
              </button>
            </div>
          </form>

          <form className="card space-y-5" onSubmit={handlePasswordSubmit}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="section-title mb-1">Security</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">Update your login credentials and re-secure your session.</p>
              </div>
              {securityNotice ? <span className="badge badge-success">{securityNotice}</span> : null}
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Current password</label>
                <input
                  className="input"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                />
              </div>
              <div>
                <label className="label">New password</label>
                <input
                  className="input"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                />
              </div>
              <div>
                <label className="label">Confirm new password</label>
                <input
                  className="input"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              Changing your password will sign you out immediately so the new credential becomes the only valid login.
            </div>

            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? 'Updating password...' : 'Change password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
