import React, { createContext, useContext, useState, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  title?: string
}

interface ToastContextType {
  toasts: ToastItem[]
  showToast: (message: string, type?: ToastType, title?: string) => void
  success: (message: string, title?: string) => void
  error: (message: string, title?: string) => void
  info: (message: string, title?: string) => void
  warning: (message: string, title?: string) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info', title?: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const newToast: ToastItem = { id, type, message, title }
    setToasts(prev => [...prev.slice(-4), newToast])

    setTimeout(() => {
      removeToast(id)
    }, 4000)
  }, [removeToast])

  const success = useCallback((message: string, title?: string) => showToast(message, 'success', title), [showToast])
  const error = useCallback((message: string, title?: string) => showToast(message, 'error', title), [showToast])
  const info = useCallback((message: string, title?: string) => showToast(message, 'info', title), [showToast])
  const warning = useCallback((message: string, title?: string) => showToast(message, 'warning', title), [showToast])

  const icons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠️',
    info: 'ℹ️'
  }

  const borderColors: Record<ToastType, string> = {
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: 'var(--accent-solid)'
  }

  const bgColors: Record<ToastType, string> = {
    success: 'rgba(34, 197, 94, 0.12)',
    error: 'rgba(239, 68, 68, 0.12)',
    warning: 'rgba(245, 158, 11, 0.12)',
    info: 'color-mix(in srgb, var(--accent-solid) 14%, var(--panel))'
  }

  return (
    <ToastContext.Provider value={{ toasts, showToast, success, error, info, warning, removeToast }}>
      {children}
      {/* Floating Toasts Container */}
      <div style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 400,
        pointerEvents: 'none'
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 14,
              background: 'var(--panel)',
              backgroundColor: bgColors[t.type],
              border: `1px solid ${borderColors[t.type]}`,
              boxShadow: '0 16px 36px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(16px)',
              color: 'var(--text)',
              animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 900,
              background: borderColors[t.type],
              color: '#fff',
              flexShrink: 0,
              marginTop: 1
            }}>
              {icons[t.type]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {t.title && (
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2, color: borderColors[t.type] }}>
                  {t.title}
                </div>
              )}
              <div style={{ fontSize: 12, lineHeight: 1.4, wordBreak: 'break-word' }}>
                {t.message}
              </div>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--muted)',
                cursor: 'pointer',
                fontSize: 14,
                padding: '0 2px',
                fontWeight: 'bold',
                alignSelf: 'flex-start'
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
