import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'
import { useAppSettings } from '../context/AppSettingsContext'

interface Props {
  isOpen: boolean
  onClose: () => void
  connected: boolean
}

type BrowserType = 'chrome' | 'firefox'

export default function ExtensionInstallModal({ isOpen, onClose, connected }: Props) {
  const { t } = useAppSettings()
  const toast = useToast()
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserType>('chrome')
  const [zipping, setZipping] = useState(false)
  const [openingFolder, setOpeningFolder] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleOpenFolder = async () => {
    setOpeningFolder(true)
    try {
      const res = await window.api?.openExtensionFolder(selectedBrowser)
      if (res?.success) {
        toast.success(t('extFolderOpened'))
      } else {
        toast.error(res?.error || t('error'))
      }
    } catch (e: any) {
      toast.error(t('error') + ': ' + (e?.message || e))
    }
    setOpeningFolder(false)
  }

  const handleExportZip = async () => {
    setZipping(true)
    try {
      const res = await window.api?.exportExtensionZip(selectedBrowser)
      if (res?.success) {
        toast.success(`${res.fileName || 'voltget-extension.zip'} (${t('success')})`)
      } else {
        toast.error(t('error'))
      }
    } catch (e: any) {
      toast.error(t('error') + ': ' + (e?.message || e))
    }
    setZipping(false)
  }

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    toast.info(`${url} (${t('copied')})`)
    setTimeout(() => setCopiedUrl(null), 2500)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(3, 6, 15, 0.82)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="card-premium animate-slide-up"
        style={{
          width: '100%',
          maxWidth: 640,
          borderRadius: 22,
          border: '1px solid color-mix(in srgb, var(--accent-solid) 35%, rgba(255,255,255,0.1))',
          boxShadow: '0 30px 90px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh'
        }}
      >
        {/* Modal Başlık Çubuğu */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--panel-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--accent-from), var(--accent-to))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                boxShadow: '0 4px 14px color-mix(in srgb, var(--accent-solid) 40%, transparent)'
              }}
            >
              🧩
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: '0.01em', color: 'var(--text-bright)' }}>
                {t('extModalTitle')}
              </div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 1 }}>
                {t('extModalSubtitle')}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              width: 34,
              height: 34,
              borderRadius: 10,
              color: 'var(--muted)',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--border-2)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            ✕
          </button>
        </div>

        {/* Modal İçeriği */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Tarayıcı Seçim Sekmeleri (Chrome vs Firefox) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              padding: 5,
              background: 'var(--panel-3)',
              borderRadius: 14,
              border: '1px solid var(--border)'
            }}
          >
            <button
              onClick={() => setSelectedBrowser('chrome')}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: 0,
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.16s ease',
                background: selectedBrowser === 'chrome'
                  ? 'linear-gradient(135deg, #2563eb, #0ea5e9)'
                  : 'transparent',
                color: selectedBrowser === 'chrome' ? '#fff' : 'var(--muted)',
                boxShadow: selectedBrowser === 'chrome' ? '0 4px 16px rgba(37,99,235,0.35)' : 'none'
              }}
            >
              <span style={{ fontSize: 16 }}>🌐</span>
              <span>{t('chromeEdgeTab')}</span>
            </button>

            <button
              onClick={() => setSelectedBrowser('firefox')}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: 0,
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.16s ease',
                background: selectedBrowser === 'firefox'
                  ? 'linear-gradient(135deg, #ea580c, #f97316)'
                  : 'transparent',
                color: selectedBrowser === 'firefox' ? '#fff' : 'var(--muted)',
                boxShadow: selectedBrowser === 'firefox' ? '0 4px 16px rgba(234,88,12,0.35)' : 'none'
              }}
            >
              <span style={{ fontSize: 16 }}>🦊</span>
              <span>{t('firefoxTab')}</span>
            </button>
          </div>

          {/* Canlı Bağlantı Durumu Kartı */}
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 14,
              border: connected
                ? '1px solid rgba(34, 197, 94, 0.4)'
                : '1px solid rgba(234, 179, 8, 0.3)',
              background: connected
                ? 'rgba(34, 197, 94, 0.08)'
                : 'rgba(234, 179, 8, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 14
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: connected ? '#15803d' : '#854d0e',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                boxShadow: connected ? '0 0 20px rgba(34, 197, 94, 0.4)' : 'none'
              }}
            >
              {connected ? '✓' : '⚡'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: connected ? '#86efac' : '#fde047' }}>
                {connected ? t('extConnectedTitle') : t('extWaitingTitle')}
              </div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2, color: 'var(--text)' }}>
                {connected ? t('extConnectedLongDesc') : t('extWaitingLongDesc')}
              </div>
            </div>
          </div>

          {/* Hızlı Eylemler (Klasör Aç & ZIP İndir) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
            <button
              onClick={handleOpenFolder}
              disabled={openingFolder}
              className="btn-premium"
              style={{
                padding: '12px 14px',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <span>📂</span>
              <span>{openingFolder ? t('openingFolder') : (selectedBrowser === 'firefox' ? t('openFirefoxExtFolder') : t('openChromeExtFolder'))}</span>
            </button>

            <button
              onClick={handleExportZip}
              disabled={zipping}
              className="btn-secondary"
              style={{
                padding: '12px 14px',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <span>📦</span>
              <span>{zipping ? t('zippingState') : t('exportZipBtn')}</span>
            </button>
          </div>

          {/* Dinamik Kurulum Rehberi (Chrome vs Firefox) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🚀</span> {selectedBrowser === 'firefox' ? t('firefoxEasySteps') : t('chromeEasySteps')}
            </div>

            {selectedBrowser === 'chrome' ? (
              <>
                {/* Chrome Adım 1 */}
                <div
                  style={{
                    background: 'var(--panel-2)',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    padding: 13,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start'
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 99,
                      background: 'var(--accent-solid)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 11,
                      flexShrink: 0
                    }}
                  >
                    1
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 12 }}>{t('chromeStep1Title')}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>
                      {t('chromeStep1Sub')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleCopyUrl('chrome://extensions')}
                        style={{
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          padding: '5px 10px',
                          borderRadius: 8,
                          fontSize: 11,
                          color: 'var(--text)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 600
                        }}
                      >
                        <span>📋</span> chrome://extensions
                      </button>
                      <button
                        onClick={() => handleCopyUrl('edge://extensions')}
                        style={{
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          padding: '5px 10px',
                          borderRadius: 8,
                          fontSize: 11,
                          color: 'var(--text)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 600
                        }}
                      >
                        <span>📋</span> edge://extensions
                      </button>
                      {copiedUrl && (
                        <span style={{ fontSize: 11, color: '#22c55e', alignSelf: 'center', fontWeight: 700 }}>
                          ✓ {t('copied')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chrome Adım 2 */}
                <div
                  style={{
                    background: 'var(--panel-2)',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    padding: 13,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start'
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 99,
                      background: 'var(--accent-solid)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 11,
                      flexShrink: 0
                    }}
                  >
                    2
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 12 }}>{t('chromeStep2Title')}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>
                      {t('chromeStep2Sub')}
                    </div>
                  </div>
                </div>

                {/* Chrome Adım 3 */}
                <div
                  style={{
                    background: 'var(--panel-2)',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    padding: 13,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start'
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 99,
                      background: 'var(--accent-solid)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 11,
                      flexShrink: 0
                    }}
                  >
                    3
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 12 }}>{t('chromeStep3Title')}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>
                      {t('chromeStep3Sub')}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Firefox Adım 1 */}
                <div
                  style={{
                    background: 'var(--panel-2)',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    padding: 13,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start'
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 99,
                      background: '#ea580c',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 11,
                      flexShrink: 0
                    }}
                  >
                    1
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 12 }}>{t('firefoxStep1Title')}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>
                      {t('firefoxStep1Sub')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
                      <button
                        onClick={() => handleCopyUrl('about:debugging#/runtime/this-firefox')}
                        style={{
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          padding: '5px 10px',
                          borderRadius: 8,
                          fontSize: 11,
                          color: 'var(--text)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 600
                        }}
                      >
                        <span>📋</span> about:debugging#/runtime/this-firefox
                      </button>
                      {copiedUrl && (
                        <span style={{ fontSize: 11, color: '#22c55e', alignSelf: 'center', fontWeight: 700 }}>
                          ✓ {t('copied')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Firefox Adım 2 */}
                <div
                  style={{
                    background: 'var(--panel-2)',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    padding: 13,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start'
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 99,
                      background: '#ea580c',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 11,
                      flexShrink: 0
                    }}
                  >
                    2
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 12 }}>{t('firefoxStep2Title')}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>
                      {t('firefoxStep2Sub')}
                    </div>
                  </div>
                </div>

                {/* Firefox Adım 3 */}
                <div
                  style={{
                    background: 'var(--panel-2)',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    padding: 13,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start'
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 99,
                      background: '#ea580c',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 11,
                      flexShrink: 0
                    }}
                  >
                    3
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 12 }}>{t('firefoxStep3Title')}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>
                      {t('firefoxStep3Sub')}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Tarayıcı Desteği Rozetleri */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: 'var(--panel-3)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11
            }}
          >
            <span className="text-muted">{t('supportedBrowsers')}</span>
            <div style={{ display: 'flex', gap: 8, fontWeight: 700 }}>
              <span>🌐 Chrome</span>
              <span>🦊 Firefox</span>
              <span>🌊 Edge</span>
              <span>🦁 Brave</span>
              <span>⭕ Opera</span>
            </div>
          </div>
        </div>

        {/* Modal Alt Çubuk */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--panel-2)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10
          }}
        >
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{
              padding: '8px 20px',
              fontSize: 12,
              fontWeight: 700
            }}
          >
            {t('closeModal')}
          </button>
        </div>
      </div>
    </div>
  )
}
