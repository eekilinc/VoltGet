export type ThemeMode = 'dark' | 'light'
export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'red' | 'teal'

export const ACCENTS: Record<AccentColor, { name: string; from: string; to: string; solid: string }> = {
  blue:   { name: 'Mavi',    from: '#2563eb', to: '#0ea5e9', solid: '#2563eb' },
  purple: { name: 'Mor',     from: '#7c3aed', to: '#c026d3', solid: '#8b5cf6' },
  green:  { name: 'Yeşil',   from: '#16a34a', to: '#22c55e', solid: '#22c55e' },
  orange: { name: 'Turuncu', from: '#ea580c', to: '#f59e0b', solid: '#f59e0b' },
  pink:   { name: 'Pembe',   from: '#db2777', to: '#f472b6', solid: '#ec4899' },
  red:    { name: 'Kırmızı', from: '#dc2626', to: '#f87171', solid: '#ef4444' },
  teal:   { name: 'Turkuaz', from: '#0d9488', to: '#22d3ee', solid: '#14b8a6' },
}

export function applyTheme(theme: ThemeMode, accent: AccentColor) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-accent', accent)
  const a = ACCENTS[accent] || ACCENTS.blue
  root.style.setProperty('--accent-from', a.from)
  root.style.setProperty('--accent-to', a.to)
  root.style.setProperty('--accent-solid', a.solid)
}
