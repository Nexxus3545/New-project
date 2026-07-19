import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

// Layouts
import AppLayout from './components/common/AppLayout'
import AuthLayout from './components/common/AuthLayout'

// Auth pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DownloadPage from './pages/DownloadPage'

// Staff pages
import DashboardPage from './pages/DashboardPage'
import PatientsPage from './pages/PatientsPage'
import PatientDetailPage from './pages/PatientDetailPage'
import AppointmentsPage from './pages/AppointmentsPage'
import VitalsPage from './pages/VitalsPage'
import DeliveriesPage from './pages/DeliveriesPage'
import InventoryPage from './pages/InventoryPage'
import BillingPage from './pages/BillingPage'
import ReportsPage from './pages/ReportsPage'
import EducationPage from './pages/EducationPage'
import UsersPage from './pages/UsersPage'
import CompliancePage from './pages/CompliancePage'
import AccountCenterPage from './pages/AccountCenterPage'
import InteractionsPage from './pages/InteractionsPage'

// Patient portal pages
import PatientDashboardPage from './pages/patient/PatientDashboardPage'
import PatientAppointmentsPage from './pages/patient/PatientAppointmentsPage'
import PatientVitalsPage from './pages/patient/PatientVitalsPage'
import PatientRecordsPage from './pages/patient/PatientRecordsPage'
import PatientEducationPage from './pages/patient/PatientEducationPage'
import PatientDoctorsPage from './pages/patient/PatientDoctorsPage'
import PatientDoctorDetailPage from './pages/patient/PatientDoctorDetailPage'
import PatientPharmacyPage from './pages/patient/PatientPharmacyPage'
import PatientMedicineDetailPage from './pages/patient/PatientMedicineDetailPage'
import PatientCheckoutPage from './pages/patient/PatientCheckoutPage'
import PatientCheckoutSuccessPage from './pages/patient/PatientCheckoutSuccessPage'
import PatientNotificationsPage from './pages/patient/PatientNotificationsPage'
import PatientReportsPage from './pages/patient/PatientReportsPage'
import PatientEmergencyPage from './pages/patient/PatientEmergencyPage'

const ProtectedRoute = ({ children, roles }) => {
  const user = useAuthStore((s) => s.user)
  const isHydrating = useAuthStore((s) => s.isHydrating)
  if (isHydrating && !user) return <div className="flex min-h-screen items-center justify-center"><div className="loading-spinner w-10 h-10" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

const EntryRoute = () => {
  const user = useAuthStore((s) => s.user)
  const isHydrating = useAuthStore((s) => s.isHydrating)
  if (isHydrating && !user) return <div className="flex min-h-screen items-center justify-center"><div className="loading-spinner w-10 h-10" /></div>
  if (!user) return <DownloadPage />
  if (user.role === 'patient') return <Navigate to="/my/dashboard" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  const hydrateSession = useAuthStore((s) => s.hydrateSession)

  useEffect(() => {
    hydrateSession()
  }, [hydrateSession])

  return (
    <BrowserRouter>
      <Routes>
        {/* Auth */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route path="/" element={<EntryRoute />} />
        <Route path="/download" element={<DownloadPage />} />

        {/* Staff portal */}
        <Route element={
          <ProtectedRoute roles={['admin','doctor','midwife','nurse']}>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/:id" element={<PatientDetailPage />} />
          <Route path="/appointments" element={<AppointmentsPage />} />
          <Route path="/vitals" element={<VitalsPage />} />
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/education" element={<EducationPage />} />
          <Route path="/interactions" element={<InteractionsPage />} />
          <Route path="/account" element={<AccountCenterPage />} />
          <Route path="/compliance" element={
            <ProtectedRoute roles={['admin']}>
              <CompliancePage />
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute roles={['admin']}>
              <UsersPage />
            </ProtectedRoute>
          } />
        </Route>

        {/* Patient portal */}
        <Route element={
          <ProtectedRoute roles={['patient']}>
            <AppLayout patient />
          </ProtectedRoute>
        }>
          <Route path="/my/dashboard" element={<PatientDashboardPage />} />
          <Route path="/my/doctors" element={<PatientDoctorsPage />} />
          <Route path="/my/doctors/:id" element={<PatientDoctorDetailPage />} />
          <Route path="/my/pharmacy" element={<PatientPharmacyPage />} />
          <Route path="/my/pharmacy/checkout" element={<PatientCheckoutPage />} />
          <Route path="/my/pharmacy/success" element={<PatientCheckoutSuccessPage />} />
          <Route path="/my/pharmacy/:id" element={<PatientMedicineDetailPage />} />
          <Route path="/my/notifications" element={<PatientNotificationsPage />} />
          <Route path="/my/reports" element={<PatientReportsPage />} />
          <Route path="/my/appointments" element={<PatientAppointmentsPage />} />
          <Route path="/my/vitals" element={<PatientVitalsPage />} />
          <Route path="/my/records" element={<PatientRecordsPage />} />
          <Route path="/my/education" element={<PatientEducationPage />} />
          <Route path="/my/interactions" element={<InteractionsPage />} />
          <Route path="/my/emergency" element={<PatientEmergencyPage />} />
          <Route path="/my/profile" element={<AccountCenterPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
