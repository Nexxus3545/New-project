import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { useThemeStore } from './store/themeStore'
import { useAuthStore } from './store/authStore'
import { bindSessionCache } from './utils/sessionCache'
import { initializeInstallApp } from './utils/installApp'

initializeInstallApp()

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
    {import.meta.env.VITE_LOCAL_DEMO === 'true' && <div role="note" style={{position:'fixed',bottom:0,left:0,right:0,zIndex:99999,padding:'8px 16px',background:'#71334d',color:'#fff',textAlign:'center',fontSize:13}}>LOCAL DEMO — All patients, staff, payments and reviews are fictional. External services are disabled.</div>}
    <App />
  </QueryClientProvider>
)
