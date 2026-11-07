// Minimal BOLT11 reader: amount (sats), timestamp, expiry. No signature checks —
// the invoice comes from our own server and Nimiq Pay validates it again.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

export interface Bolt11Info {
  network: 'mainnet' | 'testnet' | 'signet' | 'regtest' | 'unknown'
  amountSats?: number
  timestamp: number
  expirySeconds: number
  expiresAt: number
}

function wordsToInt(words: number[]): number {
  return words.reduce((acc, w) => acc * 32 + w, 0)
}

export function decodeBolt11(invoice: string): Bolt11Info {
  const inv = invoice.trim().toLowerCase().replace(/^lightning:/, '')
  const sep = inv.lastIndexOf('1')
  if (sep < 4) throw new Error('Invalid BOLT11 invoice')
  const hrp = inv.slice(0, sep)
  const data = inv.slice(sep + 1)
  const words: number[] = []
  for (const ch of data) {
    const v = CHARSET.indexOf(ch)
    if (v < 0) throw new Error('Invalid BOLT11 character')
    words.push(v)
  }
  const body = words.slice(0, -6) // drop checksum

  const m = /^ln(bcrt|tbs|bc|tb)(\d+)?([munp])?$/.exec(hrp)
  if (!m) throw new Error('Invalid BOLT11 prefix')
  const network = ({ bc: 'mainnet', tb: 'testnet', tbs: 'signet', bcrt: 'regtest' } as const)[m[1] as 'bc'] ?? 'unknown'

  let amountSats: number | undefined
  if (m[2]) {
    const n = Number(m[2])
    const mult: Record<string, number> = { m: 1e5, u: 1e2, n: 1e-1, p: 1e-4 }
    amountSats = m[3] ? n * mult[m[3]] : n * 1e8
    amountSats = Math.ceil(amountSats)
  }

  const timestamp = wordsToInt(body.slice(0, 7))
  let expirySeconds = 3600
  let i = 7
  // tagged fields; the last 104 words are the signature
  const end = body.length - 104
  while (i + 3 <= end) {
    const tag = body[i]
    const len = body[i + 1] * 32 + body[i + 2]
    const fieldWords = body.slice(i + 3, i + 3 + len)
    if (CHARSET[tag] === 'x') expirySeconds = wordsToInt(fieldWords)
    i += 3 + len
  }
  return { network, amountSats, timestamp, expirySeconds, expiresAt: (timestamp + expirySeconds) * 1000 }
}
