import React, { startTransition, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../utils/api'
import { uploadResumableFile } from '../utils/chunkedUpload'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { appearanceOptions, normalizeAppearance } from '../utils/appearance'
import AccountManagement from '../components/common/AccountSecurityActions'
import ContactNumberCard from '../components/common/ContactNumberCard'
import EmailNotificationSettings from '../components/common/EmailNotificationSettings'
import AppIcon from '../components/common/AppIcon'
import { updateAccountProfile } from '../utils/accountProfile'
import PatientCareFields from '../components/patient/PatientCareFields'
import { hasMaternalCare } from '../utils/patientCare'
import { settingsSections, useSettingsStore } from '../store/settingsStore'
import SettingsPanel from '../components/common/SettingsPanel'

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(new Error('Unable to read image file'))
  reader.readAsDataURL(file)
})

const initialsFromName = (firstName, lastName) => `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase()

const normalizeNumberInput = (value) => {
  if (value === '' || value === null || value === undefined) return ''
  const next = Number(value)
  return Number.isFinite(next) ? next : ''
}

const deriveBmi = (heightCm, weightKg) => {
  const height = Number(heightCm)
  const weight = Number(weightKg)
  if (!height || !weight) return ''
  const meters = height / 100
  return (weight / (meters * meters)).toFixed(2)
}

const AppearanceGroup = ({ label, description, field, value, options, onChange }) => (
  <div role="group" aria-label={label} className="space-y-3">
    <div>
      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{label}</p>
      <p className="text-xs text-gray-500 dark:text-slate-400">{description}</p>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(field, option.value)}
          className={`appearance-choice ${value === option.value ? 'active' : ''}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
)

const ProfileMetric = ({ label, value }) => (
  <div className="rounded-2xl border border-white/50 bg-white/70 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-slate-900/50">
    <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500 dark:text-slate-400">{label}</p>
    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{value || 'Not yet assigned'}</p>
  </div>
)

