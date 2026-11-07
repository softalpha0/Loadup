import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from 'node:crypto'

const VERSION = 'v1'

export class DataCipher {
  private key: Buffer
  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64')
    if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (base64)')
    this.key = key
  }

  /** AES-256-GCM → "v1:<base64(iv | ciphertext | tag)>" */
  encrypt(plain: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${VERSION}:${Buffer.concat([iv, ct, tag]).toString('base64')}`
  }

  decrypt(payload: string): string {
    const [version, data] = payload.split(':')
    if (version !== VERSION || !data) throw new Error('Unsupported ciphertext')
    const buf = Buffer.from(data, 'base64')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(buf.length - 16)
    const ct = buf.subarray(12, buf.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  }

  encryptJson(v: unknown): string { return this.encrypt(JSON.stringify(v)) }
  decryptJson<T>(payload: string): T { return JSON.parse(this.decrypt(payload)) as T }
}

export function randomId(prefix = ''): string {
  return prefix + randomBytes(12).toString('base64url')
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function randomCode(len = 8): string {
  const bytes = randomBytes(len)
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

export function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
