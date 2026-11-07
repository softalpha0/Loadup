import { describe, it, expect, beforeEach } from 'vitest'
import * as Nimiq from '@nimiq/core'
import { setup } from './helpers'
import { orders, savedNumbers } from '../server/db/schema'
import { signedMessageDigest } from '../server/auth/nimiq-signature'

let t: Awaited<ReturnType<typeof setup>>
beforeEach(async () => { t = await setup() })

async function pay(order: any, token: string) {
  const r = await t.call('POST', '/dev/mock/pay', { bolt11: order.bolt11 })
  return t.call('POST', `/orders/${order.id}/paid`, { hash: r.body.hash, swapId: r.body.swapId }, token)
}

describe('auth', () => {
  it('signs in with a Nimiq signature and returns the derived address', async () => {
    const kp = Nimiq.KeyPair.generate()
    const { token, address } = await t.signIn(kp)
    expect(address).toBe(kp.toAddress().toUserFriendlyAddress())
    const me = await t.call('GET', '/me', undefined, token)
    expect(me.status).toBe(200)
    expect(me.body.address).toBe(address)
    expect(me.body.locale).toBe('es')
  })

  it('rejects a bad signature and nonce reuse', async () => {
    const kp = Nimiq.KeyPair.generate()
    const n = await t.call('POST', '/auth/nonce')
    const bad = Nimiq.Signature.create(kp.privateKey, kp.publicKey, signedMessageDigest('other message'))
    const r1 = await t.call('POST', '/auth/verify', { nonceId: n.body.nonceId, publicKey: kp.publicKey.toHex(), signature: bad.toHex() })
    expect(r1.status).toBe(401)
    const good = Nimiq.Signature.create(kp.privateKey, kp.publicKey, signedMessageDigest(n.body.message))
    const r2 = await t.call('POST', '/auth/verify', { nonceId: n.body.nonceId, publicKey: kp.publicKey.toHex(), signature: good.toHex() })
    expect(r2.status).toBe(200)
    const r3 = await t.call('POST', '/auth/verify', { nonceId: n.body.nonceId, publicKey: kp.publicKey.toHex(), signature: good.toHex() })
    expect(r3.status).toBe(400)
  })

  it('rejects requests without a valid token', async () => {
    expect((await t.call('GET', '/me')).status).toBe(401)
    expect((await t.call('GET', '/me', undefined, 'forged.token')).status).toBe(401)
  })
})

describe('phone check & catalogue', () => {
  it('detects the operator for 3 countries', async () => {
    const { token } = await t.signIn()
    for (const [phone, op] of [['+2348031234567', 'MTN Nigeria'], ['+254712345678', 'Safaricom'], ['+12025550123', 'AT&T']] as const) {
      const r = await t.call('POST', '/phone/check', { phone }, token)
      expect(r.status).toBe(200)
      expect(r.body.operator.name).toBe(op)
      expect(r.body.products.length).toBeGreaterThan(0)
      expect(r.body.masked).toMatch(/^\+\d+ ••• ••• \d{4}$/)
    }
  })

  it('accepts a national number with a country picker', async () => {
    const { token } = await t.signIn()
    const r = await t.call('POST', '/phone/check', { phone: '0803 123 4567', country: 'NG' }, token)
    expect(r.body.e164).toBe('+2348031234567')
  })

  it('rejects invalid numbers', async () => {
    const { token } = await t.signIn()
    const r = await t.call('POST', '/phone/check', { phone: '12' }, token)
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('INVALID_PHONE')
  })

  it('lists eSIMs and gift cards', async () => {
    const e = await t.call('GET', '/esims/products?country=JP')
    expect(e.body.products[0].packages[0].label).toBe('1GB, 7 Days')
    const g = await t.call('GET', '/products?type=giftcard&q=steam')
    expect(g.body.products[0].name).toBe('Steam')
  })
})

