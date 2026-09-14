import { useState } from 'react';
import { useAppSettings } from '../context/AppSettingsContext';
import { formatBytes } from '../utils/speed';

export interface ConflictInfo {
  conflictId: string;
  fileName: string;
  outPath: string;
  existingSize: number;
}

export default function FileConflictDialog({
  info,
  onResolve,
}: {
  info: ConflictInfo;
  onResolve: (decision: string, remember: boolean) => void;
}) {
  const { t } = useAppSettings();
  const [remember, setRemember] = useState(false);

  const btn = (label: string, primary?: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '9px 8px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    border: primary ? 0 : '1px solid var(--border)',
    background: primary ? 'var(--accent-solid)' : 'var(--panel-2)',
    color: primary ? '#fff' : 'var(--text)',
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--accent-solid)',
          borderRadius: 16,
          width: 440,
          maxWidth: '92vw',
          boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'var(--panel-2)',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            fontWeight: 900,
            fontSize: 14,
            color: 'var(--accent-solid)',
          }}
        >
          📄 {t('conflictTitle')}
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-all' }}>
            <div style={{ fontWeight: 800 }}>{info.fileName}</div>
            <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
              {info.outPath}
            </div>
            {info.existingSize > 0 && (
              <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {t('conflictExisting')}: {formatBytes(info.existingSize)}
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('conflictMessage')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btn(t('conflictResume'), true)} onClick={() => onResolve('resume', remember)}>
              ▶ {t('conflictResume')}
            </button>
            <button style={btn(t('conflictRename'))} onClick={() => onResolve('rename', remember)}>
              📝 {t('conflictRename')}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btn(t('conflictOverwrite'))} onClick={() => onResolve('overwrite', remember)}>
              ♻ {t('conflictOverwrite')}
            </button>
            <button style={btn(t('conflictSkip'))} onClick={() => onResolve('skip', remember)}>
              ⏭ {t('conflictSkip')}
            </button>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            {t('conflictRemember')}
          </label>
        </div>
      </div>
    </div>
  );
}
