import React, { useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import BrandMark from './BrandMark'
import AppIcon from './AppIcon'
import { hasMaternalCare } from '../../utils/patientCare'

const staffNav = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/patients', icon: 'patients', label: 'Patients' },
  { to: '/appointments', icon: 'calendar', label: 'Appointments' },
  { to: '/prenatal-monitoring', icon: 'prenatal', label: 'Prenatal Monitoring' },
  { to: '/postnatal-monitoring', icon: 'postnatal', label: 'Postnatal Monitoring' },
  { to: '/pediatric-monitoring', icon: 'baby', label: 'Pediatric Monitoring' },
  { to: '/labor-delivery', icon: 'delivery', label: 'Labor & Delivery' },
  { to: '/medical-records', icon: 'records', label: 'Medical Records' },
  { to: '/telehealth', icon: 'video', label: 'Telehealth' },
  { to: '/messages', icon: 'messages', label: 'Messages' },
  { to: '/emergency-map', icon: 'emergency', label: 'Emergency Map' },
  { to: '/inventory', icon: 'inventory', label: 'Inventory' },
  { to: '/health-education', icon: 'education', label: 'Health Education' },
  { to: '/reports-analytics', icon: 'reports', label: 'Reports / Analytics' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
]

const adminNav = [
  { to: '/users', icon: 'users', label: 'User Management' },
  { to: '/staff-qualifications', icon: 'credentials', label: 'Staff Credentials' },
  { to: '/compliance', icon: 'compliance', label: 'Compliance' },
]

const patientNav = [
  { to: '/my/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/my/pregnancy', icon: 'prenatal', label: 'My Pregnancy' },
  { to: '/my/appointments', icon: 'calendar', label: 'Appointments' },
  { to: '/my/health-records', icon: 'records', label: 'Health Records' },
  { to: '/my/baby', icon: 'baby', label: 'Baby / Newborn' },
  { to: '/my/telehealth', icon: 'video', label: 'Telehealth' },
  { to: '/my/messages', icon: 'messages', label: 'Messages' },
  { to: '/my/notifications', icon: 'notifications', label: 'Notifications' },
  { to: '/my/health-tips', icon: 'health', label: 'Health Tips' },
  { to: '/my/profile', icon: 'profile', label: 'Profile' },
  { to: '/my/settings', icon: 'settings', label: 'Settings' },
]

const staffNavSections = [
  { title: 'Overview', items: staffNav.slice(0, 3) },
  { title: 'Clinical Monitoring', items: staffNav.slice(3, 8) },
  { title: 'Communication', items: staffNav.slice(8, 11) },
  { title: 'Operations', items: [...staffNav.slice(11, 14), { to: '/billing', icon: 'billing', label: 'Billing & Payments', roles: ['admin', 'doctor'] }] },
  { title: 'System', items: staffNav.slice(14) },
]

const patientNavSections = [
  { title: 'Care Overview', items: patientNav.slice(0, 2) },
  { title: 'My Care', items: patientNav.slice(2, 5) },
  { title: 'Communication', items: patientNav.slice(5, 8) },
  { title: 'Learning', items: patientNav.slice(8, 9) },
  { title: 'Account', items: patientNav.slice(9) },
]

export default function AppLayout({ patient = false }) {
  const { user, logout } = useAuthStore()
  const appearance = useThemeStore((state) => state.preferences)
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const maternal = hasMaternalCare(user || {})

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login')
  }

  const navSections = patient
    ? patientNavSections.map((section) => ({ ...section, items: section.items
        .filter((item) => maternal || item.to !== '/my/baby')
        .map((item) => !maternal && item.to === '/my/pregnancy'
          ? { to: '/my/vitals', icon: 'health', label: 'Clinic Readings' } : item) }))
    : [
        ...staffNavSections,
        ...(user?.role === 'admin' ? [{ title: 'Admin', items: adminNav }] : []),
      ].map((section) => ({ ...section, items: section.items.filter((item) => !item.roles || item.roles.includes(user?.role)) }))

  const currentPage = (() => {
    const titleMap = patient
      ? [
          ['/my/dashboard', ['Patient Dashboard', 'Your next clinic visit, follow-ups, messages, and saved records in one place.']],
          ['/my/vitals', ['Clinic Readings', 'Review measurements recorded during clinic visits.']],
          ['/my/pregnancy', [maternal ? 'My Pregnancy' : 'Clinic Readings', 'Review your saved clinic readings and provider guidance.']],
          ['/my/appointments', ['Appointments', 'Request a general checkup, follow-up, or pregnancy-related visit.']],
          ['/my/health-records', ['Health Records', 'Review your documents, laboratory results, prescriptions, and medical notes.']],
          ['/my/baby', [maternal ? 'Baby / Newborn' : 'Clinic Reports', 'Review saved care summaries and clinic records.']],
          ['/my/telehealth', ['Telehealth', 'Request a consultation and follow clinic responses.']],
          ['/my/messages', ['Messages', 'Secure clinic communication with timestamps and care history.']],
          ['/my/notifications', ['Notifications', 'Review unread reminders and clinic updates.']],
          ['/my/health-tips', ['Health Tips', 'Browse clinic-approved pregnancy, postnatal, newborn, and family-care education.']],
          ['/my/emergency', ['Emergency', 'Quick access to urgent clinic and barangay support.']],
          ['/my/profile', ['Profile', 'Your personal details, clinic IDs, documents, and care information.']],
          ['/my/settings', ['Settings', 'Sign-in, contact and recovery, appearance, and account security.']],
        ]
      : [
          ['/dashboard', ['Staff Dashboard', 'Today’s appointments, patient alerts, monitoring queues, and recent activity.']],
          ['/patients', ['Patients', 'Register and review general clinic, maternal, and newborn records.']],
          ['/appointments', ['Appointments', 'Book services through provider, date, time, confirmation, and status tracking.']],
          ['/prenatal-monitoring', ['Prenatal Monitoring', 'Record maternal vitals, pregnancy progress, labs, ultrasound notes, and risk flags.']],
          ['/postnatal-monitoring', ['Postnatal Monitoring', 'Track delivery recovery, follow-up, breastfeeding, wound status, and maternal wellbeing.']],
          ['/pediatric-monitoring', ['Pediatric Monitoring', 'Review newborn records, screening, immunization, and child monitoring.']],
          ['/labor-delivery', ['Labor & Delivery', 'Record delivery activity, partograph progress, newborn condition, and complications.']],
          ['/medical-records', ['Medical Records', 'Review examinations, labs, ultrasound, prescriptions, and document status.']],
          ['/telehealth', ['Telehealth', 'Manage consultation requests, provider acceptance, session notes, and follow-up guidance.']],
          ['/messages', ['Messages', 'Coordinate patient-to-clinic, provider, and staff communication.']],
          ['/emergency-map', ['Emergency Live Map', 'View consent-based emergency location shares for clinic, barangay, ambulance, and referral coordination.']],
          ['/inventory', ['Inventory', 'Manage medicine/product images, usage guidance, stock, reorder, and expiry status.']],
          ['/health-education', ['Health Education', 'Publish pregnancy, postnatal, newborn, nutrition, and family-planning videos or images.']],
          ['/reports-analytics', ['Reports / Analytics', 'Review clinic metrics, maternal indicators, and export-ready summaries.']],
          ['/billing', ['Billing & Payments', 'Review clinic bills and saved payment records. Online payment processing is not connected.']],
          ['/account', ['Profile', 'Your personal details and clinic credential information.']],
          ['/settings', ['Settings', 'Sign-in, contact and recovery, appearance, and account security.']],
        ]

    const found = titleMap.find(([prefix]) => location.pathname.startsWith(prefix))
    return found ? { title: found[1][0], description: found[1][1] } : { title: 'MWOS', description: 'Maternal Wellness and Operations Management System' }
  })()

  const hasFocusedWorkspaceHeader = [
    '/messages',
    '/telehealth',
    '/my/messages',
    '/my/telehealth',
  ].includes(location.pathname)

  const quickActions = patient
    ? [
        { to: '/my/appointments', icon: 'calendar', label: 'Appointments' },
        { to: '/my/messages', icon: 'messages', label: 'Message clinic' },
        { to: '/my/emergency', icon: 'emergency', label: 'Emergency' },
      ]
    : [
        { to: '/patients', icon: 'users', label: 'New patient' },
        { to: '/appointments', icon: 'calendar', label: 'Appointments' },
        { to: '/messages', icon: 'messages', label: 'Messages' },
      ]

  const todayLabel = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="futuristic-shell flex h-screen bg-[#fff8fb] dark:bg-slate-950 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        id="app-sidebar"
        className={`
        fixed lg:static inset-y-0 left-0 z-30 w-72 flex flex-col bg-white dark:bg-slate-900
        border-r border-gray-200 dark:border-slate-800 transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      >
        <div
          className="relative overflow-hidden border-b border-rose-100 bg-white px-5 py-5 text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
        >
          <div className="relative">
            <BrandMark compact sublabel={patient ? 'Patient experience' : 'Birthing home operations'} />
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="hero-chip">{patient ? 'Patient portal' : 'Clinic workspace'}</span>
              <span className="hero-chip">Role based</span>
              <span className="hero-chip">Emergency ready</span>
            </div>
          </div>
        </div>

        <nav aria-label={patient ? 'Patient modules' : 'Clinic modules'} className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-2">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-gray-400 dark:text-slate-500">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `sidebar-link ${isActive ? (patient ? 'sidebar-link-patient active' : 'active') : ''}`
                    }
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-800">
                      <AppIcon name={link.icon} />
                    </span>
                    <span>{link.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800/60 mb-2">
            <div className="w-10 h-10 rounded-2xl overflow-hidden bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center font-semibold text-sm">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <>
                  {user?.firstName?.[0]}
                  {user?.lastName?.[0]}
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                {user?.firstName} {user?.lastName}
              </p>
                <p className="text-xs text-gray-500 dark:text-slate-400 capitalize">
                  {user?.role} / {appearance.accent} / {appearance.theme}
                </p>
              </div>
            </div>

          <button
            onClick={() => navigate(patient ? '/my/settings' : '/settings')}
            className="btn-secondary w-full justify-center mb-2"
          >
            <AppIcon name="settings" />
            Account settings
          </button>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="btn-ghost w-full justify-center text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <AppIcon name="signOut" />
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800">
          <button type="button" aria-controls="app-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)} className="inline-flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            <AppIcon name="menu" />
            Menu
          </button>
          <BrandMark compact sublabel="Birthing home clinic workspace" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {!hasFocusedWorkspaceHeader ? (
            <div className="mb-5 rounded-[28px] border border-rose-100 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="section-kicker">{patient ? 'Patient Portal' : 'Maternal Workspace'}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{currentPage.title}</h1>
                    <span className="badge badge-gray">{user?.role || 'guest'}</span>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{currentPage.description}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <span className="hero-chip">{todayLabel}</span>
                  {quickActions.map((action) => (
                    <Link key={action.to} to={action.to} className="btn-secondary btn-sm">
                      <AppIcon name={action.icon} className="h-4 w-4" />
                      {action.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
