import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppSettingsProvider } from './context/AppSettingsContext'
import { ToastProvider } from './context/ToastContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppSettingsProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AppSettingsProvider>
  </React.StrictMode>
)
