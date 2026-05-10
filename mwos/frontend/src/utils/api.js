import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor — attach access token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor — handle 401 and auto-refresh
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error)
    else prom.resolve(token)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      if (error.response?.data?.code === 'TOKEN_EXPIRED') {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject })
          })
            .then((token) => {
              original.headers.Authorization = `Bearer ${token}`
              return api(original)
            })
            .catch((err) => Promise.reject(err))
        }

        original._retry = true
        isRefreshing = true

        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshToken) {
          clearAuth()
          return Promise.reject(error)
        }

        try {
          const res = await axios.post('/api/auth/refresh', { refreshToken })
          const { accessToken, refreshToken: newRefresh } = res.data.data
          localStorage.setItem('accessToken', accessToken)
          localStorage.setItem('refreshToken', newRefresh)
          api.defaults.headers.common.Authorization = `Bearer ${accessToken}`
          processQueue(null, accessToken)
          original.headers.Authorization = `Bearer ${accessToken}`
          return api(original)
        } catch (refreshError) {
          processQueue(refreshError, null)
          clearAuth()
          return Promise.reject(refreshError)
        } finally {
          isRefreshing = false
        }
      }

      // Other 401 — clear auth
      clearAuth()
    }

    return Promise.reject(error)
  }
)

const clearAuth = () => {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
  window.location.href = '/login'
}

export default api
