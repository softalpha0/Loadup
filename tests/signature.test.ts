import { describe, it, expect } from 'vitest'
import * as Nimiq from '@nimiq/core'
import { verifySignedMessage, signedMessageDigest, addressFromPublicKey } from '../server/auth/nimiq-signature'

function signLikeNimiqPay(kp: Nimiq.KeyPair, message: string) {
  const sig = Nimiq.Signature.create(kp.privateKey, kp.publicKey, signedMessageDigest(message))
  return { publicKey: kp.publicKey.toHex(), signature: sig.toHex() }
}

describe('Nimiq signed message verification', () => {
  it('accepts a valid signature and derives the address', () => {
    const kp = Nimiq.KeyPair.generate()
    const msg = 'Sign in to Loadup\nNonce: abc'
    const { publicKey, signature } = signLikeNimiqPay(kp, msg)
    const res = verifySignedMessage(msg, publicKey, signature)
    expect(res.valid).toBe(true)
    expect(res.address).toBe(kp.toAddress().toUserFriendlyAddress())
    expect(addressFromPublicKey(publicKey)).toBe(res.address)
  })

  it('rejects a tampered message', () => {
    const kp = Nimiq.KeyPair.generate()
    const { publicKey, signature } = signLikeNimiqPay(kp, 'Nonce: abc')
    expect(verifySignedMessage('Nonce: abd', publicKey, signature).valid).toBe(false)
  })

  it('rejects a signature from another key', () => {
    const a = Nimiq.KeyPair.generate(), b = Nimiq.KeyPair.generate()
    const { signature } = signLikeNimiqPay(a, 'x')
    expect(verifySignedMessage('x', b.publicKey.toHex(), signature).valid).toBe(false)
  })

  it('rejects garbage input without throwing', () => {
    expect(verifySignedMessage('x', 'zz', 'yy').valid).toBe(false)
  })
})
