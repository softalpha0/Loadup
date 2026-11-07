import { hmac, safeEqual } from '../crypto'

/** Bearer token = "<sessionId>.<hmac(sessionId)>" — the session row is the source of truth. */
export function issueToken(secret: string, sessionId: string): string {
  return `${sessionId}.${hmac(secret, 'session:' + sessionId)}`
}

export function readToken(secret: string, token: string | undefined | null): string | null {
  if (!token) return null
  const idx = token.lastIndexOf('.')
  if (idx <= 0) return null
  const id = token.slice(0, idx)
  const mac = token.slice(idx + 1)
  return safeEqual(mac, hmac(secret, 'session:' + id)) ? id : null
}

export function signInMessage(nonce: string, domain: string, issuedAt: Date): string {
  return [
    'Sign in to Loadup',
    '',
    'This proves you own this wallet. It does not send a transaction or cost anything.',
    '',
    `Domain: ${domain}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt.toISOString()}`,
  ].join('\n')
}
