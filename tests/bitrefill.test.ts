import { describe, it, expect } from 'vitest'
import { BitrefillProvider } from '../server/providers/bitrefill'
import { ProviderError } from '../server/providers/types'
import * as fx from './fixtures/bitrefill'

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { method: string; url: URL; headers: Record<string, string>; body?: any }[] = []
  const fn = (async (input: any, init?: any) => {
    const url = new URL(String(input))
    calls.push({ method: init?.method ?? 'GET', url, headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : undefined })
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    const r = routes[key]
    if (!r) return new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  }) as typeof fetch
  return { fn, calls }
}

const base = 'https://api.bitrefill.test/v2'

describe('Bitrefill adapter', () => {
  it('uses Bearer for personal keys and Basic for business credentials', async () => {
    const f = fakeFetch({ 'GET /v2/products/mtn-nigeria': { body: fx.productMtn } })
    await new BitrefillProvider({ baseUrl: base, apiKey: 'k1', fetch: f.fn }).getProduct('mtn-nigeria')
    expect(f.calls[0].headers.Authorization).toBe('Bearer k1')
    const g = fakeFetch({ 'GET /v2/products/mtn-nigeria': { body: fx.productMtn } })
    await new BitrefillProvider({ baseUrl: base, apiId: 'id', apiSecret: 'sec', fetch: g.fn }).getProduct('mtn-nigeria')
    expect(g.calls[0].headers.Authorization).toBe('Basic ' + Buffer.from('id:sec').toString('base64'))
  })

  it('reports not configured without credentials', async () => {
    const p = new BitrefillProvider({ baseUrl: base })
    expect(p.configured()).toBe(false)
    await expect(p.getProduct('x')).rejects.toBeInstanceOf(ProviderError)
  })

  it('normalises products, packages and ranges', async () => {
    const f = fakeFetch({ 'GET /v2/products/mtn-nigeria': { body: fx.productMtn } })
    const p = await new BitrefillProvider({ baseUrl: base, apiKey: 'k', fetch: f.fn }).getProduct('mtn-nigeria')
    expect(p).toMatchObject({ id: 'mtn-nigeria', type: 'airtime', country: 'NG', currency: 'NGN', recipientType: 'phone', range: { min: 50, max: 50000, step: 1 } })
    expect(p.packages[1]).toMatchObject({ id: 'mtn-nigeria<&>2000', value: 2000, label: '₦2,000', priceUsd: 1.33 })
  })

  it('normalises eSIM plans (data + days)', async () => {
    const f = fakeFetch({ 'GET /v2/products/esims': { body: fx.esimJapan } })
    const [p] = await new BitrefillProvider({ baseUrl: base, apiKey: 'k', fetch: f.fn }).listEsims({ country: 'jp' })
    expect(p.type).toBe('esim')
    expect(p.packages[0]).toMatchObject({ label: '1GB, 7 Days', dataGb: 1, days: 7, priceUsd: 4.5 })
    expect(f.calls[0].url.searchParams.get('country')).toBe('JP')
  })

  it('creates a Lightning invoice with the right body and reads BOLT11 amount/expiry', async () => {
    const f = fakeFetch({ 'POST /v2/invoices': { body: fx.invoiceUnpaid } })
    const inv = await new BitrefillProvider({ baseUrl: base, apiKey: 'k', fetch: f.fn }).createInvoice({
      kind: 'airtime', productId: 'mtn-nigeria', packageId: 'mtn-nigeria<&>2000', phone: '+2348031234567', webhookUrl: 'https://app/api/webhooks/bitrefill',
    })
    expect(f.calls[0].body).toEqual({
      payment_method: 'lightning', auto_pay: false, webhook_url: 'https://app/api/webhooks/bitrefill',
      products: [{ product_id: 'mtn-nigeria', quantity: 1, package_id: 'mtn-nigeria<&>2000', phone_number: '2348031234567' }],
    })
    expect(inv).toMatchObject({ id: 'inv_123', status: 'unpaid', bolt11: fx.BOLT11, priceSats: 250_000, priceUsd: 1.33 })
    expect(inv.expiresAt!.getTime()).toBe((1496314658 + 60) * 1000)
    expect(inv.orders[0]).toEqual({ id: 'ord_9', status: 'created' })
  })

  it('uses POST /esims for eSIM top-ups with esim_id', async () => {
    const f = fakeFetch({ 'POST /v2/esims': { body: fx.invoiceUnpaid } })
    await new BitrefillProvider({ baseUrl: base, apiKey: 'k', fetch: f.fn }).createInvoice({ kind: 'esim_topup', productId: 'esim-japan', packageId: 'jp-1gb-7d', esimId: 'esim_1' })
    expect(f.calls[0].body).toMatchObject({ product_id: 'esim-japan', package_id: 'jp-1gb-7d', esim_id: 'esim_1', payment_method: 'lightning' })
  })

  it('falls back to /invoices for new eSIMs when /esims is not available', async () => {
    const f = fakeFetch({ 'POST /v2/invoices': { body: fx.invoiceUnpaid } })
    const inv = await new BitrefillProvider({ baseUrl: base, apiKey: 'k', fetch: f.fn }).createInvoice({ kind: 'esim', productId: 'esim-japan', packageId: 'jp-1gb-7d' })
    expect(inv.id).toBe('inv_123')
    expect(f.calls.map((c) => c.url.pathname)).toEqual(['/v2/esims', '/v2/invoices'])
  })

  it('reads gift card and eSIM redemption info', async () => {
    const f = fakeFetch({ 'GET /v2/orders/ord_9': { body: fx.orderGiftcard }, 'GET /v2/orders/ord_10': { body: fx.orderEsim } })
    const p = new BitrefillProvider({ baseUrl: base, apiKey: 'k', fetch: f.fn })
    expect((await p.getOrder('ord_9')).redemption).toEqual({ code: 'ABCD-EFGH', pin: '9876', link: 'https://redeem.example/x', instructions: 'Use at checkout' })
    const e = await p.getOrder('ord_10')
    expect(e.redemption?.esim).toMatchObject({ iccid: '8988000000000000001', esimId: 'esim_1', lpa: 'LPA:1$rsp.example.com$XYZ123' })
  })

  it('checks a phone number and loads operator products', async () => {
    const f = fakeFetch({ 'GET /v2/check_phone_number': { body: fx.phoneCheck }, 'GET /v2/products/mtn-nigeria': { body: fx.productMtn } })
    const r = await new BitrefillProvider({ baseUrl: base, apiKey: 'k', fetch: f.fn }).checkPhone('+2348031234567', 'NG')
    expect(r.operator).toMatchObject({ id: 'mtn-nigeria', name: 'MTN Nigeria' })
    expect(r.products).toHaveLength(1)
    expect(f.calls[0].url.searchParams.get('phone_number')).toBe('2348031234567')
  })

  it('maps HTTP errors to provider error codes', async () => {
    const f = fakeFetch({ 'GET /v2/invoices/x': { status: 401, body: { message: 'bad key' } } })
    await expect(new BitrefillProvider({ baseUrl: base, apiKey: 'k', fetch: f.fn }).getInvoice('x')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('caches catalogue calls', async () => {
    const f = fakeFetch({ 'GET /v2/products/mtn-nigeria': { body: fx.productMtn } })
    const p = new BitrefillProvider({ baseUrl: base, apiKey: 'k', fetch: f.fn })
    await p.getProduct('mtn-nigeria'); await p.getProduct('mtn-nigeria')
    expect(f.calls).toHaveLength(1)
  })
})
