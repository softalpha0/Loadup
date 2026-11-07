import * as Nimiq from '@nimiq/core'
import { createApp } from '../server/app'
import { createDatabase } from '../server/db/client'
import { loadEnv } from '../server/env'
import { MockProvider } from '../server/providers/mock'
import { signedMessageDigest } from '../server/auth/nimiq-signature'

export async function setup(envOverrides: Record<string, string> = {}) {
  const env = loadEnv({ NODE_ENV: 'test', TOPUP_PROVIDER: 'mock', PUBLIC_APP_URL: 'https://loadup.test', ...envOverrides })
  const database = createDatabase({ pgliteDir: 'memory' })
  await database.migrate()
  const provider = new MockProvider()
  const built = createApp({ env, database, provider, rate: async () => 100_000 })
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await built.app.request('/api' + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => null)
    return { status: res.status, body: json as any }
  }
  async function signIn(kp = Nimiq.KeyPair.generate()) {
    const n = await call('POST', '/auth/nonce')
    const sig = Nimiq.Signature.create(kp.privateKey, kp.publicKey, signedMessageDigest(n.body.message))
    const v = await call('POST', '/auth/verify', { nonceId: n.body.nonceId, publicKey: kp.publicKey.toHex(), signature: sig.toHex(), locale: 'es-MX' })
    if (v.status !== 200) throw new Error('sign-in failed: ' + JSON.stringify(v.body))
    return { token: v.body.token as string, address: v.body.address as string, kp }
  }
  return { env, database, provider, ...built, call, signIn }
}
