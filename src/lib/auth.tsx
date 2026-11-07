import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from './api'
import { signIn as walletSignIn } from './nimiq'
import type { OrderDTO, SavedNumberDTO, AppConfig } from '../../shared/types'
import { useI18n } from './i18n'

export interface Me {
  address: string
  locale: string | null
  savedNumbers: SavedNumberDTO[]
  recentOrders: OrderDTO[]
  limits: { perOrderUsd: number; perDayUsd: number; usedTodayUsd: number }
}

interface AuthState {
  ready: boolean
  me: Me | null
  config: AppConfig | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [ready, setReady] = useState(false)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const { locale, setLocale } = useI18n()

  const refresh = useCallback(async () => {
    if (!getToken()) { setMe(null); return }
    try { setMe(await api<Me>('/me')) } catch { setMe(null) }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => { setToken(null); setMe(null) })
    api<AppConfig>('/config', { auth: false }).then(setConfig).catch(() => undefined)
    refresh().finally(() => setReady(true))
  }, [refresh])

  const signIn = useCallback(async () => {
    const { nonceId, message } = await api<{ nonceId: string; message: string }>('/auth/nonce', { method: 'POST', auth: false })
    const sig = await walletSignIn(message)
    const res = await api<{ token: string; locale: string | null }>('/auth/verify', {
      auth: false, body: { nonceId, publicKey: sig.publicKey, signature: sig.signature, address: sig.address, locale },
    })
    setToken(res.token)
    if (res.locale && res.locale !== locale && ['en', 'es', 'fr', 'pt'].includes(res.locale)) setLocale(res.locale as never)
    await refresh()
  }, [locale, refresh, setLocale])

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setToken(null)
    setMe(null)
  }, [])

  const value = useMemo(() => ({ ready, me, config, signIn, signOut, refresh }), [ready, me, config, signIn, signOut, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('AuthProvider missing')
  return v
}
