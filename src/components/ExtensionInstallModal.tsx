import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'

interface Props {
  isOpen: boolean
  onClose: () => void
  connected: boolean
}

export default function ExtensionInstallModal({ isOpen, onClose, connected }: Props) {
  const toast = useToast()
  const [zipping, setZipping] = useState(false)
  const [openingFolder, setOpeningFolder] = useState(false)
  const [copied, setCopied] = useState(false)

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
      const res = await window.api?.openExtensionFolder()
      if (res?.success) {
        toast.success('Eklenti klasörü Gezgin\'de açıldı')
      } else {
        toast.error(res?.error || 'Klasör açılamadı')
      }
    } catch (e: any) {
      toast.error('Hata: ' + (e?.message || e))
    }
    setOpeningFolder(false)
  }

  const handleExportZip = async () => {
    setZipping(true)
    try {
      const res = await window.api?.exportExtensionZip()
      if (res?.success) {
        toast.success('flexplorer-eklenti.zip oluşturuldu ve Gezgin\'de gösterildi')
      } else {
        toast.error('ZIP oluşturulamadı')
      }
    } catch (e: any) {
      toast.error('ZIP Hatası: ' + (e?.message || e))
    }
    setZipping(false)
  }

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.info(`${url} panoya kopyalandı!`)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(5, 7, 15, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="card-premium"
        style={{
          width: '100%',
          maxWidth: 620,
          borderRadius: 20,
          border: '1px solid color-mix(in srgb, var(--accent-solid) 35%, var(--border))',
          boxShadow: '0 25px 70px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
      >
        {/* Modal Başlık Çubuğu */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--panel-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🧩</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: '0.02em' }}>
                Flexplorer Tarayıcı Eklentisi
              </div>
              <div className="text-muted" style={{ fontSize: 11 }}>
                Chrome, Microsoft Edge, Brave, Opera ve Chromium tarayıcıları
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              width: 32,
              height: 32,
              borderRadius: 8,
              color: 'var(--muted)',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Modal İçeriği */}
        <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Canlı Bağlantı Durumu Kartı */}
          <div
            style={{
              padding: '14px 18px',
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
                width: 40,
                height: 40,
                borderRadius: 12,
                background: connected ? '#15803d' : '#854d0e',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                boxShadow: connected ? '0 0 20px rgba(34, 197, 94, 0.5)' : 'none'
              }}
            >
              {connected ? '✓' : '⚡'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: connected ? '#86efac' : '#fde047' }}>
                {connected ? '🟢 Eklenti Aktif ve Bağlı' : '⚪ Eklenti Henüz Bağlanmadı'}
              </div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2, color: 'var(--text)' }}>
                {connected
                  ? 'Flexplorer eklentisi tarayıcınız ile sorunsuz iletişim kuruyor. Sayfalardaki medya ve indirmeler IDM tarzı otomatik algılanacaktır.'
                  : 'Eklentiyi yüklemek için aşağıdaki 3 kolay adımı takip edin (yalnızca 15 saniye sürer).'}
              </div>
            </div>
          </div>

          {/* Hızlı Eylemler */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              onClick={handleOpenFolder}
              disabled={openingFolder}
              className="brand-gradient"
              style={{
                border: 0,
                padding: '12px 14px',
                borderRadius: 12,
                color: '#fff',
                fontWeight: 800,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 8px 24px color-mix(in srgb, var(--accent-solid) 35%, transparent)'
              }}
            >
              <span>📂</span>
              <span>{openingFolder ? 'Açılıyor...' : '1. Eklenti Klasörünü Aç'}</span>
            </button>

            <button
              onClick={handleExportZip}
              disabled={zipping}
              style={{
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                padding: '12px 14px',
                borderRadius: 12,
                color: 'var(--text)',
                fontWeight: 800,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-solid)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <span>📦</span>
              <span>{zipping ? 'Paketleniyor...' : 'ZIP Olarak Dışa Aktar'}</span>
            </button>
          </div>

          {/* 3 Adımlı Kurulum Rehberi */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🚀</span> Kolay 3 Adımda Yükleme Kılavuzu:
            </div>

            {/* Adım 1 */}
            <div
              style={{
                background: 'var(--panel-2)',
                borderRadius: 14,
                border: '1px solid var(--border)',
                padding: 14,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start'
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 99,
                  background: 'var(--accent-solid)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 12,
                  flexShrink: 0
                }}
              >
                1
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 12 }}>Tarayıcınızın Eklentiler Sayfasını Açın</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  Chrome veya Edge adres çubuğuna aşağıdaki adresi yapıştırıp Enter'a basın:
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleCopyUrl('chrome://extensions')}
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      padding: '6px 12px',
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
                      padding: '6px 12px',
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
                  {copied && (
                    <span style={{ fontSize: 11, color: '#22c55e', alignSelf: 'center', fontWeight: 700 }}>
                      ✓ Kopyalandı!
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Adım 2 */}
            <div
              style={{
                background: 'var(--panel-2)',
                borderRadius: 14,
                border: '1px solid var(--border)',
                padding: 14,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start'
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 99,
                  background: 'var(--accent-solid)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 12,
                  flexShrink: 0
                }}
              >
                2
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 12 }}>"Geliştirici Modu"nu Açın</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  Açılan Eklentiler sayfasının sağ üst köşesindeki <strong>"Geliştirici modu" (Developer mode)</strong> anahtarını aktif hale getirin.
                </div>
              </div>
            </div>

            {/* Adım 3 */}
            <div
              style={{
                background: 'var(--panel-2)',
                borderRadius: 14,
                border: '1px solid var(--border)',
                padding: 14,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start'
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 99,
                  background: 'var(--accent-solid)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 12,
                  flexShrink: 0
                }}
              >
                3
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 12 }}>"Paketlenmemiş Öğe Yükle" ile Klasörü Seçin</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  Sol üstte beliren <strong>"Paketlenmemiş öğe yükle" (Load unpacked)</strong> butonuna tıklayın ve yukarıdaki <strong>"Eklenti Klasörünü Aç"</strong> butonuyla açtığınız <code>extension</code> klasörünü seçin.
                </div>
              </div>
            </div>
          </div>

          {/* Tarayıcı Desteği Rozetleri */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: 'var(--panel-3)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11
            }}
          >
            <span className="text-muted">Desteklenen Tarayıcılar:</span>
            <div style={{ display: 'flex', gap: 8, fontWeight: 700 }}>
              <span>🌐 Chrome</span>
              <span>🌊 Edge</span>
              <span>🦁 Brave</span>
              <span>⭕ Opera</span>
            </div>
          </div>
        </div>

        {/* Modal Alt Çubuk */}
        <div
          style={{
            padding: '12px 22px',
            borderTop: '1px solid var(--border)',
            background: 'var(--panel-2)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              padding: '8px 18px',
              borderRadius: 10,
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Tamamlandı / Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
