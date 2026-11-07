import { test as base, type Page, type BrowserContext } from '@playwright/test'
import * as Nimiq from '@nimiq/core'
import { signedMessageDigest } from '../server/auth/nimiq-signature'

export type PayMode = 'ok' | 'unknown' | 'denied' | 'duplicate'

export interface WalletOptions { language?: string; network?: 'mainnet' | 'testnet'; onboarded?: boolean }

/** Installs a fake Nimiq Pay host (window.nimiqPay + window.nimiq) backed by a real Ed25519 key. */
export async function installWallet(context: BrowserContext, opts: WalletOptions = {}) {
  const kp = Nimiq.KeyPair.generate()
  const address = kp.toAddress().toUserFriendlyAddress()
  await context.exposeFunction('__walletSign', (message: string) => {
    const sig = Nimiq.Signature.create(kp.privateKey, kp.publicKey, signedMessageDigest(message))
    return { publicKey: kp.publicKey.toHex(), signature: sig.toHex() }
  })
  await context.addInitScript(({ address, language, network, onboarded }) => {
    if (onboarded) localStorage.setItem('loadup:onboarded', '1')
    ;(window as any).__payMode = localStorage.getItem('e2e:payMode') ?? 'ok'
    ;(window as any).nimiqPay = {
      language, network, userFiat: 'USD',
      requestFullscreen: async () => {}, exitFullscreen: async () => {}, getFullscreen: async () => false,
      onFullscreenChange: () => () => {}, requestDeviceIdentifier: async () => 'x'.repeat(64),
    }
    const err = (type: string, message: string, data?: unknown) => ({ name: 'NimiqProviderError', type, message, code: 4000, data })
    ;(window as any).nimiq = {
      on() { return this }, once() { return this },
      listAccounts: async () => [address, 'NQ00 HTLC 0000 0000 0000 0000 0000 0000 0000'],
      getBalance: async () => 123_456_789,
      sign: async (m: any) => (window as any).__walletSign(typeof m === 'string' ? m : m.message),
      payLightningInvoice: async ({ invoice }: { invoice: string }) => {
        ;(window as any).__payCalls = ((window as any).__payCalls ?? 0) + 1
        const mode = localStorage.getItem('e2e:payMode') ?? 'ok'
        if (mode === 'denied') throw err('PERMISSION_DENIED', 'User denied')
        const res = await fetch('/api/dev/mock/pay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bolt11: invoice }) }).then((r) => r.json())
        if (mode === 'unknown') throw err('TRANSACTION_OUTCOME_UNKNOWN', 'Outcome unknown', { hash: res.hash, swapId: res.swapId })
        if (mode === 'duplicate') throw err('DUPLICATE_PAYMENT', 'Duplicate', { hash: res.hash, swapId: res.swapId })
        return { hash: res.hash, swapId: res.swapId }
      },
    }
  }, { address, language: opts.language ?? 'en', network: opts.network ?? 'mainnet', onboarded: opts.onboarded ?? true })
  return { address }
}

export async function setPayMode(page: Page, mode: PayMode) {
  await page.evaluate((m) => localStorage.setItem('e2e:payMode', m), mode)
}

export async function signIn(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in with Nimiq Pay' }).click()
  await page.getByText('What do you need today?').waitFor()
}

export const test = base
export { expect } from '@playwright/test'
