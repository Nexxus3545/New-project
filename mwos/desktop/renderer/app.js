import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

const DESKTOP_USER_KEY = 'desktop-user'
const DESKTOP_TOKEN_KEY = 'desktop-access-token'
const DESKTOP_CART_KEY = 'desktop-pharmacy-cart'

const platformEl = document.getElementById('platform')
const themeBtn = document.getElementById('theme-btn')
const loginForm = document.getElementById('login-form')
const loginResult = document.getElementById('login-result')
const dashboardBtn = document.getElementById('fetch-dashboard')
const dashboardOutput = document.getElementById('dashboard-output')
const saveNoteBtn = document.getElementById('save-note')
const loadNoteBtn = document.getElementById('load-note')
const offlineNote = document.getElementById('offline-note')
const offlineResult = document.getElementById('offline-result')
const sessionChip = document.getElementById('session-chip')
const patientCount = document.getElementById('patient-count')
const riskCount = document.getElementById('risk-count')
const coordinationCount = document.getElementById('coordination-count')
const taskCount = document.getElementById('task-count')
const pregnancyCount = document.getElementById('pregnancy-count')
const reviewCount = document.getElementById('review-count')
const documentCount = document.getElementById('document-count')
const mediaCount = document.getElementById('media-count')
const coordinationLabel = document.getElementById('coordination-label')
const taskLabel = document.getElementById('task-label')
const documentLabel = document.getElementById('document-label')
const mediaLabel = document.getElementById('media-label')
const patientCountLabel = document.getElementById('patient-count-label')
const riskCountLabel = document.getElementById('risk-count-label')
const pregnancyCountLabel = document.getElementById('pregnancy-count-label')
const reviewCountLabel = document.getElementById('review-count-label')
const heroTitle = document.getElementById('hero-title')
const heroDescription = document.getElementById('hero-description')
const systemModeText = document.getElementById('system-mode-text')
const designLanguageText = document.getElementById('design-language-text')
const snapshotSubtitle = document.getElementById('snapshot-subtitle')
const recommendationsEl = document.getElementById('recommendations')
const searchInput = document.getElementById('search-input')
const searchResultsEl = document.getElementById('search-results')
const feedListEl = document.getElementById('feed-list')
const patientDirectoryPanel = document.getElementById('patient-directory-panel')
const patientDirectoryEl = document.getElementById('patient-directory')
const patientPharmacyPanel = document.getElementById('patient-pharmacy-panel')
const patientPharmacyEl = document.getElementById('patient-pharmacy')
const desktopCartSummaryEl = document.getElementById('desktop-cart-summary')
const patientNotificationsPanel = document.getElementById('patient-notifications-panel')
const patientNotificationsEl = document.getElementById('patient-notifications')
const patientReportsPanel = document.getElementById('patient-reports-panel')
const patientReportsEl = document.getElementById('patient-reports')
const patientEmergencyPanel = document.getElementById('patient-emergency-panel')
const patientEmergencyEl = document.getElementById('patient-emergency')

let searchTimer = null
let currentUser = readStoredUser()
let currentDoctors = []
let currentMedicines = []
let currentPatientProfile = null
let desktopCart = readStoredCart()

platformEl.textContent = window.mwosDesktop?.platform || 'unknown'

