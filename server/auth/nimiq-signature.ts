import { createHash } from 'node:crypto'
import * as Nimiq from '@nimiq/core'

/**
 * Nimiq signed-message format (Nimiq Hub / Keyguard / Nimiq Pay):
 *   sha256( "\x16Nimiq Signed Message:\n" + byteLength(message) + message )
 * signed with the account's Ed25519 key.
 */
export const SIGNED_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n'

export function signedMessageDigest(message: string): Uint8Array {
  const msgBytes = Buffer.from(message, 'utf8')
  const data = Buffer.concat([
    Buffer.from(SIGNED_MESSAGE_PREFIX, 'utf8'),
    Buffer.from(String(msgBytes.length), 'utf8'),
    msgBytes,
  ])
  return new Uint8Array(createHash('sha256').update(data).digest())
}

export function normalizeAddress(address: string): string {
  return address.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim()
}

export function addressFromPublicKey(publicKeyHex: string): string {
  const pk = Nimiq.PublicKey.fromHex(publicKeyHex.replace(/^0x/, ''))
  return normalizeAddress(pk.toAddress().toUserFriendlyAddress())
}

export interface VerifyResult {
  valid: boolean
  address?: string
}

/**
 * Verifies a signature returned by `nimiq.sign({ message })`.
 * Returns the address derived from the public key — that is the identity.
 */
export function verifySignedMessage(message: string, publicKeyHex: string, signatureHex: string): VerifyResult {
  try {
    const pk = Nimiq.PublicKey.fromHex(publicKeyHex.replace(/^0x/, ''))
    const sig = Nimiq.Signature.fromHex(signatureHex.replace(/^0x/, ''))
    const ok = pk.verify(sig, signedMessageDigest(message))
    if (!ok) return { valid: false }
    return { valid: true, address: normalizeAddress(pk.toAddress().toUserFriendlyAddress()) }
  } catch {
    return { valid: false }
  }
}
