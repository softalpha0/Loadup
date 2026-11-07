import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { DataCipher } from '../server/crypto'
import { issueToken, readToken } from '../server/auth/session'
import { maskPhone, parsePhone } from '../shared/phone'

const key = randomBytes(32).toString('base64')

describe('AES-256-GCM', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const c = new DataCipher(key)
    const a = c.encrypt('+2348031234567'), b = c.encrypt('+2348031234567')
    expect(a).not.toBe(b)
    expect(a.startsWith('v1:')).toBe(true)
    expect(c.decrypt(a)).toBe('+2348031234567')
    expect(c.decryptJson(c.encryptJson({ code: 'X' }))).toEqual({ code: 'X' })
  })
  it('detects tampering and wrong keys', () => {
    const c = new DataCipher(key)
    const enc = c.encrypt('secret')
    const buf = Buffer.from(enc.slice(3), 'base64'); buf[14] ^= 1
    expect(() => c.decrypt('v1:' + buf.toString('base64'))).toThrow()
    expect(() => new DataCipher(randomBytes(32).toString('base64')).decrypt(enc)).toThrow()
  })
  it('requires a 32-byte key', () => {
    expect(() => new DataCipher(randomBytes(16).toString('base64'))).toThrow()
  })
})

describe('session tokens', () => {
  it('verifies HMAC', () => {
    const t = issueToken('s'.repeat(32), 's_abc')
    expect(readToken('s'.repeat(32), t)).toBe('s_abc')
    expect(readToken('x'.repeat(32), t)).toBeNull()
    expect(readToken('s'.repeat(32), 's_abd.' + t.split('.')[1])).toBeNull()
  })
})

describe('phone helpers', () => {
  it('parses and masks', () => {
    const p = parsePhone('0803 123 4521', 'NG')!
    expect(p).toMatchObject({ e164: '+2348031234521', country: 'NG', callingCode: '234', last4: '4521' })
    expect(maskPhone(p.callingCode, p.last4)).toBe('+234 ••• ••• 4521')
    expect(maskPhone('+2348031234521', '4521')).toBe('+234 ••• ••• 4521')
    expect(parsePhone('123')).toBeNull()
  })
})
