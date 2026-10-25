import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { useThemeStore } from './store/themeStore'
import { useAuthStore } from './store/authStore'
import { bindSessionCache } from './utils/sessionCache'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
})

bindSessionCache(useAuthStore, queryClient)
useThemeStore.getState().initTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
)
