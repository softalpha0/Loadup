import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { getHostLanguage } from '@nimiq/mini-app-sdk'
import en, { type Dict } from '../locales/en'
import es from '../locales/es'
import fr from '../locales/fr'
import pt from '../locales/pt'

export const LOCALES = { en, es, fr, pt } as const
export type Locale = keyof typeof LOCALES
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español', fr: 'Français', pt: 'Português' }

const STORAGE_KEY = 'loadup:locale'

function pick(raw?: string | null): Locale | undefined {
  const l = raw?.toLowerCase().slice(0, 2)
  return l && l in LOCALES ? (l as Locale) : undefined
}

export function initialLocale(): Locale {
  let stored: string | null = null
  try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* private mode */ }
  return pick(stored) ?? pick(getHostLanguage()) ?? pick(navigator.language) ?? 'en'
}

type Vars = Record<string, string | number>
type Leaf = string
/** Dot-path keys of the dictionary that resolve to strings */
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Leaf ? `${P}${K}` : T[K] extends readonly unknown[] ? never : Paths<T[K], `${P}${K}.`>
}[keyof T & string]
export type TKey = Paths<Dict>

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), dict)
}

export function interpolate(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '')) : s
}

interface I18n {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TKey, vars?: Vars) => string
  /** For dynamic keys (e.g. errors.<CODE>) — returns undefined when missing */
  tMaybe: (key: string, vars?: Vars) => string | undefined
  dict: Dict
}

const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ }
    document.documentElement.lang = l
  }, [])
  const value = useMemo<I18n>(() => {
    const dict = LOCALES[locale] as Dict
    const tMaybe = (key: string, vars?: Vars) => {
      const v = lookup(dict, key) ?? lookup(en, key)
      return typeof v === 'string' ? interpolate(v, vars) : undefined
    }
    return { locale, setLocale, dict, tMaybe, t: (key, vars) => tMaybe(key, vars) ?? key }
  }, [locale, setLocale])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  const v = useContext(Ctx)
  if (!v) throw new Error('I18nProvider missing')
  return v
}
