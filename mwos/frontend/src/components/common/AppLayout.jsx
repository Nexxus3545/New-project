import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
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

const adminNav = [{ to: '/users', icon: 'US', label: 'Users' }]

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

export default function AppLayout({ patient = false }) {
  const { user, logout } = useAuthStore()
  const appearance = useThemeStore((state) => state.preferences)
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login')
  }

  const navLinks = patient ? patientNav : [...staffNav, ...(user?.role === 'admin' ? adminNav : [])]

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
            <BrandMark compact sublabel={patient ? 'Patient experience' : 'Operations workspace'} />
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? (patient ? 'sidebar-link-patient active' : 'active') : ''}`
              }
            >
              <span className="text-[11px] font-semibold w-7 h-7 rounded-md bg-gray-100 dark:bg-slate-800 inline-flex items-center justify-center">
                {link.icon}
              </span>
              <span>{link.label}</span>
            </NavLink>
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
          <BrandMark compact sublabel="Shared care workspace" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
