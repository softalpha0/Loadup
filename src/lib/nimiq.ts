import { init, NimiqProviderError, getHostNetwork, type NimiqProvider } from '@nimiq/mini-app-sdk'

let providerPromise: Promise<NimiqProvider> | null = null

/** True when the page runs inside Nimiq Pay (host context is seeded before page scripts). */
export function hasHostContext(): boolean {
  return typeof window !== 'undefined' && (typeof window.nimiqPay !== 'undefined' || typeof window.nimiq !== 'undefined')
}

export function getProvider(timeout = 10_000): Promise<NimiqProvider> {
  if (!providerPromise) {
    providerPromise = init({ timeout }).catch((e) => {
      providerPromise = null
      throw e
    })
  }
  return providerPromise
}

/** Resolves to 'host' inside Nimiq Pay and 'browser' elsewhere. */
export async function detectEnvironment(): Promise<'host' | 'browser'> {
  if (hasHostContext()) return 'host'
  try {
    await getProvider(1500)
    return 'host'
  } catch {
    return 'browser'
  }
}

export function hostNetwork(): 'mainnet' | 'testnet' | undefined {
  try { return getHostNetwork() } catch { return undefined }
}

export type WalletErrorType =
  | 'PERMISSION_DENIED' | 'INVALID_REQUEST' | 'INVALID_TRANSACTION' | 'DUPLICATE_PAYMENT'
  | 'TRANSACTION_OUTCOME_UNKNOWN' | 'NETWORK_ERROR' | 'UNSUPPORTED' | 'UNKNOWN_ERROR'

export interface WalletError {
  type: WalletErrorType
  message: string
  data?: { hash?: string; swapId?: string } & Record<string, unknown>
}

export function toWalletError(e: unknown): WalletError {
  if (NimiqProviderError.is(e)) {
    return { type: (e.type as WalletErrorType) ?? 'UNKNOWN_ERROR', message: e.message, data: (e.data ?? undefined) as WalletError['data'] }
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (/denied|reject|cancel/i.test(msg)) return { type: 'PERMISSION_DENIED', message: msg }
  if (/not a function|not supported|unsupported/i.test(msg)) return { type: 'UNSUPPORTED', message: msg }
  return { type: 'UNKNOWN_ERROR', message: msg }
}

/** Errors after which the invoice must never be paid again. */
export function isUncertainPayment(err: WalletError): boolean {
  return err.type === 'TRANSACTION_OUTCOME_UNKNOWN' || err.type === 'DUPLICATE_PAYMENT'
}

export async function signIn(message: string): Promise<{ address: string; publicKey: string; signature: string }> {
  const nimiq = await getProvider()
  const accounts = await nimiq.listAccounts()
  const sig = await nimiq.sign({ message })
  return { address: accounts[0], publicKey: sig.publicKey, signature: sig.signature }
}

export async function payInvoice(invoice: string): Promise<{ hash: string; swapId: string }> {
  const nimiq = await getProvider()
  if (typeof (nimiq as any).payLightningInvoice !== 'function') {
    throw new NimiqProviderError('UNSUPPORTED', 'payLightningInvoice is not available in this Nimiq Pay version')
  }
  return nimiq.payLightningInvoice({ invoice })
}

/** NIM balance in luna of the spendable HTLC (feature-detected; null when unavailable). */
export async function nimBalance(): Promise<number | null> {
  try {
    const nimiq = await getProvider()
    if (typeof window.nimiq?.getBalance !== 'function') return null
    const [, htlc] = await nimiq.listAccounts()
    if (!htlc) return 0
    return await nimiq.getBalance(htlc)
  } catch {
    return null
  }
}

// "Payment in flight" marker: if the app is killed while the Nimiq Pay dialog is open,
// we treat the order as possibly paid on the next visit instead of asking to pay again.
const FLIGHT = 'loadup:paying:'
export function markPaying(orderId: string, bolt11: string) {
  try { localStorage.setItem(FLIGHT + orderId, bolt11) } catch { /* ignore */ }
}
export function clearPaying(orderId: string) {
  try { localStorage.removeItem(FLIGHT + orderId) } catch { /* ignore */ }
}
export function wasPaying(orderId: string): string | null {
  try { return localStorage.getItem(FLIGHT + orderId) } catch { return null }
}

export const NIMIQ_PAY_IOS = import.meta.env.VITE_NIMIQ_PAY_IOS_URL || 'https://apps.apple.com/search?term=Nimiq%20Pay'
export const NIMIQ_PAY_ANDROID = import.meta.env.VITE_NIMIQ_PAY_ANDROID_URL || 'https://play.google.com/store/search?q=Nimiq%20Pay&c=apps'

export function deepLinks(url: string) {
  const u = new URL(url)
  const domainPath = u.host + (u.pathname === '/' ? '' : u.pathname)
  return {
    universal: `https://nimpay.app/miniapps/open/${domainPath}`,
    scheme: `nimiqpay://miniapp?url=${encodeURIComponent(u.toString())}`,
  }
}
