import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { applyTheme, ThemeMode, AccentColor } from '../theme'
import { Lang, t as translate } from '../i18n'

type Ctx = {
  theme: ThemeMode
  accent: AccentColor
  lang: Lang
  setTheme: (t: ThemeMode) => void
  setAccent: (a: AccentColor) => void
  setLang: (l: Lang) => void
  t: (key: string) => string
}

const AppSettingsCtx = createContext<Ctx | null>(null)

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark')
  const [accent, setAccentState] = useState<AccentColor>('blue')
  const [lang, setLangState] = useState<Lang>('tr')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const api = (window as any).api
    if (api?.getConfig) {
      api.getConfig().then((cfg: any) => {
        const th = (cfg?.theme as ThemeMode) || 'dark'
        const ac = (cfg?.accentColor as AccentColor) || 'blue'
        const lg = (cfg?.language as Lang) || 'tr'
        setThemeState(th); setAccentState(ac); setLangState(lg)
        applyTheme(th, ac)
        setLoaded(true)
      }).catch(() => { applyTheme('dark', 'blue'); setLoaded(true) })
    } else {
      applyTheme('dark', 'blue'); setLoaded(true)
    }
  }, [])

  function persist(patch: any) {
    const api = (window as any).api
    if (api?.setConfig) api.setConfig(patch).catch(() => {})
  }

  function setTheme(th: ThemeMode) { setThemeState(th); applyTheme(th, accent); persist({ theme: th }) }
  function setAccent(ac: AccentColor) { setAccentState(ac); applyTheme(theme, ac); persist({ accentColor: ac }) }
  function setLang(lg: Lang) { setLangState(lg); persist({ language: lg }) }

  if (!loaded) return null

  return (
    <AppSettingsCtx.Provider value={{ theme, accent, lang, setTheme, setAccent, setLang, t: (k) => translate(lang, k) }}>
      {children}
    </AppSettingsCtx.Provider>
  )
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsCtx)
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider')
  return ctx
}