export default function AccountCenterPage({ section = 'profile' }) {
  const isSettings = section === 'settings'
  const [searchParams] = useSearchParams()
  const activeSection = settingsSections.some((item) => item.id === searchParams.get('tab')) ? searchParams.get('tab') : 'account'
  const isAppearance = isSettings && activeSection === 'appearance'
  const isAccount = !isSettings || activeSection === 'account'
  const settingsLanguage = useSettingsStore((state) => state.preferences.language)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const updateCurrentUser = useAuthStore((state) => state.updateCurrentUser)
  const logout = useAuthStore((state) => state.logout)
  const stepUpToken = useAuthStore((state) => state.stepUpToken)
  const requestOtp = useAuthStore((state) => state.requestOtp)
  const verifyOtp = useAuthStore((state) => state.verifyOtp)
  const registerPasskey = useAuthStore((state) => state.registerPasskey)
  const clearStepUp = useAuthStore((state) => state.clearStepUp)
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
    patientCode: '',
    birthingId: '',
    middleName: '',
    suffix: '',
    dateOfBirth: '',
    gender: '',
    careType: 'general',
    civilStatus: '',
    religion: '',
    nationality: '',
    occupation: '',
    placeOfBirth: '',
    bloodType: '',
    address: '',
    barangay: '',
    city: '',
    province: '',
    postalCode: '',
    allergies: '',
    existingConditions: '',
    currentMedications: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    philhealthId: '',
    philhealthType: '',
    validIdType: '',
    validIdNumber: '',
    pregnancyBookletNumber: '',
    biometricHeightCm: '',
    biometricWeightKg: '',
    biometricBmi: '',
    biometricNotes: '',
    credentialNotes: '',
  })

  const [appearanceForm, setAppearanceForm] = useState(normalizeAppearance(user?.uiPreferences || themePreferences))
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [emailPassword, setEmailPassword] = useState('')
  const [stepUpForm, setStepUpForm] = useState({
    purpose: 'critical',
    code: '',
    challengeId: '',
  })
  const [documentForm, setDocumentForm] = useState({
    documentType: 'PhilHealth ID',
    file: null,
  })
  const [profileNotice, setProfileNotice] = useState('')
  const [patientNotice, setPatientNotice] = useState('')
  const [appearanceNotice, setAppearanceNotice] = useState('')
  const [securityNotice, setSecurityNotice] = useState('')
  const [documentNotice, setDocumentNotice] = useState('')
  const [documentUploadState, setDocumentUploadState] = useState({ progress: 0, status: '' })
  const [localError, setLocalError] = useState('')

  const { data: account, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.get('/auth/me').then((response) => response.data.data),
    initialData: user,
  })
  useEffect(() => {
    if (isSettings && isAccount && location.hash === '#change-password' && !isLoading) document.getElementById('change-password')?.scrollIntoView({ block: 'start' })
  }, [isSettings, isAccount, isLoading, location.hash])

  const { data: patientProfile } = useQuery({
    queryKey: ['patients-me-settings'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
    enabled: !isSettings && account?.role === 'patient',
  })

  const { data: documents = [] } = useQuery({
    queryKey: ['patient-documents'],
    queryFn: () => api.get('/documents/my').then((response) => response.data.data),
    enabled: !isSettings && account?.role === 'patient',
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
      patientCode: patientProfile.patient_code || '',
      birthingId: patientProfile.birthing_id || '',
      middleName: patientProfile.middle_name || '',
      suffix: patientProfile.suffix || '',
      dateOfBirth: patientProfile.date_of_birth?.slice(0, 10) || '',
      gender: patientProfile.gender || '',
      careType: patientProfile.care_type || (hasMaternalCare(patientProfile) ? 'maternal' : 'general'),
      civilStatus: patientProfile.civil_status || '',
      religion: patientProfile.religion || '',
      nationality: patientProfile.nationality || '',
      occupation: patientProfile.occupation || '',
      placeOfBirth: patientProfile.place_of_birth || '',
      bloodType: patientProfile.blood_type || '',
      address: patientProfile.address || '',
      barangay: patientProfile.barangay || '',
      city: patientProfile.city || '',
      province: patientProfile.province || '',
      postalCode: patientProfile.postal_code || '',
      allergies: patientProfile.allergies || '',
      existingConditions: patientProfile.existing_conditions || '',
      currentMedications: patientProfile.current_medications || '',
      emergencyContactName: patientProfile.emergency_contact_name || '',
      emergencyContactPhone: patientProfile.emergency_contact_phone || '',
      emergencyContactRelation: patientProfile.emergency_contact_relation || '',
      philhealthId: patientProfile.philhealth_id || '',
      philhealthType: patientProfile.philhealth_type || '',
      validIdType: patientProfile.valid_id_type || '',
      validIdNumber: patientProfile.valid_id_number || '',
      pregnancyBookletNumber: patientProfile.pregnancy_booklet_number || '',
      biometricHeightCm: patientProfile.biometric_height_cm || '',
      biometricWeightKg: patientProfile.biometric_weight_kg || '',
      biometricBmi: patientProfile.biometric_bmi || '',
      biometricNotes: patientProfile.biometric_notes || '',
      credentialNotes: patientProfile.credential_notes || '',
    })
  }, [patientProfile])

  const profileMutation = useMutation({
    mutationFn: (payload) => updateAccountProfile(api, payload),
    onSuccess: (nextUser) => {
      updateCurrentUser(nextUser)
      queryClient.setQueryData(['auth-me'], nextUser)
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
      setProfileNotice(isSettings ? 'Login email updated successfully.' : 'Profile details updated successfully.')
      setEmailPassword('')
      setLocalError('')
    },
    onError: (error) => {
      setLocalError(error.response?.data?.message || 'Unable to update account profile.')
    },
  })

  const patientMutation = useMutation({
    mutationFn: (payload) => api.patch('/patients/me', payload).then((response) => response.data.data),
    onSuccess: (saved) => {
      const nextUser = { ...user, patientGender: saved.gender, careType: saved.care_type, hasActivePregnancy: (patientProfile?.pregnancies || []).some((pregnancy) => pregnancy?.status === 'active') }
      updateCurrentUser(nextUser)
      queryClient.setQueryData(['auth-me'], nextUser)
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith('patient') })
      queryClient.invalidateQueries({ queryKey: ['patients-me-settings'] })
      setPatientNotice('Patient details and care type saved. Existing clinical records are unchanged.')
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
      queryClient.setQueryData(['auth-me'], nextUser)
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

  const isStaff = ['admin', 'doctor', 'midwife', 'nurse'].includes(account?.role)

  const handleRequestStepUp = async () => {
    const result = await requestOtp(stepUpForm.purpose)
    if (!result.success) {
      setLocalError(result.error)
      return
    }

    setStepUpForm((current) => ({
      ...current,
      challengeId: result.challengeId || '',
      code: '',
    }))
    setSecurityNotice(`Verification code sent to ${result.destination || 'your clinic contact'}.`)
    setLocalError('')
  }

  const handleVerifyStepUp = async (event) => {
    event.preventDefault()
    if (!stepUpForm.code.trim()) return

    const result = await verifyOtp({
      challengeId: stepUpForm.challengeId,
      code: stepUpForm.code.trim(),
      purpose: stepUpForm.purpose,
    })

    if (!result.success) {
      setLocalError(result.error)
      return
    }

    setSecurityNotice('Step-up authentication is active for protected actions.')
    setLocalError('')
    setStepUpForm((current) => ({ ...current, code: '' }))
  }

  const handleRegisterPasskey = async () => {
    const result = await registerPasskey(stepUpForm.purpose)
    if (!result.success) {
      setLocalError(result.error)
      return
    }

    setSecurityNotice('Passkey registered successfully.')
    setLocalError('')
  }

  const handleClearStepUp = async () => {
    await clearStepUp()
    setSecurityNotice('Step-up token cleared.')
  }

  const documentMutation = useMutation({
    onMutate: () => {
      setDocumentUploadState({ progress: 0, status: 'Preparing upload session...' })
      setLocalError('')
    },
    mutationFn: async () => {
      if (!documentForm.file) {
        throw new Error('Please choose a document file to upload.')
      }

      return uploadResumableFile({
        targetType: 'patient_document',
        file: documentForm.file,
        fields: { documentType: documentForm.documentType },
        onProgress: ({ progress }) => setDocumentUploadState((current) => ({ ...current, progress })),
        onStatus: (status) => setDocumentUploadState((current) => ({ ...current, status })),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-documents'] })
      setDocumentForm({ documentType: 'PhilHealth ID', file: null })
      setDocumentNotice('Document uploaded successfully and queued for verification.')
      setDocumentUploadState({ progress: 0, status: '' })
      setLocalError('')
    },
    onError: (error) => {
      setDocumentUploadState((current) => ({
        ...current,
        status: current.status || 'Upload paused. Choose the same file and upload again to resume.',
      }))
      setLocalError(error.response?.data?.message || error.message || 'Unable to upload document.')
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

  const updatePatientField = (field, value) => {
    setPatientForm((current) => {
      const next = { ...current, [field]: value }

      if (field === 'biometricHeightCm') {
        next.biometricHeightCm = normalizeNumberInput(value)
        next.biometricBmi = deriveBmi(next.biometricHeightCm, next.biometricWeightKg)
      }

      if (field === 'biometricWeightKg') {
        next.biometricWeightKg = normalizeNumberInput(value)
        next.biometricBmi = deriveBmi(next.biometricHeightCm, next.biometricWeightKg)
      }

      return next
    })
  }

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    setProfileNotice('')
    try {
      await profileMutation.mutateAsync(isSettings
        ? { email: profileForm.email, currentPassword: emailPassword }
        : { firstName: profileForm.firstName, lastName: profileForm.lastName, avatarUrl: profileForm.avatarUrl })
    } catch {}
  }

  const handlePatientSubmit = async (event) => {
    event.preventDefault()
    setPatientNotice('')
    if (!patientProfile) {
      setLocalError('Wait for your existing patient record to load before saving changes.')
      return
    }
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

  const handleDocumentSubmit = async (event) => {
    event.preventDefault()
    setDocumentNotice('')

    if (!documentForm.file) {
      setLocalError('Please choose a document file to upload.')
      return
    }

    try {
      await documentMutation.mutateAsync()
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

  const deliveries = Array.isArray(patientProfile?.deliveries) ? patientProfile.deliveries.filter(Boolean) : []
  const latestDelivery = useMemo(
    () => deliveries.slice().sort((left, right) => new Date(right.delivery_date || 0) - new Date(left.delivery_date || 0))[0],
    [deliveries]
  )

  if (isLoading) {
    return <div className="flex justify-center py-20"><div className="loading-spinner h-10 w-10" /></div>
  }

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
                <p className="text-sm uppercase tracking-[0.3em] text-white/70">{isSettings ? 'Account preferences' : 'Personal information'}</p>
                <h1 className="mt-2 text-3xl font-semibold">{isSettings ? 'Settings' : 'Your profile'}</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/80">
                  {isSettings
                    ? 'Manage sign-in, contact and recovery details, appearance, and account security.'
                    : 'Keep your personal details, clinic IDs, documents, and care information up to date.'}
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

      <nav aria-label="Account navigation" className="flex flex-wrap gap-2">
        <NavLink to={account?.role === 'patient' ? '/my/profile' : '/account'} className={({ isActive }) => isActive ? 'btn-primary' : 'btn-secondary'}><AppIcon name="profile" />Profile</NavLink>
        <NavLink to={account?.role === 'patient' ? '/my/settings' : '/settings'} className={({ isActive }) => isActive ? 'btn-primary' : 'btn-secondary'}><AppIcon name="settings" />Settings</NavLink>
      </nav>

      {isSettings ? (
        <nav aria-label="Settings sections" className="card grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {settingsSections.map((item) => <Link key={item.id} to={`${account?.role === 'patient' ? '/my/settings' : '/settings'}${item.id === 'account' ? '' : `?tab=${item.id}`}`} aria-current={activeSection === item.id ? 'page' : undefined} className={`flex min-h-14 min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${activeSection === item.id ? 'bg-[var(--accent)] text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${activeSection === item.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}><AppIcon name={item.icon} /></span><span className="min-w-0 flex-1">{item[settingsLanguage]}</span><span aria-hidden="true">&rsaquo;</span>
          </Link>)}
        </nav>
      ) : null}

      {!isSettings && account?.staffProfile ? (
        <section className="card space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="section-title mb-1">Staff Credential Status</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">Live credential details used by the staff permission evaluator.</p>
            </div>
            <span className={`badge ${account.staffProfile.isVerified ? 'badge-success' : account.staffProfile.licenseStatus === 'suspended' ? 'badge-danger' : 'badge-warning'}`}>
              {account.staffProfile.licenseStatus || 'pending'}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <ProfileMetric label="Title" value={account.staffProfile.professionalTitle} />
            <ProfileMetric label="Department" value={account.staffProfile.department} />
            <ProfileMetric label="License number" value={account.staffProfile.licenseNumber || 'Not assigned'} />
            <ProfileMetric label="Verified at" value={account.staffProfile.verifiedAt ? new Date(account.staffProfile.verifiedAt).toLocaleString('en-PH') : 'Pending review'} />
          </div>
          {account.staffProfile.credentialNotes ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
              {account.staffProfile.credentialNotes}
            </div>
          ) : null}
        </section>
      ) : null}

      {localError ? <div className="alert-critical text-sm">{localError}</div> : null}

      <div className={`grid gap-6 ${isSettings && isAccount ? 'xl:grid-cols-2' : ''}`}>
        {isSettings && !isAccount && !isAppearance ? <SettingsPanel key={activeSection} section={activeSection} account={account} /> : null}
        {isAccount ? <div className="space-y-6">
          <form aria-label={isSettings ? 'Sign-in email' : 'Profile details'} className="card space-y-5" onSubmit={handleProfileSubmit}>
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
              <div className="w-full min-w-0 sm:flex-1">
                <h2 className="section-title mb-1">{isSettings ? 'Sign-in email' : 'Profile details'}</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">{isSettings ? 'Manage the email address used for your MWOS sign-in.' : 'Update your name and profile photo. Sign-in and recovery controls are in Settings.'}</p>
              </div>
              {profileNotice ? <span className="badge badge-success max-w-full whitespace-normal">{profileNotice}</span> : null}
            </div>

            <div className={isSettings ? 'space-y-4' : 'grid items-stretch gap-5 md:grid-cols-[144px_minmax(0,1fr)] md:gap-6'}>
              {!isSettings ? <div className="flex w-36 flex-col gap-3 justify-self-center md:justify-self-start">
                <div aria-label="Profile photo" className="flex h-36 w-full items-center justify-center overflow-hidden rounded-[28px] border border-rose-100 bg-rose-50 text-3xl font-semibold text-[var(--accent-strong)] shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-rose-200">
                  {profileForm.avatarUrl ? (
                    <img src={profileForm.avatarUrl} alt="Current avatar" className="h-full w-full object-cover" />
                  ) : (
                    initialsFromName(profileForm.firstName, profileForm.lastName)
                  )}
                </div>
                <label htmlFor="profile-photo-upload" className="btn-secondary w-full cursor-pointer justify-center focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2">
                  Upload photo
                  <input id="profile-photo-upload" type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
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
              </div> : null}

              <div className="flex min-w-0 flex-col justify-between gap-5">
                <div className="grid content-start gap-4 md:grid-cols-2">
                  {!isSettings ? <><div>
                    <label className="label" htmlFor="profile-first-name">First name</label>
                    <input id="profile-first-name" className="input" value={profileForm.firstName} onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))} />
                  </div>
                  <div>
                    <label className="label" htmlFor="profile-last-name">Last name</label>
                    <input id="profile-last-name" className="input" value={profileForm.lastName} onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))} />
                  </div></> : <div className="md:col-span-2">
                    <label className="label" htmlFor="settings-login-email">Login email</label>
                    <input id="settings-login-email" className="input" type="email" required autoComplete="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} />
                    <p className="mt-2 text-xs text-slate-500">For Google sign-in, continue using the Google account already linked to MWOS. Google recovery still goes to its verified email.</p>
                    {profileForm.email.trim().toLowerCase() !== account?.email?.toLowerCase() ? <label className="label mt-4">Current MWOS password to change login email<input type="password" autoComplete="current-password" className="input mt-2" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} required /></label> : null}
                  </div>}
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn-primary" disabled={profileMutation.isPending}>
                    {profileMutation.isPending ? 'Saving...' : isSettings ? 'Save login email' : 'Save profile'}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {isSettings ? <ContactNumberCard /> : null}
          {isSettings ? <EmailNotificationSettings /> : null}

          {!isSettings && account?.role === 'patient' ? (
            <form className="card space-y-6" onSubmit={handlePatientSubmit}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="section-title mb-1">Personal, Biometrics & Credentials</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Keep the clinic-facing record complete with IDs, personal information, and care-ready biometrics.</p>
                </div>
                {patientNotice ? <span className="badge badge-success">{patientNotice}</span> : null}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <ProfileMetric label="Patient Code" value={patientForm.patientCode} />
                {hasMaternalCare({ ...patientProfile, careType: patientForm.careType, care_type: patientForm.careType }) ? <>
                  <ProfileMetric label="Birthing ID" value={patientForm.birthingId} />
                  <ProfileMetric label="Latest Delivery ID" value={latestDelivery?.delivery_code} />
                </> : <ProfileMetric label="Care type" value="General clinic care" />}
              </div>

              <div className="rounded-3xl border border-white/50 bg-white/60 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Personal Information</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Basic identity details used across the patient portal, staff chart, and printed records.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <PatientCareFields value={patientForm} onChange={updatePatientField} />
                  <div>
                    <label className="label">Middle name</label>
                    <input className="input" value={patientForm.middleName} onChange={(event) => updatePatientField('middleName', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Suffix</label>
                    <input className="input" value={patientForm.suffix} onChange={(event) => updatePatientField('suffix', event.target.value)} placeholder="Jr., III, etc." />
                  </div>
                  <div>
                    <label className="label">Date of birth</label>
                    <input className="input" type="date" value={patientForm.dateOfBirth} onChange={(event) => updatePatientField('dateOfBirth', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Civil status</label>
                    <input className="input" value={patientForm.civilStatus} onChange={(event) => updatePatientField('civilStatus', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Religion</label>
                    <input className="input" value={patientForm.religion} onChange={(event) => updatePatientField('religion', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Nationality</label>
                    <input className="input" value={patientForm.nationality} onChange={(event) => updatePatientField('nationality', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Occupation</label>
                    <input className="input" value={patientForm.occupation} onChange={(event) => updatePatientField('occupation', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Place of birth</label>
                    <input className="input" value={patientForm.placeOfBirth} onChange={(event) => updatePatientField('placeOfBirth', event.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Address</label>
                    <input className="input" value={patientForm.address} onChange={(event) => updatePatientField('address', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Barangay</label>
                    <input className="input" value={patientForm.barangay} onChange={(event) => updatePatientField('barangay', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">City / Municipality</label>
                    <input className="input" value={patientForm.city} onChange={(event) => updatePatientField('city', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Province</label>
                    <input className="input" value={patientForm.province} onChange={(event) => updatePatientField('province', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Postal code</label>
                    <input className="input" value={patientForm.postalCode} onChange={(event) => updatePatientField('postalCode', event.target.value)} />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/50 bg-white/60 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Clinic Credentials</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Facility IDs and supporting references for admissions, billing, and document verification.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">PhilHealth ID</label>
                    <input className="input" value={patientForm.philhealthId} onChange={(event) => updatePatientField('philhealthId', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">PhilHealth type</label>
                    <input className="input" value={patientForm.philhealthType} onChange={(event) => updatePatientField('philhealthType', event.target.value)} placeholder="Member, Dependent, Sponsored..." />
                  </div>
                  <div>
                    <label className="label">Valid ID type</label>
                    <input className="input" value={patientForm.validIdType} onChange={(event) => updatePatientField('validIdType', event.target.value)} placeholder="PhilSys, Passport, Driver License..." />
                  </div>
                  <div>
                    <label className="label">Valid ID number</label>
                    <input className="input" value={patientForm.validIdNumber} onChange={(event) => updatePatientField('validIdNumber', event.target.value)} />
                  </div>
                  {hasMaternalCare({ ...patientProfile, careType: patientForm.careType, care_type: patientForm.careType }) ? <div>
                    <label className="label">Pregnancy booklet number</label>
                    <input className="input" value={patientForm.pregnancyBookletNumber} onChange={(event) => updatePatientField('pregnancyBookletNumber', event.target.value)} />
                  </div> : null}
                  <div>
                    <label className="label">Blood type</label>
                    <input className="input" value={patientForm.bloodType} readOnly placeholder="Clinic-recorded only" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Credential notes</label>
                    <textarea className="input min-h-[96px]" value={patientForm.credentialNotes} readOnly placeholder="Clinic verification notes" />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/50 bg-white/60 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Biometrics & Care Details</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Clinic measurements and notes are read-only. Allergies, conditions, and medication history below are self-reported details for staff review, not new diagnoses or prescriptions. Contact the clinic to correct measured findings.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Height (cm)</label>
                    <input className="input" type="number" step="0.01" value={patientForm.biometricHeightCm} readOnly />
                  </div>
                  <div>
                    <label className="label">Weight (kg)</label>
                    <input className="input" type="number" step="0.01" value={patientForm.biometricWeightKg} readOnly />
                  </div>
                  <div>
                    <label className="label">BMI</label>
                    <input className="input" value={patientForm.biometricBmi} readOnly />
                  </div>
                  <div>
                    <label className="label">Allergies</label>
                    <input className="input" value={patientForm.allergies} onChange={(event) => updatePatientField('allergies', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Existing conditions</label>
                    <input className="input" value={patientForm.existingConditions} onChange={(event) => updatePatientField('existingConditions', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Current medications</label>
                    <input className="input" value={patientForm.currentMedications} onChange={(event) => updatePatientField('currentMedications', event.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Biometric notes</label>
                    <textarea className="input min-h-[96px]" value={patientForm.biometricNotes} readOnly placeholder="Clinic-recorded observations" />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/50 bg-white/60 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Secure Document Uploads</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Upload valid identification and relevant medical documents requested by your clinic.</p>
                  </div>
                  {documentNotice ? <span className="badge badge-success">{documentNotice}</span> : null}
                </div>

                <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr_auto]">
                  <div>
                    <label className="label">Document type</label>
                    <select className="input" value={documentForm.documentType} onChange={(event) => setDocumentForm((current) => ({ ...current, documentType: event.target.value }))}>
                      <option>PhilHealth ID</option>
                      <option>Birthing ID</option>
                      <option>Medical Document</option>
                      <option>Lab Result</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Choose file</label>
                    <input className="input" type="file" accept="image/*,application/pdf" onChange={(event) => setDocumentForm((current) => ({ ...current, file: event.target.files?.[0] || null }))} />
                  </div>
                  <div className="flex items-end">
                    <button type="button" className="btn-primary w-full justify-center" disabled={documentMutation.isPending} onClick={handleDocumentSubmit}>
                      {documentMutation.isPending ? 'Uploading...' : 'Upload'}
                    </button>
                  </div>
                </div>

                {(documentMutation.isPending || documentUploadState.status) ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium text-slate-900">
                        {documentUploadState.status || 'Preparing upload...'}
                      </p>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {documentUploadState.progress}%
                      </span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-[var(--accent)] transition-all duration-300"
                        style={{ width: `${documentUploadState.progress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Large uploads are sent in safe chunks and can resume after a dropped connection.
                    </p>
                  </div>
                ) : null}

                <div className="mt-5 space-y-3">
                  {documents.length === 0 ? (
                    <p className="text-sm text-slate-400">No uploaded documents yet.</p>
                  ) : (
                    documents.map((document) => (
                      <div key={document.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{document.document_type}</p>
                          <p className="text-xs text-slate-500">{document.original_name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`badge ${document.verification_status === 'verified' ? 'badge-success' : document.verification_status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                            {document.verification_status}
                          </span>
                          <a href={document.file_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-[var(--accent)]">Open</a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/50 bg-white/60 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Emergency Contact</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">These details help the team reach the right person quickly during care or admission changes.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Emergency contact name</label>
                    <input className="input" value={patientForm.emergencyContactName} onChange={(event) => updatePatientField('emergencyContactName', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Emergency phone</label>
                    <input className="input" value={patientForm.emergencyContactPhone} onChange={(event) => updatePatientField('emergencyContactPhone', event.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Relationship</label>
                    <input className="input" value={patientForm.emergencyContactRelation} onChange={(event) => updatePatientField('emergencyContactRelation', event.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" className="btn-primary" disabled={patientMutation.isPending}>
                  {patientMutation.isPending ? 'Saving details...' : 'Save patient record'}
                </button>
              </div>
            </form>
          ) : null}
        </div> : null}

        {isSettings && (isAccount || isAppearance) ? <div className="space-y-6">
          {isAppearance ? <form aria-label="Appearance" className="card space-y-6" onSubmit={handleAppearanceSubmit}>
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
              <div className="w-full min-w-0 sm:flex-1">
                <h2 className="section-title mb-1">Appearance</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">Blush is the clinic default. Soft surfaces, clear text, comfortable spacing, and calm motion are applied automatically.</p>
              </div>
              {appearanceNotice ? <span role="status" className="badge badge-success max-w-full whitespace-normal">{appearanceNotice}</span> : null}
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
            <aside className="appearance-preview" aria-label="Blush theme preview">
              <p className="appearance-preview-label">TMC Copino Blush</p>
              <h3 className="appearance-preview-heading">Calm color.<br />Clear text.</h3>
              <p className="appearance-preview-copy">Soft blush surfaces with high-contrast text. Buttons keep a deeper rose shade so their labels stay clear.</p>
              <p className="appearance-preview-note"><AppIcon name="lock" />Your account and care information stay in the secure portal.</p>
            </aside>

            <div className="space-y-6">
            <AppearanceGroup
              label="Theme mode"
              description="Use your device's mode, or choose light or dark. The blush styling stays consistent."
              field="theme"
              value={appearanceForm.theme}
              options={appearanceOptions.theme}
              onChange={(field, value) => {
                const next = { ...appearanceForm, [field]: value }
                setAppearanceForm(next)
                setThemePreferences(next)
              }}
            />
            </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button type="submit" className="btn-primary" disabled={appearanceMutation.isPending}>
                {appearanceMutation.isPending ? 'Saving appearance...' : 'Save appearance'}
              </button>
            </div>
          </form> : <>

          {isStaff ? (
            <div className="card space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="section-title mb-1">Step-up access</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Request an OTP or register a passkey before protected clinical or admin actions.
                  </p>
                </div>
                {stepUpToken ? <span className="badge badge-success">Step-up active</span> : <span className="badge badge-gray">Step-up inactive</span>}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Purpose</label>
                  <select
                    className="input"
                    value={stepUpForm.purpose}
                    onChange={(event) => setStepUpForm((current) => ({ ...current, purpose: event.target.value }))}
                  >
                    <option value="critical">Critical actions</option>
                    <option value="clinical-signature">Clinical signature</option>
                    <option value="billing">Billing</option>
                    <option value="backup-restore">Backup / restore</option>
                    <option value="license-change">License change</option>
                    <option value="record-delete">Record deletion</option>
                    <option value="export-sensitive">Sensitive export</option>
                  </select>
                </div>
                <div>
                  <label className="label">Challenge ID</label>
                  <input className="input" value={stepUpForm.challengeId} readOnly placeholder="Send an OTP to generate a challenge" />
                </div>
                <div>
                  <label className="label">Verification code</label>
                  <input
                    className="input"
                    value={stepUpForm.code}
                    onChange={(event) => setStepUpForm((current) => ({ ...current, code: event.target.value }))}
                    placeholder="Enter the six-digit code"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleRequestStepUp} className="btn-secondary">
                  Send OTP
                </button>
                <button type="button" onClick={handleRegisterPasskey} className="btn-secondary">
                  Register passkey
                </button>
                <button type="button" onClick={handleClearStepUp} className="btn-ghost">
                  Clear step-up
                </button>
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={handleVerifyStepUp} className="btn-primary" disabled={!stepUpForm.code.trim()}>
                  Verify OTP
                </button>
              </div>
            </div>
          ) : null}

          <form id="change-password" className="card space-y-5" onSubmit={handlePasswordSubmit}>
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
              Changing your MWOS password ends existing MWOS sessions. It does not change your Google password or disconnect Google sign-in. For a Google-only account, use the recovery link to set an MWOS password.
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Link className="btn-secondary" to="/forgot-password">Recover or set MWOS password</Link>
              <button type="submit" className="btn-primary" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? 'Updating password...' : 'Change password'}
              </button>
            </div>
          </form>
          <AccountManagement account={account} />
          </>}
        </div> : null}
      </div>
    </div>
  )
}
