import React from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import BrandMark from './BrandMark'
import { getPortalDestination, getPortalIntent } from '../../utils/portalNavigation'

const clinicPriorities = [
  { label: 'Coordinated care', value: 'Prenatal to postnatal follow-up' },
  { label: 'Protected records', value: 'Access for authorized care teams' },
  { label: 'When urgent help is needed', value: 'Call local emergency services directly' },
]

export default function AuthLayout() {
  const user = useAuthStore((state) => state.user)
  const isHydrating = useAuthStore((state) => state.isHydrating)
  const location = useLocation()
  const isRegistration = location.pathname === '/register'
  const isOAuthCallback = location.pathname === '/oauth-callback'
  const isRecovery = ['/forgot-password', '/reset-password', '/reactivate-account'].includes(location.pathname)

  // A new OAuth patient must finish the required birth details before leaving this screen.
  if (user && !isOAuthCallback && !isRecovery) return <Navigate to={getPortalDestination(user, getPortalIntent(location.search))} replace />
  if (isHydrating) {
    return <div className="flex min-h-screen items-center justify-center"><div className="loading-spinner h-10 w-10" /></div>
  }

  return (
    <div className="auth-scene min-h-screen px-4 py-5 lg:px-8 lg:py-6">
      <div className="auth-scene-grid" />
      <div className={`auth-frame ${isRegistration ? 'auth-frame-registration' : ''}`}>
        <aside className="auth-context" aria-label="About TMC Copino">
          <img src="/clinic/clinic-exterior.jpg" alt="" aria-hidden="true" className="auth-context-image" />
          <div className="auth-context-overlay" />

          <div className="auth-context-content">
            <div>
              <BrandMark sublabel="Birthing home & medical clinic" />
              <div className="auth-context-copy">
                <p className="auth-kicker">Maternal care portal</p>
                <h1>Care coordination that stays clear at every stage.</h1>
                <p>
                  Manage appointments, records, follow-ups, and communication with your TMC Copino care team in one secure place.
                </p>
              </div>
            </div>

            <div className="auth-priority-list">
              {clinicPriorities.map((item) => (
                <div key={item.label} className="auth-priority-item">
                  <p>{item.label}</p>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>

            <div className="auth-context-note">
              <img src="/clinic/reception-information.jpg" alt="TMC Copino reception area" />
              <p>
                This portal is not an emergency response service. For urgent symptoms, contact local emergency services or go to the nearest appropriate facility.
              </p>
            </div>
          </div>
        </aside>

        <main className="auth-content">
          <div className={`auth-content-inner ${isRegistration ? 'auth-content-inner-wide' : ''}`}>
            <div className="auth-mobile-brand lg:hidden">
              <BrandMark compact sublabel="Birthing home & medical clinic" />
            </div>

            <figure className="auth-mobile-clinic lg:hidden">
              <img src="/clinic/clinic-exterior.jpg" alt="TMC Copino Birthing Home and Medical Clinic building" />
              <figcaption>
                <span>TMC Copino Birthing Home</span>
                <strong>Gajo, Tiwi, Albay</strong>
              </figcaption>
            </figure>

            <div className="auth-form-panel">
              <Outlet />
            </div>

            <p className="auth-location">
              TMC Copino Birthing Home and Medical Clinic - Gajo Tiwi, Albay
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