describe('orders', () => {
  it('airtime: create → pay → processing → delivered, with encrypted phone', async () => {
    const { token } = await t.signIn()
    const c = await t.call('POST', '/orders', { kind: 'airtime', productId: 'mtn-nigeria', packageId: 'mtn-nigeria-2000', phone: '+2348031234567' }, token)
    expect(c.status).toBe(201)
    const o = c.body.order
    expect(o.status).toBe('awaiting_payment')
    expect(o.bolt11).toMatch(/^lnbc/)
    expect(o.priceSats).toBeGreaterThan(0)
    expect(o.recipientMasked).toBe('+234 ••• ••• 4567')

    const [row] = await t.database.db.select().from(orders)
    expect(row.recipientPhoneEnc).not.toContain('803')
    expect(row.recipientPhoneEnc!.startsWith('v1:')).toBe(true)

    const p = await pay(o, token)
    expect(['paid', 'processing']).toContain(p.body.order.status)
    expect(p.body.order.bolt11).toBeNull() // never handed out again
    let g = await t.call('GET', `/orders/${o.id}`, undefined, token)
    for (let i = 0; i < 5 && g.body.order.status !== 'delivered'; i++) {
      await t.services.orders.sync((await t.services.orders.get(o.id))!)
      g = await t.call('GET', `/orders/${o.id}`, undefined, token)
    }
    expect(g.body.order.status).toBe('delivered')
    expect(g.body.order.redemption.message).toBeTruthy()
  })

  it('gift card returns a code; eSIM returns an LPA and can be topped up', async () => {
    const { token } = await t.signIn()
    const gc = (await t.call('POST', '/orders', { kind: 'giftcard', productId: 'steam-us', packageId: 'steam-us-10' }, token)).body.order
    await pay(gc, token)
    for (let i = 0; i < 3; i++) await t.services.orders.sync((await t.services.orders.get(gc.id))!)
    const g = await t.call('GET', `/orders/${gc.id}`, undefined, token)
    expect(g.body.order.redemption.code).toMatch(/^MOCK-/)

    const es = (await t.call('POST', '/orders', { kind: 'esim', productId: 'esim-jp', packageId: 'esim-jp-1gb-7d' }, token)).body.order
    await pay(es, token)
    for (let i = 0; i < 3; i++) await t.services.orders.sync((await t.services.orders.get(es.id))!)
    const e = await t.call('GET', `/orders/${es.id}`, undefined, token)
    expect(e.body.order.redemption.esim.lpa).toMatch(/^LPA:1\$/)
    const mine = await t.call('GET', '/esims', undefined, token)
    expect(mine.body.esims).toHaveLength(1)
    const esimId = mine.body.esims[0].esimId
    const top = await t.call('POST', '/orders', { kind: 'esim_topup', productId: 'esim-jp', packageId: 'esim-jp-5gb-30d', esimId }, token)
    expect(top.status).toBe(201)
    const other = await t.signIn()
    const stolen = await t.call('POST', '/orders', { kind: 'esim_topup', productId: 'esim-jp', packageId: 'esim-jp-5gb-30d', esimId }, other.token)
    expect(stolen.status).toBe(404)
  })

  it('failed delivery maps to failed', async () => {
    const { token } = await t.signIn()
    const o = (await t.call('POST', '/orders', { kind: 'airtime', productId: 'att-usa', packageId: 'att-usa-5', phone: '+12025550000' }, token)).body.order
    await pay(o, token)
    for (let i = 0; i < 3; i++) await t.services.orders.sync((await t.services.orders.get(o.id))!)
    const g = await t.call('GET', `/orders/${o.id}`, undefined, token)
    expect(g.body.order.status).toBe('failed')
  })

  it('refreshes an expired, unpaid invoice (A8)', async () => {
    const { token } = await t.signIn()
    const o = (await t.call('POST', '/orders', { kind: 'airtime', productId: 'att-usa', packageId: 'att-usa-5', phone: '+12025550123' }, token)).body.order
    await t.call('POST', `/dev/mock/expire/${o.id}`)
    const r = await t.call('POST', `/orders/${o.id}/refresh-invoice`, {}, token)
    expect(r.status).toBe(200)
    expect(r.body.order.bolt11).not.toBe(o.bolt11)
    expect(r.body.order.status).toBe('awaiting_payment')
  })

  it('never refreshes or re-exposes an invoice after an uncertain payment (A9)', async () => {
    const { token } = await t.signIn()
    const o = (await t.call('POST', '/orders', { kind: 'airtime', productId: 'att-usa', packageId: 'att-usa-5', phone: '+12025550123' }, token)).body.order
    const u = await t.call('POST', `/orders/${o.id}/paid`, { uncertain: true }, token)
    expect(u.body.order.paymentAttempted).toBe(true)
    expect(u.body.order.bolt11).toBeNull()
    await t.call('POST', `/dev/mock/expire/${o.id}`)
    const r = await t.call('POST', `/orders/${o.id}/refresh-invoice`, {}, token)
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('PAYMENT_ALREADY_SUBMITTED')
    // Provider says it was never paid → failed (not expired/refreshable)
    await t.services.orders.sync((await t.services.orders.get(o.id))!)
    const g = await t.call('GET', `/orders/${o.id}`, undefined, token)
    expect(g.body.order.status).toBe('failed')
    expect(g.body.order.failureReason).toBe('payment_not_received')
  })

  it('refuses refresh when the old invoice was actually paid', async () => {
    const { token } = await t.signIn()
    const o = (await t.call('POST', '/orders', { kind: 'airtime', productId: 'att-usa', packageId: 'att-usa-5', phone: '+12025550123' }, token)).body.order
    await t.call('POST', '/dev/mock/pay', { bolt11: o.bolt11 })
    const r = await t.call('POST', `/orders/${o.id}/refresh-invoice`, {}, token)
    expect(r.status).toBe(409)
  })

  it('hides orders from other users', async () => {
    const a = await t.signIn(), b = await t.signIn()
    const o = (await t.call('POST', '/orders', { kind: 'giftcard', productId: 'steam-us', packageId: 'steam-us-10' }, a.token)).body.order
    expect((await t.call('GET', `/orders/${o.id}`, undefined, b.token)).status).toBe(404)
    expect((await t.call('POST', `/orders/${o.id}/paid`, {}, b.token)).status).toBe(404)
  })

  it('reorder repeats a previous top-up without the client knowing the number', async () => {
    const { token } = await t.signIn()
    const o = (await t.call('POST', '/orders', { kind: 'airtime', productId: 'mtn-nigeria', packageId: 'mtn-nigeria-500', phone: '+2348031234567' }, token)).body.order
    const r = await t.call('POST', '/orders', { reorderOf: o.id }, token)
    expect(r.status).toBe(201)
    expect(r.body.order.recipientMasked).toBe(o.recipientMasked)
    expect(r.body.order.packageId).toBe('mtn-nigeria-500')
  })

  it('validates custom amounts against the range', async () => {
    const { token } = await t.signIn()
    const bad = await t.call('POST', '/orders', { kind: 'airtime', productId: 'mtn-nigeria', value: 10, phone: '+2348031234567' }, token)
    expect(bad.body.error).toBe('VALUE_OUT_OF_RANGE')
    const ok = await t.call('POST', '/orders', { kind: 'airtime', productId: 'mtn-nigeria', value: 1500, phone: '+2348031234567' }, token)
    expect(ok.status).toBe(201)
  })

  it('cron expires stale invoices and webhook triggers a re-fetch', async () => {
    const { token } = await t.signIn()
    const o = (await t.call('POST', '/orders', { kind: 'giftcard', productId: 'steam-us', packageId: 'steam-us-10' }, token)).body.order
    await t.call('POST', '/dev/mock/pay', { bolt11: o.bolt11 })
    const row = (await t.services.orders.get(o.id))!
    const wh = await t.call('POST', '/webhooks/bitrefill', { id: row.providerInvoiceId, status: 'complete' })
    expect(wh.status).toBe(200)
    const after = (await t.services.orders.get(o.id))!
    expect(['paid', 'processing']).toContain(after.status)
    expect(after.paymentAttemptedAt).not.toBeNull() // detected by provider even without client report

    const o2 = (await t.call('POST', '/orders', { kind: 'giftcard', productId: 'steam-us', packageId: 'steam-us-10' }, token)).body.order
    await t.call('POST', `/dev/mock/expire/${o2.id}`)
    await t.runCron()
    expect((await t.services.orders.get(o2.id))!.status).toBe('expired')
  })

  it('public receipt shows no personal data', async () => {
    const { token } = await t.signIn()
    const o = (await t.call('POST', '/orders', { kind: 'airtime', productId: 'mtn-nigeria', packageId: 'mtn-nigeria-500', phone: '+2348031234567' }, token)).body.order
    const r = await t.call('GET', `/receipts/${o.receiptToken}`)
    expect(r.status).toBe(200)
    expect(JSON.stringify(r.body)).not.toContain('8031234567')
    expect(JSON.stringify(r.body)).not.toContain('lnbc')
  })
})

