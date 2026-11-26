import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)

// The first online visit downloads all files needed to launch the app offline.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
      // Check when reopening the PWA or returning online. Never force a reload of a draft.
      let lastCheck = 0
      const check = () => {
        if (!navigator.onLine || Date.now() - lastCheck < 15000) return
        lastCheck = Date.now()
        void registration.update().catch(() => {})
      }
      check()
      window.addEventListener('online', check)
      window.addEventListener('focus', check)
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
    }).catch(error => {
      console.warn('Offline shell registration failed', error)
    })
  })
}
