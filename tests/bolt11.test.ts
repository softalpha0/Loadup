import { describe, it, expect } from 'vitest'
import { decodeBolt11 } from '../shared/bolt11'
import { fakeBolt11 } from '../server/providers/mock'

describe('BOLT11 decoding', () => {
  it('decodes a real mainnet invoice (BOLT11 spec example)', () => {
    // "Please send $3 for a cup of coffee" — 2500u, timestamp 1496314658, expiry 60s
    const inv = 'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygqpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh'
    const d = decodeBolt11(inv)
    expect(d.network).toBe('mainnet')
    expect(d.amountSats).toBe(250_000)
    expect(d.timestamp).toBe(1496314658)
    expect(d.expirySeconds).toBe(60)
  })

  it('defaults expiry to 3600s and handles no-amount invoices', () => {
    const inv = 'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap9us6v52vjjsrvywa6rt52cm9r9zqt8r2t7mlcwspyetp5h2tztugp9lfyql'
    const d = decodeBolt11(inv)
    expect(d.amountSats).toBeUndefined()
    expect(d.expirySeconds).toBe(3600)
  })

  it('round-trips the mock encoder', () => {
    const inv = fakeBolt11(12345, 900, 1_800_000_000)
    const d = decodeBolt11(inv)
    expect(d.amountSats).toBe(12345)
    expect(d.expirySeconds).toBe(900)
    expect(d.expiresAt).toBe((1_800_000_000 + 900) * 1000)
  })

  it('rejects junk', () => {
    expect(() => decodeBolt11('hello')).toThrow()
  })
})
