import React, { startTransition, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { uploadResumableFile } from '../utils/chunkedUpload'
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

const ProfileMetric = ({ label, value }) => (
  <div className="rounded-2xl border border-white/50 bg-white/70 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-slate-900/50">
    <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500 dark:text-slate-400">{label}</p>
    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{value || 'Not yet assigned'}</p>
  </div>
)

export default function AccountCenterPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
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

  const { data: patientProfile } = useQuery({
    queryKey: ['patients-me-settings'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
    enabled: account?.role === 'patient',
  })

  const { data: documents = [] } = useQuery({
    queryKey: ['patient-documents'],
    queryFn: () => api.get('/documents/my').then((response) => response.data.data),
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
      patientCode: patientProfile.patient_code || '',
      birthingId: patientProfile.birthing_id || '',
      middleName: patientProfile.middle_name || '',
      suffix: patientProfile.suffix || '',
      dateOfBirth: patientProfile.date_of_birth?.slice(0, 10) || '',
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
      setPatientNotice('Identity, biometrics, and credentials saved.')
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

  const previewPalette = accentPresets[appearanceForm.accent] || accentPresets.rose
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
                <p className="text-sm uppercase tracking-[0.3em] text-white/70">Account Center</p>
                <h1 className="mt-2 text-3xl font-semibold">{profileForm.firstName || 'Your'} {profileForm.lastName || 'Profile'}</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/80">
                  Manage personal details, secure your login, and keep clinic credentials like Birthing ID, PhilHealth, and biometrics current.
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

      {account?.staffProfile ? (
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
                <label className="btn-secondary w-full cursor-pointer justify-center">
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
                <ProfileMetric label="Birthing ID" value={patientForm.birthingId} />
                <ProfileMetric label="Latest Delivery ID" value={latestDelivery?.delivery_code} />
              </div>

              <div className="rounded-3xl border border-white/50 bg-white/60 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Personal Information</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Basic identity details used across the patient portal, staff chart, and printed records.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
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
                  <div>
                    <label className="label">Pregnancy booklet number</label>
                    <input className="input" value={patientForm.pregnancyBookletNumber} onChange={(event) => updatePatientField('pregnancyBookletNumber', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Blood type</label>
                    <input className="input" value={patientForm.bloodType} onChange={(event) => updatePatientField('bloodType', event.target.value)} placeholder="A+, O-, AB+" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Credential notes</label>
                    <textarea className="input min-h-[96px]" value={patientForm.credentialNotes} onChange={(event) => updatePatientField('credentialNotes', event.target.value)} placeholder="Add notes about submitted IDs, verified documents, or pending requirements." />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/50 bg-white/60 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Biometrics & Care Details</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Clinical biometrics only. This stores care-related measurements, not raw fingerprint or facial authentication data.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Height (cm)</label>
                    <input className="input" type="number" step="0.01" value={patientForm.biometricHeightCm} onChange={(event) => updatePatientField('biometricHeightCm', event.target.value)} />
                  </div>
                  <div>
                    <label className="label">Weight (kg)</label>
                    <input className="input" type="number" step="0.01" value={patientForm.biometricWeightKg} onChange={(event) => updatePatientField('biometricWeightKg', event.target.value)} />
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
                    <textarea className="input min-h-[96px]" value={patientForm.biometricNotes} onChange={(event) => updatePatientField('biometricNotes', event.target.value)} placeholder="Baseline observations, special handling notes, or physical chart references." />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/50 bg-white/60 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Secure Document Uploads</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Upload PhilHealth ID, Birthing ID, and medical documents for staff verification.</p>
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
                          <a href={document.file_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-[var(--accent)]">
                            Open
                          </a>
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