function readStoredUser() {
  try {
    const stored = localStorage.getItem(DESKTOP_USER_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function persistDesktopUser(user) {
  localStorage.setItem(DESKTOP_USER_KEY, JSON.stringify(user))
}

function clearDesktopUser() {
  localStorage.removeItem(DESKTOP_USER_KEY)
}

function readStoredCart() {
  try {
    const stored = localStorage.getItem(DESKTOP_CART_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function persistDesktopCart() {
  localStorage.setItem(DESKTOP_CART_KEY, JSON.stringify(desktopCart))
}

function setTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('desktop-theme', theme)
}

function roleIsPatient() {
  return currentUser?.role === 'patient'
}

function applyToken(token) {
  localStorage.setItem(DESKTOP_TOKEN_KEY, token)
  api.defaults.headers.common.Authorization = `Bearer ${token}`
}

function clearDesktopSession() {
  localStorage.removeItem(DESKTOP_TOKEN_KEY)
  clearDesktopUser()
  currentUser = null
  delete api.defaults.headers.common.Authorization
}

function renderMessage(el, message) {
  el.innerHTML = `<p class="status-text">${message}</p>`
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function setWorkspaceChrome() {
  if (roleIsPatient()) {
    heroTitle.textContent = 'One desktop workspace, now with patient care flows.'
    heroDescription.textContent = 'Review doctors, pharmacy, notifications, reports, and emergency options without changing the desktop shell.'
    systemModeText.textContent = 'Patient care'
    designLanguageText.textContent = 'Existing desktop layout'
    snapshotSubtitle.textContent = 'Pull patient-facing metrics from the shared MWOS backend.'
    sessionChip.textContent = `${currentUser.role} session active`
  } else {
    heroTitle.textContent = 'One interface language for web, mobile, and desktop.'
    heroDescription.textContent = 'The desktop app now follows the same light-first MWOS structure: secure sign-in, care priorities, educational media, analytics, and offline drafting in one branded surface.'
    systemModeText.textContent = 'Connected care'
    designLanguageText.textContent = 'Rose glass + teal depth'
    snapshotSubtitle.textContent = 'Pull live metrics from the backend API.'
    sessionChip.textContent = currentUser ? `${currentUser.role} session active` : 'Awaiting sign in'
  }
}

function togglePatientPanels(isVisible) {
  patientDirectoryPanel.hidden = !isVisible
  patientPharmacyPanel.hidden = !isVisible
  patientNotificationsPanel.hidden = !isVisible
  patientReportsPanel.hidden = !isVisible
  patientEmergencyPanel.hidden = !isVisible
}

function renderRecommendations(payload) {
  const suggestions = payload?.suggestions || []
  if (!suggestions.length) {
    renderMessage(recommendationsEl, 'No recommendations available yet.')
    return
  }

  recommendationsEl.innerHTML = suggestions.map((item) => `
    <article class="recommendation-card priority-${item.priority || 'low'}">
      <div class="recommendation-head">
        <span class="mini-label">${String(item.type || 'guide').toUpperCase()}</span>
        <span class="chip small-chip">${item.priority || 'info'}</span>
      </div>
      <strong>${item.title}</strong>
      <p>${item.description}</p>
      ${item.route ? `<span class="route-hint">Suggested screen: ${item.route}</span>` : ''}
    </article>
  `).join('')
}

function renderSearchResults(results) {
  if (!results.length) {
    renderMessage(searchResultsEl, 'No matching items found.')
    return
  }

  searchResultsEl.innerHTML = results.map((item) => `
    <article class="search-card">
      <div>
        <strong>${item.title}</strong>
        <p>${item.category || item.result_type}</p>
      </div>
      <span class="chip small-chip">${item.result_type}</span>
    </article>
  `).join('')
}

function renderFeed(posts) {
  if (!posts.length) {
    renderMessage(feedListEl, 'No feed media available yet.')
    return
  }

  feedListEl.innerHTML = posts.map((post) => {
    const mediaUrl = post.media_url || post.video_url || ''
    const poster = post.poster_url || post.thumbnail_url || ''
    const media = post.media_type === 'image'
      ? `<img src="${mediaUrl}" alt="${post.title}" />`
      : `<video src="${mediaUrl}" ${poster ? `poster="${poster}"` : ''} muted playsinline controls></video>`

    return `
      <article class="feed-card">
        <div class="feed-media">${media}</div>
        <div class="feed-copy">
          <div class="feed-meta-row">
            <span class="mini-label">${post.category || 'General'}</span>
            <span class="chip small-chip">${post.media_type || 'media'}</span>
          </div>
          <strong>${post.title}</strong>
          <p>${post.description || 'Clinic educational media.'}</p>
          <span class="route-hint">${post.engagement_views || 0} views</span>
        </div>
      </article>
    `
  }).join('')
}

function renderStaffSnapshot(data) {
  const stats = data?.stats || {}
  patientCountLabel.textContent = 'Patients'
  riskCountLabel.textContent = 'High risk'
  pregnancyCountLabel.textContent = 'Active pregnancies'
  reviewCountLabel.textContent = 'Reviews'
  coordinationLabel.textContent = 'Unread threads'
  taskLabel.textContent = 'Open tasks'
  documentLabel.textContent = 'Documents'
  mediaLabel.textContent = 'Media'
  patientCount.textContent = stats.totalPatients ?? '--'
  riskCount.textContent = stats.highRiskPatients ?? '--'
  pregnancyCount.textContent = stats.activePregnancies ?? '--'
  reviewCount.textContent = stats.totalReviews ?? '--'
  coordinationCount.textContent = stats.unreadThreads ?? '--'
  taskCount.textContent = stats.openCareTasks ?? '--'
  documentCount.textContent = stats.documentsUploaded ?? '--'
  mediaCount.textContent = stats.mediaUploads ?? '--'
  dashboardOutput.textContent = JSON.stringify(data, null, 2)
}

function renderPatientSnapshot(dashboard) {
  patientCountLabel.textContent = 'Unread messages'
  riskCountLabel.textContent = 'Open tasks'
  pregnancyCountLabel.textContent = 'Verified docs'
  reviewCountLabel.textContent = 'Due date'
  coordinationLabel.textContent = 'Unread alerts'
  taskLabel.textContent = 'Care tasks'
  documentLabel.textContent = 'Uploaded docs'
  mediaLabel.textContent = 'Reviews'
  patientCount.textContent = dashboard.unreadMessages ?? '--'
  riskCount.textContent = dashboard.openCareTasks ?? '--'
  pregnancyCount.textContent = dashboard.documentSummary?.verified ?? '--'
  reviewCount.textContent = dashboard.activePregnancy?.edd ? formatDate(dashboard.activePregnancy.edd) : 'TBD'
  coordinationCount.textContent = dashboard.unreadMessages ?? '--'
  taskCount.textContent = dashboard.openCareTasks ?? '--'
  documentCount.textContent = dashboard.documentSummary?.total ?? '--'
  mediaCount.textContent = dashboard.reviewSummary?.total_reviews ?? '--'
  dashboardOutput.textContent = JSON.stringify({
    nextAppointment: dashboard.nextAppointment,
    activePregnancy: dashboard.activePregnancy,
    latestVitals: dashboard.latestVitals,
    documentSummary: dashboard.documentSummary,
    unreadMessages: dashboard.unreadMessages,
    openCareTasks: dashboard.openCareTasks,
  }, null, 2)
}

function renderPatientDirectory(staff) {
  currentDoctors = (staff || []).filter((member) => ['doctor', 'midwife'].includes(member.role)).slice(0, 6)

  if (!currentDoctors.length) {
    renderMessage(patientDirectoryEl, 'No care team profiles available yet.')
    return
  }

  patientDirectoryEl.innerHTML = currentDoctors.map((doctor) => `
    <article class="detail-card">
      <div class="detail-head">
        <div>
          <strong>${doctor.first_name} ${doctor.last_name}</strong>
          <p>${doctor.role === 'midwife' ? 'Midwife' : 'Doctor'} - TMC Copino Clinic</p>
        </div>
        <span class="chip small-chip">Available</span>
      </div>
      <div class="action-row">
        <button class="secondary-btn compact-btn" data-request-doctor="${doctor.id}">Request consult</button>
      </div>
    </article>
  `).join('')

  patientDirectoryEl.querySelectorAll('[data-request-doctor]').forEach((button) => {
    button.addEventListener('click', async () => {
      const doctor = currentDoctors.find((item) => item.id === button.dataset.requestDoctor)
      if (!doctor) return

      try {
        await api.post('/interactions/threads', {
          title: `${doctor.first_name} ${doctor.last_name} consultation request`,
          initialMessage: `Hello care team, I would like to request a consultation with ${doctor.first_name} ${doctor.last_name}.`,
          priority: 'high',
        })
        offlineResult.textContent = `Consultation request sent for ${doctor.first_name} ${doctor.last_name}.`
      } catch (error) {
        offlineResult.textContent = error.response?.data?.message || 'Unable to create consultation request.'
      }
    })
  })
}

function addToDesktopCart(medicineId) {
  const medicine = currentMedicines.find((item) => String(item.id) === String(medicineId))
  if (!medicine) return

  const existing = desktopCart.find((item) => String(item.id) === String(medicine.id))
  if (!existing) {
    desktopCart = [...desktopCart, { ...medicine, quantity: 1 }]
  } else {
    desktopCart = desktopCart.map((item) => (
      String(item.id) === String(medicine.id)
        ? { ...item, quantity: Math.min(99, (item.quantity || 1) + 1) }
        : item
    ))
  }

  persistDesktopCart()
  renderDesktopCartSummary()
}

function removeFromDesktopCart(medicineId) {
  desktopCart = desktopCart.filter((item) => String(item.id) !== String(medicineId))
  persistDesktopCart()
  renderDesktopCartSummary()
}

function renderPatientPharmacy(medicines) {
  currentMedicines = (medicines || []).slice(0, 6)

  if (!currentMedicines.length) {
    renderMessage(patientPharmacyEl, 'No medicines available right now.')
    renderDesktopCartSummary()
    return
  }

  patientPharmacyEl.innerHTML = currentMedicines.map((medicine) => `
    <article class="detail-card">
      <div class="detail-head">
        <div>
          <strong>${medicine.item_name}</strong>
          <p>${medicine.dosage || medicine.unit || 'Clinic stock'}</p>
        </div>
        <span class="chip small-chip">${medicine.availability_status || 'available'}</span>
      </div>
      ${medicine.description ? `<p class="support-note">${medicine.description}</p>` : ''}
      <div class="action-row">
        <button class="secondary-btn compact-btn" data-add-medicine="${medicine.id}">Add to cart</button>
      </div>
    </article>
  `).join('')

  patientPharmacyEl.querySelectorAll('[data-add-medicine]').forEach((button) => {
    button.addEventListener('click', () => addToDesktopCart(button.dataset.addMedicine))
  })

  renderDesktopCartSummary()
}

function renderDesktopCartSummary() {
  if (!desktopCart.length) {
    desktopCartSummaryEl.innerHTML = '<p class="status-text">Cart is empty.</p>'
    return
  }

  const totalUnits = desktopCart.reduce((sum, item) => sum + (item.quantity || 1), 0)
  desktopCartSummaryEl.innerHTML = `
    <div class="status-block-inner">
      <p class="mini-label">Pickup summary</p>
      <p class="status-text">${totalUnits} medicine item(s) selected.</p>
      <div class="stack compact-stack">
        ${desktopCart.map((item) => `
          <div class="list-line">
            <span>${item.item_name} x${item.quantity || 1}</span>
            <button class="ghost-btn compact-btn" data-remove-cart="${item.id}">Remove</button>
          </div>
        `).join('')}
      </div>
      <div class="action-row">
        <button id="desktop-checkout-btn" class="secondary-btn compact-btn">Send pickup request</button>
      </div>
    </div>
  `

  desktopCartSummaryEl.querySelectorAll('[data-remove-cart]').forEach((button) => {
    button.addEventListener('click', () => removeFromDesktopCart(button.dataset.removeCart))
  })

  const checkoutButton = document.getElementById('desktop-checkout-btn')
  if (checkoutButton) {
    checkoutButton.addEventListener('click', submitDesktopCheckout)
  }
}

async function submitDesktopCheckout() {
  if (!desktopCart.length || !currentPatientProfile) return

  try {
    await api.post('/interactions/threads', {
      title: 'Pharmacy pickup request',
      initialMessage: [
        `Patient: ${currentPatientProfile.first_name || 'Unknown'} ${currentPatientProfile.last_name || ''}`.trim(),
        'Requested medicines:',
        ...desktopCart.map((item) => `- ${item.item_name} x${item.quantity || 1}`),
      ].join('\n'),
      priority: 'high',
    })

    desktopCart = []
    persistDesktopCart()
    renderDesktopCartSummary()
    offlineResult.textContent = 'Pickup request sent to the clinic support team.'
  } catch (error) {
    offlineResult.textContent = error.response?.data?.message || 'Unable to send pickup request.'
  }
}

function renderPatientNotifications(notifications) {
  if (!(notifications || []).length) {
    renderMessage(patientNotificationsEl, 'No notifications yet.')
    return
  }

  patientNotificationsEl.innerHTML = notifications.slice(0, 6).map((item) => `
    <article class="detail-card ${item.is_read ? '' : 'highlight-card'}">
      <div class="detail-head">
        <div>
          <strong>${item.title}</strong>
          <p>${item.body}</p>
        </div>
        ${item.is_read ? '' : '<span class="chip small-chip">New</span>'}
      </div>
      <div class="action-row">
        <span class="route-hint">${formatDateTime(item.created_at)}</span>
        ${item.is_read ? '' : `<button class="secondary-btn compact-btn" data-mark-read="${item.id}">Mark read</button>`}
      </div>
    </article>
  `).join('')

  patientNotificationsEl.querySelectorAll('[data-mark-read]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api.patch(`/notifications/${button.dataset.markRead}/read`)
        await loadPatientWorkspace()
      } catch (error) {
        renderMessage(patientNotificationsEl, error.response?.data?.message || 'Unable to mark notification as read.')
      }
    })
  })
}

function renderPatientReports(dashboard, vitals) {
  const recentVitals = (vitals || []).slice(0, 4)
  patientReportsEl.innerHTML = `
    <div class="metric-stack">
      <article class="mini-panel">
        <span class="mini-label">Verified docs</span>
        <strong>${dashboard.documentSummary?.verified || 0}</strong>
      </article>
      <article class="mini-panel">
        <span class="mini-label">Unread messages</span>
        <strong>${dashboard.unreadMessages || 0}</strong>
      </article>
      <article class="mini-panel">
        <span class="mini-label">Open tasks</span>
        <strong>${dashboard.openCareTasks || 0}</strong>
      </article>
    </div>
    <div class="stack compact-stack">
      <p class="mini-label">Recent vitals</p>
      ${recentVitals.length ? recentVitals.map((item) => `
        <div class="list-line">
          <span>${formatDate(item.visit_date)} - ${item.bp_systolic}/${item.bp_diastolic}</span>
          <span class="chip small-chip">${item.bp_category || 'recorded'}</span>
        </div>
      `).join('') : '<p class="status-text">No vitals recorded yet.</p>'}
    </div>
  `
}

function renderPatientEmergency(patient) {
  const emergencyNumber = patient?.emergency_contact_phone || '911'
  const clinicNumber = '0917-000-0000'
  patientEmergencyEl.innerHTML = `
    <div class="stack compact-stack">
      <p class="status-text">If you are experiencing heavy bleeding, severe difficulty breathing, or loss of consciousness, contact emergency services immediately.</p>
      <div class="action-row">
        <a class="link-button" href="tel:${emergencyNumber}">Call emergency: ${emergencyNumber}</a>
        <a class="link-button secondary-link" href="tel:${clinicNumber}">Call clinic: ${clinicNumber}</a>
      </div>
      <div class="action-row">
        <button id="desktop-emergency-btn" class="secondary-btn compact-btn">Request urgent support</button>
      </div>
    </div>
  `

  const emergencyButton = document.getElementById('desktop-emergency-btn')
  if (emergencyButton) {
    emergencyButton.addEventListener('click', async () => {
      try {
        await api.post('/interactions/threads', {
          title: 'Urgent support request',
          initialMessage: 'Hello care team, I need urgent assistance and would like emergency guidance right away.',
          priority: 'high',
        })
        offlineResult.textContent = 'Urgent support request sent to the clinic.'
      } catch (error) {
        offlineResult.textContent = error.response?.data?.message || 'Unable to send urgent support request.'
      }
    })
  }
}

async function loadStaffWorkspace() {
  togglePatientPanels(false)
  const [dashboardRes, recommendationsRes, feedRes] = await Promise.all([
    api.get('/reports/dashboard'),
    api.get('/ai/recommendations'),
    api.get('/media-feed/posts'),
  ])

  renderStaffSnapshot(dashboardRes.data.data)
  renderRecommendations(recommendationsRes.data.data)
  renderFeed((feedRes.data.data || []).slice(0, 6))
}

async function loadPatientWorkspace() {
  togglePatientPanels(true)

  const patientRes = await api.get('/patients/me')
  currentPatientProfile = patientRes.data.data

  const [dashboardRes, recommendationsRes, feedRes, directoryRes, medicinesRes, notificationsRes, vitalsRes] = await Promise.all([
    api.get('/reports/patient-dashboard'),
    api.get('/ai/recommendations'),
    api.get('/media-feed/posts'),
    api.get('/interactions/directory'),
    api.get('/medicines'),
    api.get('/notifications'),
    api.get(`/vitals/patient/${currentPatientProfile.id}`),
  ])

  renderPatientSnapshot(dashboardRes.data.data)
  renderRecommendations(recommendationsRes.data.data)
  renderFeed((feedRes.data.data || []).slice(0, 6))
  renderPatientDirectory(directoryRes.data.data?.staff || [])
  renderPatientPharmacy(medicinesRes.data.data || [])
  renderPatientNotifications(notificationsRes.data.data || [])
  renderPatientReports(dashboardRes.data.data, vitalsRes.data.data || [])
  renderPatientEmergency(currentPatientProfile)
}

async function hydrateDesktopSession() {
  const token = localStorage.getItem(DESKTOP_TOKEN_KEY)
  if (!token) {
    clearDesktopSession()
    setWorkspaceChrome()
    return
  }

  applyToken(token)
  try {
    const userRes = await api.get('/auth/me')
    currentUser = userRes.data.data
    persistDesktopUser(currentUser)
    loginResult.textContent = `Signed in as ${currentUser.firstName} ${currentUser.lastName} (${currentUser.role})`
    setWorkspaceChrome()
  } catch {
    clearDesktopSession()
    loginResult.textContent = 'Sign in required.'
  }
}

async function loadDesktopWorkspace() {
  if (!localStorage.getItem(DESKTOP_TOKEN_KEY)) return
  try {
    if (!currentUser) {
      await hydrateDesktopSession()
    }
    if (!currentUser) return

    setWorkspaceChrome()
    if (roleIsPatient()) {
      await loadPatientWorkspace()
    } else {
      await loadStaffWorkspace()
    }
  } catch (error) {
    loginResult.textContent = error.response?.data?.message || error.message
  }
}

setTheme(localStorage.getItem('desktop-theme') || 'light')
setWorkspaceChrome()

themeBtn.addEventListener('click', () => {
  const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  setTheme(current === 'dark' ? 'light' : 'dark')
})

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const email = document.getElementById('email').value
  const password = document.getElementById('password').value

  try {
    const res = await api.post('/auth/login', { email, password })
    const { accessToken, user } = res.data.data
    currentUser = user
    persistDesktopUser(user)
    applyToken(accessToken)
    loginResult.textContent = `Signed in as ${user.firstName} ${user.lastName} (${user.role})`
    setWorkspaceChrome()
    await loadDesktopWorkspace()
  } catch (error) {
    loginResult.textContent = error.response?.data?.message || 'Login failed'
    sessionChip.textContent = 'Sign in required'
  }
})

dashboardBtn.addEventListener('click', async () => {
  try {
    await loadDesktopWorkspace()
  } catch (error) {
    dashboardOutput.textContent = error.response?.data?.message || error.message
  }
})

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim()
  window.clearTimeout(searchTimer)

  if (!query) {
    renderMessage(searchResultsEl, 'Start typing to search.')
    return
  }

  searchTimer = window.setTimeout(async () => {
    try {
      const res = await api.get('/ai/search', { params: { q: query } })
      renderSearchResults(res.data.data || [])
    } catch (error) {
      renderMessage(searchResultsEl, error.response?.data?.message || 'Search failed.')
    }
  }, 220)
})

saveNoteBtn.addEventListener('click', () => {
  localStorage.setItem('offline-note', offlineNote.value)
  offlineResult.textContent = 'Offline note saved locally.'
})

loadNoteBtn.addEventListener('click', () => {
  offlineNote.value = localStorage.getItem('offline-note') || ''
  offlineResult.textContent = 'Offline note loaded.'
})

await hydrateDesktopSession()
await loadDesktopWorkspace()
