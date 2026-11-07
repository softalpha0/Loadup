import { ApiError } from './api'
import type { WalletError } from './nimiq'

type TMaybe = (key: string, vars?: Record<string, string | number>) => string | undefined

export function errorText(e: unknown, tMaybe: TMaybe): string {
  if (e instanceof ApiError) {
    if (e.code === 'NETWORK') return tMaybe('errors.network')!
    if (e.code === 'LIMIT_PER_ORDER') return tMaybe('errors.LIMIT_PER_ORDER', { limit: e.details?.limitUsd ?? '' })!
    if (e.code === 'LIMIT_PER_DAY') return tMaybe('errors.LIMIT_PER_DAY', { remaining: Number(e.details?.remainingUsd ?? 0).toFixed(2) })!
    if (e.code === 'UNAUTHENTICATED') return tMaybe('errors.sessionExpired')!
    return tMaybe(`errors.${e.code}`) ?? e.message ?? tMaybe('errors.generic')!
  }
  const w = e as WalletError
  if (w && typeof w === 'object' && 'type' in w) return tMaybe(`errors.${w.type}`) ?? w.message ?? tMaybe('errors.generic')!
  return tMaybe('errors.generic')!
}
