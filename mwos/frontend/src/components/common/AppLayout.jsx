import React, { useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import BrandMark from './BrandMark'

const staffNav = [
  { to: '/dashboard', icon: 'DB', label: 'Dashboard' },
  { to: '/patients', icon: 'PT', label: 'Patients' },
  { to: '/appointments', icon: 'AP', label: 'Appointments' },
  { to: '/vitals', icon: 'VT', label: 'Vitals' },
  { to: '/deliveries', icon: 'DL', label: 'Deliveries' },
  { to: '/inventory', icon: 'MD', label: 'Medicines' },
  { to: '/billing', icon: 'BL', label: 'Billing' },
  { to: '/reports', icon: 'RP', label: 'Reports' },
  { to: '/interactions', icon: 'CH', label: 'Care Hub' },
  { to: '/education', icon: 'ED', label: 'Education' },
  { to: '/account', icon: 'AC', label: 'Account' },
]

const adminNav = [
  { to: '/users', icon: 'US', label: 'Users' },
  { to: '/compliance', icon: 'CM', label: 'Compliance' },
]

const patientNav = [
  { to: '/my/dashboard', icon: 'HM', label: 'Home' },
  { to: '/my/doctors', icon: 'DR', label: 'Doctors' },
  { to: '/my/pharmacy', icon: 'RX', label: 'Pharmacy' },
  { to: '/my/notifications', icon: 'NT', label: 'Notifications' },
  { to: '/my/reports', icon: 'RP', label: 'Reports' },
  { to: '/my/appointments', icon: 'AP', label: 'Appointments' },
  { to: '/my/vitals', icon: 'VT', label: 'My Vitals' },
  { to: '/my/records', icon: 'RC', label: 'My Records' },
  { to: '/my/interactions', icon: 'CT', label: 'Care Team' },
  { to: '/my/education', icon: 'ED', label: 'Health Tips' },
  { to: '/my/emergency', icon: 'EM', label: 'Emergency' },
  { to: '/my/profile', icon: 'AC', label: 'Account' },
]

const staffNavSections = [
  { title: 'Overview', items: staffNav.slice(0, 3) },
  { title: 'Clinical', items: staffNav.slice(3, 7) },
  { title: 'Reference', items: staffNav.slice(7, 10) },
  { title: 'Account', items: staffNav.slice(10) },
]

const patientNavSections = [
  { title: 'Home', items: patientNav.slice(0, 4) },
  { title: 'Care', items: patientNav.slice(4, 10) },
  { title: 'Support', items: patientNav.slice(10, 11) },
  { title: 'Account', items: patientNav.slice(11) },
]

export default function AppLayout({ patient = false }) {
  const { user, logout } = useAuthStore()
  const appearance = useThemeStore((state) => state.preferences)
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login')
  }

  const navSections = patient
    ? patientNavSections
    : [
        ...staffNavSections,
        ...(user?.role === 'admin' ? [{ title: 'Admin', items: adminNav }] : []),
      ]

  const currentPage = (() => {
    const titleMap = patient
      ? [
          ['/my/dashboard', ['Patient Home', 'Your visits, records, pharmacy, and emergency support in one view.']],
          ['/my/doctors', ['Care Team', 'Browse the clinic providers available to you.']],
          ['/my/pharmacy', ['Pharmacy', 'Review medicines with images, usage, and precautions.']],
          ['/my/appointments', ['Appointments', 'Track visits and upcoming clinic schedules.']],
          ['/my/vitals', ['My Vitals', 'View your latest monitoring and trend history.']],
          ['/my/records', ['Medical Records', 'Keep important lab results and prescriptions close.']],
          ['/my/emergency', ['Emergency', 'Quick access to urgent clinic and barangay support.']],
        ]
      : [
          ['/dashboard', ['Control Center', 'A clinic-wide workspace for appointments, medicine flow, and care tasks.']],
          ['/patients', ['Patient Intake', 'Register and track patient records in a structured layout.']],
          ['/appointments', ['Appointments', 'Calendar-style scheduling for staff and patients.']],
          ['/vitals', ['3D Vitals', 'Fast maternal monitoring with visual body cues and trends.']],
          ['/deliveries', ['Labor and Delivery', 'Record delivery outcomes and post-delivery notes.']],
          ['/inventory', ['Medicine Management', 'Organize medication by image, purpose, and usage.']],
          ['/reports', ['Reports & Analytics', 'Operational summaries and export-ready statistics.']],
        ]

    const found = titleMap.find(([prefix]) => location.pathname.startsWith(prefix))
    return found ? { title: found[1][0], description: found[1][1] } : { title: 'MWOS', description: 'Maternal Wellness and Operations Management System' }
  })()

  const quickActions = patient
    ? [
        { to: '/my/appointments', label: 'Appointments' },
        { to: '/my/pharmacy', label: 'Pharmacy' },
        { to: '/my/emergency', label: 'Emergency' },
      ]
    : [
        { to: '/patients', label: 'New patient' },
        { to: '/appointments', label: 'Schedule' },
        { to: '/reports', label: 'Analytics' },
      ]

  const todayLabel = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="futuristic-shell flex h-screen bg-gray-50 dark:bg-slate-950 overflow-hidden">
      <div className="shell-orb shell-orb-a" />
      <div className="shell-orb shell-orb-b" />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`
        fixed lg:static inset-y-0 left-0 z-30 w-72 flex flex-col bg-white dark:bg-slate-900
        border-r border-gray-200 dark:border-slate-800 transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      >
        <div
          className="relative overflow-hidden border-b border-gray-200 px-5 py-5 text-white dark:border-slate-800"
          style={{ background: 'linear-gradient(145deg, var(--hero-start), var(--hero-end))' }}
        >
          <div className="absolute inset-y-0 right-0 w-28 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <BrandMark compact sublabel={patient ? 'Patient experience' : 'Birthing home operations'} />
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="hero-chip border-white/10 bg-white/10 text-white">Live care</span>
              <span className="hero-chip border-white/10 bg-white/10 text-white">{patient ? 'Patient view' : 'Clinic control'}</span>
              <span className="hero-chip border-white/10 bg-white/10 text-white">Emergency ready</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
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
                    <span className="text-[11px] font-semibold inline-flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 dark:bg-slate-800">
                      {link.icon}
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
            onClick={() => navigate(patient ? '/my/profile' : '/account')}
            className="btn-secondary w-full justify-center mb-2"
          >
            Manage account
          </button>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="btn-ghost w-full justify-center text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            Menu
          </button>
          <BrandMark compact sublabel="Birthing home clinic workspace" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mb-5 rounded-[30px] border border-white/80 bg-white/80 px-4 py-4 shadow-[0_24px_48px_rgba(15,118,110,0.08)] backdrop-blur">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="section-kicker">{patient ? 'Patient Portal' : 'Clinic Workspace'}</p>
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
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
