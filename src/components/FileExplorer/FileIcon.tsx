export const CATEGORY_ICONS: Record<string, string> = {
  all: '📂',
  video: '🎬',
  audio: '🎵',
  document: '📄',
  archive: '📦',
  installer: '⚙️',
  other: '📁',
};

export function categoryIcon(category?: string): string {
  if (!category) return '📄';
  return CATEGORY_ICONS[category] || '📄';
}

export default function FileIcon({ category, size = 16 }: { category?: string; size?: number }) {
  return <span style={{ fontSize: size }}>{categoryIcon(category)}</span>;
}