describe('limits (A13)', () => {
  it('enforces the per-order limit', async () => {
    const { token } = await t.signIn()
    const r = await t.call('POST', '/orders', { kind: 'giftcard', productId: 'amazon-us', packageId: 'amazon-us-50' }, token)
    expect(r.status).toBe(201)
    const t2 = await setup({ LIMIT_PER_ORDER_USD: '20' })
    const u = await t2.signIn()
    const r2 = await t2.call('POST', '/orders', { kind: 'giftcard', productId: 'amazon-us', packageId: 'amazon-us-25' }, u.token)
    expect(r2.status).toBe(422)
    expect(r2.body.error).toBe('LIMIT_PER_ORDER')
  })

  it('enforces the per-day limit including open invoices', async () => {
    const t2 = await setup({ LIMIT_PER_DAY_USD: '60' })
    const { token } = await t2.signIn()
    const a = await t2.call('POST', '/orders', { kind: 'giftcard', productId: 'amazon-us', packageId: 'amazon-us-50' }, token)
    expect(a.status).toBe(201)
    const b = await t2.call('POST', '/orders', { kind: 'giftcard', productId: 'amazon-us', packageId: 'amazon-us-25' }, token)
    expect(b.status).toBe(422)
    expect(b.body.error).toBe('LIMIT_PER_DAY')
    // After the open invoice expires the budget is free again
    await t2.call('POST', `/dev/mock/expire/${a.body.order.id}`)
    const c = await t2.call('POST', '/orders', { kind: 'giftcard', productId: 'amazon-us', packageId: 'amazon-us-25' }, token)
    expect(c.status).toBe(201)
  })
})

