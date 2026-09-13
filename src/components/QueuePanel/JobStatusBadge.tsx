import type { Job } from '../QueuePanel';

export function jobBadgeVars(
  status: Job['status'],
  deletedFromDisk?: boolean
): { bg: string; text: string; border: string } {
  if (status === 'done' && deletedFromDisk) {
    return {
      bg: 'var(--badge-danger-bg)',
      text: 'var(--badge-danger-text)',
      border: 'var(--badge-danger-border)',
    };
  }
  switch (status) {
    case 'done':
      return {
        bg: 'var(--badge-success-bg)',
        text: 'var(--badge-success-text)',
        border: 'var(--badge-success-border)',
      };
    case 'error':
      return {
        bg: 'var(--badge-danger-bg)',
        text: 'var(--badge-danger-text)',
        border: 'var(--badge-danger-border)',
      };
    case 'queued':
      return {
        bg: 'var(--badge-warning-bg)',
        text: 'var(--badge-warning-text)',
        border: 'var(--badge-warning-border)',
      };
    case 'paused':
      return {
        bg: 'var(--badge-info-bg)',
        text: 'var(--badge-info-text)',
        border: 'var(--badge-info-border)',
      };
    default:
      return {
        bg: 'color-mix(in srgb, var(--accent-solid) 16%, var(--panel-2))',
        text: 'var(--accent-solid)',
        border: 'var(--border)',
      };
  }
}

export default function JobStatusBadge({
  status,
  label,
  deletedFromDisk,
}: {
  status: Job['status'];
  label: string;
  deletedFromDisk?: boolean;
}) {
  const v = jobBadgeVars(status, deletedFromDisk);
  return (
    <span
      style={{
        background: v.bg,
        color: v.text,
        border: `1px solid ${v.border}`,
        padding: '2px 8px',
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}
