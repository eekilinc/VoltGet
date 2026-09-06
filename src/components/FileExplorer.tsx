import { useEffect, useState, useMemo } from 'react'
import { useAppSettings } from '../context/AppSettingsContext'
import { useToast } from '../context/ToastContext'

export interface DownloadedFile {
  name: string
  path: string
  relativePath: string
  folder: string
  size: number
  mtime: number
  ext: string
  category: 'video' | 'audio' | 'document' | 'archive' | 'installer' | 'other'
}

type CategoryType = 'all' | 'video' | 'audio' | 'document' | 'archive' | 'installer'
type SortType = 'date_desc' | 'date_asc' | 'size_desc' | 'size_asc' | 'name_asc'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function FileExplorer() {
  const { t } = useAppSettings()
  const toast = useToast()
  const [dir, setDir] = useState<string>('')
  const [files, setFiles] = useState<DownloadedFile[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [search, setSearch] = useState<string>('')
  const [category, setCategory] = useState<CategoryType>('all')
  const [sort, setSort] = useState<SortType>('date_desc')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [deleteConfirm, setDeleteConfirm] = useState<DownloadedFile | null>(null)

  const loadFiles = async () => {
    if (!window.api?.listFiles) return
    setLoading(true)
    try {
      const defaultDir = await window.api.getDefaultDir()
      setDir(defaultDir)
      const list = await window.api.listFiles(defaultDir)
      setFiles(list || [])
    } catch (err: any) {
      toast.error('Dosyalar yüklenirken hata oluştu: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [])

  const categoryIcons: Record<string, string> = {
    all: '📂',
    video: '🎬',
    audio: '🎵',
    document: '📄',
    archive: '📦',
    installer: '⚙️',
    other: '📁'
  }

  const filteredFiles = useMemo(() => {
    return files
      .filter(f => {
        if (category !== 'all' && f.category !== category) return false
        if (search.trim()) {
          const q = search.toLowerCase()
          return f.name.toLowerCase().includes(q) || f.folder.toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => {
        switch (sort) {
          case 'date_desc': return b.mtime - a.mtime
          case 'date_asc': return a.mtime - b.mtime
          case 'size_desc': return b.size - a.size
          case 'size_asc': return a.size - b.size
          case 'name_asc': return a.name.localeCompare(b.name)
          default: return 0
        }
      })
  }, [files, category, search, sort])

  const totalBytes = useMemo(() => {
    return filteredFiles.reduce((acc, f) => acc + f.size, 0)
  }, [filteredFiles])

  const handleOpenFile = async (file: DownloadedFile) => {
    try {
      await window.api.openFile(file.path)
      toast.info(`"${file.name}" açılıyor...`)
    } catch (e: any) {
      toast.error('Dosya açılamadı: ' + e.message)
    }
  }

  const handleShowInFolder = async (file: DownloadedFile) => {
    try {
      const ok = await window.api.showInFolder(file.path)
      if (ok) {
        toast.info('Klasörde gösterildi')
      } else {
        toast.warning('Dosya bulunamadı')
      }
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleDelete = async (file: DownloadedFile) => {
    try {
      const res = await window.api.deleteFile(file.path)
      if (res?.success) {
        setFiles(prev => prev.filter(f => f.path !== file.path))
        toast.success(`"${file.name}" silindi (Geri Dönüşüm Kutusuna taşındı)`)
      } else {
        toast.error('Silinemedi: ' + (res?.error || 'Bilinmeyen hata'))
      }
    } catch (e: any) {
      toast.error('Hata: ' + e.message)
    } finally {
      setDeleteConfirm(null)
    }
  }

  return (
    <div style={{ flex: 1, padding: 18, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Üst Başlık & İstatistik Paneli */}
      <div className="card-premium glow-accent" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="brand-gradient" style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20 }}>
              📁
            </span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{t('files')} - İndirilenler Gezgini</div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 2, wordBreak: 'break-all' }}>{dir}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={loadFiles}
              style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 10, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              🔄 Yenile
            </button>
            <button
              onClick={() => window.api.openFolder(dir)}
              className="brand-gradient"
              style={{ color: '#fff', border: 0, padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              📂 Klasörü Aç
            </button>
          </div>
        </div>

        {/* Bilgi Çubuğu */}
        <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
          <div>Toplam Gösterilen: <strong style={{ color: 'var(--text)' }}>{filteredFiles.length}</strong> dosya</div>
          <div>Toplam Boyut: <strong style={{ color: 'var(--accent-solid)' }}>{formatBytes(totalBytes)}</strong></div>
        </div>
      </div>

      {/* Arama, Kategori ve Sıralama Çubuğu */}
      <div className="card-premium" style={{ borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Arama Input */}
          <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Dosya adına göre ara..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 12 }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 14 }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Sıralama */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sırala:</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortType)}
              style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12, border: '1px solid var(--border)' }}
            >
              <option value="date_desc">Tarih (En Yeni)</option>
              <option value="date_asc">Tarih (En Eski)</option>
              <option value="size_desc">Boyut (En Büyük)</option>
              <option value="size_asc">Boyut (En Küçük)</option>
              <option value="name_asc">İsim (A-Z)</option>
            </select>
          </div>

          {/* Görünüm Modu */}
          <div style={{ display: 'flex', background: 'var(--panel-2)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                border: 0,
                padding: '6px 10px',
                borderRadius: 7,
                fontSize: 12,
                background: viewMode === 'grid' ? 'var(--accent-solid)' : 'transparent',
                color: viewMode === 'grid' ? '#fff' : 'var(--text)'
              }}
              title="Izgara Görünümü"
            >
              ⊞ Izgara
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                border: 0,
                padding: '6px 10px',
                borderRadius: 7,
                fontSize: 12,
                background: viewMode === 'list' ? 'var(--accent-solid)' : 'transparent',
                color: viewMode === 'list' ? '#fff' : 'var(--text)'
              }}
              title="Liste Görünümü"
            >
              ☰ Liste
            </button>
          </div>
        </div>

        {/* Kategori Butonları */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'Tümü' },
            { id: 'video', label: 'Videolar' },
            { id: 'audio', label: 'Müzik / Ses' },
            { id: 'document', label: 'Belgeler' },
            { id: 'archive', label: 'Arşivler' },
            { id: 'installer', label: 'Kurulumlar' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id as CategoryType)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid ' + (category === cat.id ? 'var(--accent-solid)' : 'var(--border)'),
                background: category === cat.id ? 'color-mix(in srgb, var(--accent-solid) 18%, var(--panel-2))' : 'var(--panel-2)',
                color: category === cat.id ? 'var(--text)' : 'var(--muted)'
              }}
            >
              <span>{categoryIcons[cat.id]}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dosyalar Alanı */}
      {loading ? (
        <div className="card-premium" style={{ padding: 40, textAlign: 'center', borderRadius: 16 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>İndirilen dosyalar taranıyor...</div>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="card-premium" style={{ padding: 48, textAlign: 'center', borderRadius: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Dosya bulunamadı</div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
            {search ? 'Arama kriterlerinize uygun dosya bulunamadı.' : 'Bu kategoride henüz indirilmiş bir dosya yok.'}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* Izgara (Grid) Görünümü */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filteredFiles.map(file => (
            <div
              key={file.path}
              className="card-premium"
              style={{
                borderRadius: 14,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                transition: 'transform 0.15s ease, border-color 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    flexShrink: 0
                  }}
                >
                  {categoryIcons[file.category] || '📄'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    title={file.name}
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--text)'
                    }}
                  >
                    {file.name}
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    <span>{formatBytes(file.size)}</span>
                    <span>•</span>
                    <span style={{ background: 'var(--panel-2)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                      {file.folder}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {formatDate(file.mtime)}
              </div>

              {/* Hızlı Butonlar */}
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => handleOpenFile(file)}
                  className="brand-gradient"
                  style={{ flex: 1, border: 0, padding: '7px 10px', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 800 }}
                >
                  ▶️ Aç / Oynat
                </button>
                <button
                  onClick={() => handleShowInFolder(file)}
                  title="Klasörde Göster"
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '7px 10px', borderRadius: 8, color: 'var(--text)', fontSize: 11 }}
                >
                  📂 Konum
                </button>
                <button
                  onClick={() => setDeleteConfirm(file)}
                  title="Sil (Çöp Kutusu)"
                  style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', padding: '7px 10px', borderRadius: 8, color: '#ef4444', fontSize: 11 }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Liste (Table) Görünümü */
        <div className="card-premium" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                  <th style={{ padding: '12px 14px' }}>Dosya Adı</th>
                  <th style={{ padding: '12px 14px' }}>Klasör</th>
                  <th style={{ padding: '12px 14px' }}>Boyut</th>
                  <th style={{ padding: '12px 14px' }}>Tarih</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map(file => (
                  <tr
                    key={file.path}
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <td style={{ padding: '10px 14px', maxWidth: 300 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{categoryIcons[file.category] || '📄'}</span>
                        <span title={file.name} style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{file.folder}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--accent-solid)', fontWeight: 600 }}>{formatBytes(file.size)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{formatDate(file.mtime)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          onClick={() => handleOpenFile(file)}
                          className="brand-gradient"
                          style={{ border: 0, padding: '5px 8px', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700 }}
                        >
                          Aç
                        </button>
                        <button
                          onClick={() => handleShowInFolder(file)}
                          style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '5px 8px', borderRadius: 6, color: 'var(--text)', fontSize: 11 }}
                        >
                          Konum
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(file)}
                          style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', padding: '5px 8px', borderRadius: 6, color: '#ef4444', fontSize: 11 }}
                        >
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Silme Onay Modalı */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999999,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(6px)'
        }}>
          <div
            className="card-premium"
            style={{
              width: 440,
              borderRadius: 16,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              border: '1px solid #ef4444',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ef4444', fontWeight: 900, fontSize: 15 }}>
              <span>🗑️</span> Dosyayı Sil
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              Bu dosyayı silmek istediğinizden emin misiniz? Dosya işletim sisteminin <strong>Geri Dönüşüm Kutusuna</strong> taşınacaktır.
            </div>
            <div style={{ background: 'var(--panel-2)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, wordBreak: 'break-all' }}>
              {deleteConfirm.name}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  flex: 1,
                  background: '#dc2626',
                  color: '#fff',
                  border: 0,
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 12
                }}
              >
                Evet, Çöp Kutusuna Taşı
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: '10px 16px',
                  borderRadius: 10,
                  fontSize: 12
                }}
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