describe('saved numbers & privacy (A12)', () => {
  it('stores numbers encrypted, masks them, uses them by id, deletes them', async () => {
    const { token } = await t.signIn()
    const s = await t.call('POST', '/saved-numbers', { nickname: 'Mum', phone: '+2348031234521' }, token)
    expect(s.status).toBe(201)
    expect(s.body.savedNumber.masked).toBe('+234 ••• ••• 4521')
    const [row] = await t.database.db.select().from(savedNumbers)
    expect(row.phoneEnc).not.toContain('8031234521')
    const chk = await t.call('POST', '/phone/check', { savedNumberId: s.body.savedNumber.id }, token)
    expect(chk.body.operator.name).toBe('MTN Nigeria')
    const o = await t.call('POST', '/orders', { kind: 'airtime', productId: 'mtn-nigeria', packageId: 'mtn-nigeria-500', savedNumberId: s.body.savedNumber.id }, token)
    expect(o.body.order.recipientMasked).toBe('+234 ••• ••• 4521')
    const other = await t.signIn()
    expect((await t.call('POST', '/phone/check', { savedNumberId: s.body.savedNumber.id }, other.token)).status).toBe(404)
    await t.call('DELETE', `/saved-numbers/${s.body.savedNumber.id}`, undefined, token)
    expect((await t.call('GET', '/saved-numbers', undefined, token)).body.savedNumbers).toHaveLength(0)
  })

  it('delete-my-data removes the user, numbers and personal order data', async () => {
    const { token } = await t.signIn()
    await t.call('POST', '/saved-numbers', { nickname: 'Me', phone: '+2348031234521' }, token)
    await t.call('POST', '/orders', { kind: 'airtime', productId: 'mtn-nigeria', packageId: 'mtn-nigeria-500', phone: '+2348031234567' }, token)
    const d = await t.call('DELETE', '/me', undefined, token)
    expect(d.status).toBe(200)
    expect((await t.call('GET', '/me', undefined, token)).status).toBe(401)
    expect(await t.database.db.select().from(savedNumbers)).toHaveLength(0)
    const [o] = await t.database.db.select().from(orders)
    expect(o.userId).toBeNull()
    expect(o.recipientPhoneEnc).toBeNull()
  })
})

describe('top-up requests (A11)', () => {
  it('requester creates a link; a second wallet pays it', async () => {
    const req = await t.signIn()
    const payer = await t.signIn()
    const c = await t.call('POST', '/requests', { kind: 'airtime', productId: 'mtn-nigeria', packageId: 'mtn-nigeria-1000', phone: '+2348031234567', note: 'Thanks!' }, req.token)
    expect(c.status).toBe(201)
    expect(c.body.url).toBe(`https://loadup.test/r/${c.body.request.code}`)
    const pub = await t.call('GET', `/requests/${c.body.request.code}`)
    expect(pub.body.request.recipientMasked).toBe('+234 ••• ••• 4567')
    expect(JSON.stringify(pub.body)).not.toContain('8031234567')
    const o = await t.call('POST', '/orders', { requestCode: c.body.request.code }, payer.token)
    expect(o.status).toBe(201)
    // Same payer again → same open order, no new invoice
    const again = await t.call('POST', '/orders', { requestCode: c.body.request.code }, payer.token)
    expect(again.body.order.id).toBe(o.body.order.id)
    await pay(o.body.order, payer.token)
    const after = await t.call('GET', `/requests/${c.body.request.code}`, undefined, req.token)
    expect(after.body.request.status).toBe('paid')
    expect(after.body.request.isRequester).toBe(true)
    const closed = await t.call('POST', '/orders', { requestCode: c.body.request.code }, payer.token)
    expect(closed.status).toBe(409)
  })
})

describe('health', () => {
  it('reports db and provider', async () => {
    const h = await t.call('GET', '/health')
    expect(h.status).toBe(200)
    expect(h.body.db).toBe('ok')
    expect(h.body.provider.configured).toBe(true)
  })
})
