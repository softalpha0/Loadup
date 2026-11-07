import type { Env } from '../env'
import { BitrefillProvider } from './bitrefill'
import { MockProvider } from './mock'
import type { TopupProvider } from './types'

export function createProvider(env: Env): TopupProvider {
  switch (env.TOPUP_PROVIDER) {
    case 'mock':
      return new MockProvider()
    case 'bitrefill':
    default:
      return new BitrefillProvider({
        baseUrl: env.BITREFILL_BASE_URL,
        apiKey: env.BITREFILL_API_KEY,
        apiId: env.BITREFILL_API_ID,
        apiSecret: env.BITREFILL_API_SECRET,
      })
  }
}
