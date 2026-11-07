// Deterministic in-memory provider for local development and automated tests ONLY.
// loadEnv() refuses to start a production server with TOPUP_PROVIDER=mock.
import { randomBytes } from 'node:crypto'
import { formatMoney } from './normalize'
import type { PhoneCheckResult, Product, ProductType } from '../../shared/types'
import { ProviderError, type CreateInvoiceInput, type ProviderInvoice, type ProviderOrder, type TopupProvider } from './types'
import type { ProviderInvoiceStatus, ProviderOrderStatus } from '../../shared/status'

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
function polymod(values: number[]): number {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const b = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= G[i]
  }
  return chk
}
function hrpExpand(hrp: string): number[] {
  return [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)]
}
function intToWords(n: number, len: number): number[] {
  const out: number[] = []
  for (let i = len - 1; i >= 0; i--) out.push(Math.floor(n / 32 ** i) % 32)
  return out
}
/** Syntactically valid (unsigned) BOLT11 for tests — cannot be paid by anyone. */
export function fakeBolt11(amountSats: number, expirySeconds: number, timestamp = Math.floor(Date.now() / 1000)): string {
  const hrp = `lnbc${amountSats * 10}n`
  const words: number[] = [...intToWords(timestamp, 7)]
  const xLen = Math.max(1, Math.ceil(Math.log2(expirySeconds + 1) / 5))
  words.push(CHARSET.indexOf('x'), Math.floor(xLen / 32), xLen % 32, ...intToWords(expirySeconds, xLen))
  // payment hash 'p' (52 words)
  words.push(CHARSET.indexOf('p'), 1, 20, ...[...randomBytes(52)].map((b) => b % 32))
  words.push(...[...randomBytes(104)].map((b) => b % 32)) // fake signature
  const mod = polymod([...hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ 1
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >> (5 * (5 - i))) & 31)
  return hrp + '1' + [...words, ...checksum].map((w) => CHARSET[w]).join('')
}

const SATS_PER_USD = 1000 // fixed fake rate (1 BTC = 100k USD)

const OPERATORS: Record<string, { id: string; name: string; prefix: string[] }[]> = {
  NG: [{ id: 'mtn-nigeria', name: 'MTN Nigeria', prefix: ['803', '806', '703', '706', '813', '816', '810', '814', '903', '906'] },
       { id: 'airtel-nigeria', name: 'Airtel Nigeria', prefix: ['802', '808', '708', '812', '701', '902', '901', '907'] }],
  KE: [{ id: 'safaricom-kenya', name: 'Safaricom', prefix: ['7'] }],
  US: [{ id: 'att-usa', name: 'AT&T', prefix: [''] }],
  MX: [{ id: 'telcel-mexico', name: 'Telcel', prefix: [''] }],
  BR: [{ id: 'claro-brazil', name: 'Claro Brasil', prefix: [''] }],
  GH: [{ id: 'mtn-ghana', name: 'MTN Ghana', prefix: [''] }],
}
const CURRENCY: Record<string, { cur: string; usd: number }> = {
  NG: { cur: 'NGN', usd: 1 / 1600 }, KE: { cur: 'KES', usd: 1 / 130 }, US: { cur: 'USD', usd: 1 },
  MX: { cur: 'MXN', usd: 1 / 18 }, BR: { cur: 'BRL', usd: 1 / 5.5 }, GH: { cur: 'GHS', usd: 1 / 15 },
}

function buildCatalog(): Product[] {
  const out: Product[] = []
  for (const [country, ops] of Object.entries(OPERATORS)) {
    const { cur, usd } = CURRENCY[country]
    for (const op of ops) {
      const values = cur === 'USD' ? [5, 10, 20] : cur === 'NGN' ? [500, 1000, 2000, 5000] : cur === 'KES' ? [100, 250, 500, 1000] : [50, 100, 200]
      out.push({
        id: op.id, name: op.name, type: 'airtime', country, currency: cur, recipientType: 'phone',
        packages: values.map((v) => ({ id: `${op.id}-${v}`, value: v, label: formatMoney(v, cur), priceUsd: +(v * usd * 1.03).toFixed(2) })),
        range: { min: values[0], max: values[values.length - 1] * 4, step: 1 },
      })
      out.push({
        id: `${op.id}-data`, name: `${op.name} Data`, type: 'data', country, currency: cur, recipientType: 'phone',
        packages: [
          { id: `${op.id}-data-1gb`, value: 1, label: '1GB, 7 Days', dataGb: 1, days: 7, priceUsd: 1.5 },
          { id: `${op.id}-data-5gb`, value: 5, label: '5GB, 30 Days', dataGb: 5, days: 30, priceUsd: 5 },
        ],
      })
    }
  }
  for (const [country, name] of [['JP', 'Japan'], ['US', 'United States'], ['FR', 'France'], ['TH', 'Thailand'], ['BR', 'Brazil'], ['NG', 'Nigeria']] as const) {
    out.push({
      id: `esim-${country.toLowerCase()}`, name: `${name} eSIM`, type: 'esim', country, currency: 'USD', recipientType: 'none',
      packages: [
        { id: `esim-${country.toLowerCase()}-1gb-7d`, value: 4.5, label: '1GB, 7 Days', dataGb: 1, days: 7, priceUsd: 4.5 },
        { id: `esim-${country.toLowerCase()}-5gb-30d`, value: 14, label: '5GB, 30 Days', dataGb: 5, days: 30, priceUsd: 14 },
        { id: `esim-${country.toLowerCase()}-20gb-30d`, value: 34, label: '20GB, 30 Days', dataGb: 20, days: 30, priceUsd: 34 },
      ],
    })
  }
  for (const [id, name, country] of [['amazon-us', 'Amazon.com', 'US'], ['steam-us', 'Steam', 'US'], ['jumia-ng', 'Jumia', 'NG'], ['netflix-br', 'Netflix', 'BR'], ['spotify-mx', 'Spotify', 'MX']] as const) {
    const cur = CURRENCY[country]?.cur ?? 'USD'
    const usd = CURRENCY[country]?.usd ?? 1
    const values = cur === 'USD' ? [10, 25, 50] : cur === 'NGN' ? [5000, 10000, 20000] : [100, 200, 500]
    out.push({
      id, name, type: 'giftcard', country, currency: cur, recipientType: 'none',
      packages: values.map((v) => ({ id: `${id}-${v}`, value: v, label: formatMoney(v, cur), priceUsd: +(v * usd).toFixed(2) })),
    })
  }
  return out
}

interface MockInvoice {
  id: string
  status: ProviderInvoiceStatus
  bolt11: string
  expiresAt: Date
  priceSats: number
  priceUsd: number
  orderId: string
  orderStatus: ProviderOrderStatus
  input: CreateInvoiceInput
  syncsSincePaid: number
}

export class MockProvider implements TopupProvider {
  readonly name = 'mock'
  readonly catalog = buildCatalog()
  readonly invoices = new Map<string, MockInvoice>()
  /** Lightning invoice lifetime for new invoices */
  invoiceTtlSeconds = 600
  /** Fail delivery when the recipient phone ends with these digits */
  failSuffix = '0000'

  configured() { return true }
  async health() { return { ok: true, detail: 'mock provider (development only)' } }

  async checkPhone(e164: string, country: string): Promise<PhoneCheckResult> {
    const ops = OPERATORS[country]
    if (!ops) return { e164, country, products: [] }
    const national = e164.replace(/^\+\d{1,3}/, '')
    const op = ops.find((o) => o.prefix.some((p) => national.startsWith(p))) ?? ops[0]
    return {
      e164, country,
      operator: { id: op.id, name: op.name },
      products: this.catalog.filter((p) => p.id === op.id || p.id === `${op.id}-data`),
    }
  }

  async listProducts(q: { type?: ProductType; country?: string; query?: string }) {
    const query = q.query?.toLowerCase()
    return this.catalog.filter((p) =>
      (!q.type || p.type === q.type) &&
      (!q.country || p.country === q.country.toUpperCase()) &&
      (!query || p.name.toLowerCase().includes(query)))
  }

  async getProduct(id: string) {
    const p = this.catalog.find((x) => x.id === id)
    if (!p) throw new ProviderError('NOT_FOUND', 'Product not found', 404)
    return p
  }

  async listEsims(q: { country?: string; query?: string }) {
    const query = q.query?.toLowerCase()
    return this.catalog.filter((p) => p.type === 'esim' &&
      (!q.country || p.country === q.country.toUpperCase()) &&
      (!query || p.name.toLowerCase().includes(query) || p.country.toLowerCase() === query))
  }

  async createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoice> {
    const product = await this.getProduct(input.productId)
    let usd: number
    if (input.packageId) {
      const pk = product.packages.find((p) => p.id === input.packageId)
      if (!pk) throw new ProviderError('BAD_REQUEST', 'Unknown package')
      usd = pk.priceUsd ?? pk.value
    } else if (input.value !== undefined && product.range) {
      if (input.value < product.range.min || input.value > product.range.max) throw new ProviderError('BAD_REQUEST', 'Value out of range')
      const rate = (product.packages[0]?.priceUsd ?? 1) / (product.packages[0]?.value || 1)
      usd = +(input.value * rate).toFixed(2)
    } else throw new ProviderError('BAD_REQUEST', 'package_id or value required')
    const priceSats = Math.max(1, Math.round(usd * SATS_PER_USD))
    const id = 'inv_' + randomBytes(8).toString('hex')
    const inv: MockInvoice = {
      id, status: 'unpaid', bolt11: fakeBolt11(priceSats, this.invoiceTtlSeconds),
      expiresAt: new Date(Date.now() + this.invoiceTtlSeconds * 1000),
      priceSats, priceUsd: usd, orderId: 'ord_' + randomBytes(8).toString('hex'), orderStatus: 'created', input, syncsSincePaid: 0,
    }
    this.invoices.set(id, inv)
    return this.view(inv)
  }

  private view(inv: MockInvoice): ProviderInvoice {
    return { id: inv.id, status: inv.status, bolt11: inv.bolt11, expiresAt: inv.expiresAt, priceSats: inv.priceSats, priceUsd: inv.priceUsd, orders: [{ id: inv.orderId, status: inv.orderStatus }] }
  }

  /** Test/dev hook: pretend the Lightning invoice was paid. */
  simulatePayment(invoiceId: string) {
    const inv = this.invoices.get(invoiceId)
    if (!inv) throw new ProviderError('NOT_FOUND', 'Invoice not found', 404)
    if (inv.status !== 'unpaid') return false
    if (inv.expiresAt.getTime() < Date.now()) return false
    inv.status = 'payment_detected'
    inv.orderStatus = 'payment_detected'
    return true
  }

  /** Test hook: force-expire an invoice */
  expire(invoiceId: string) {
    const inv = this.invoices.get(invoiceId)
    if (inv) inv.expiresAt = new Date(Date.now() - 1000)
  }

  async getInvoice(id: string): Promise<ProviderInvoice> {
    const inv = this.invoices.get(id)
    if (!inv) throw new ProviderError('NOT_FOUND', 'Invoice not found', 404)
    if (inv.status === 'unpaid' && inv.expiresAt.getTime() < Date.now()) inv.status = 'expired'
    // Progress: payment_detected → pending/processing → complete/delivered
    if (inv.status === 'payment_detected' || inv.status === 'pending') {
      inv.syncsSincePaid++
      if (inv.syncsSincePaid === 1) { inv.status = 'pending'; inv.orderStatus = 'processing' }
      else if (inv.syncsSincePaid >= 2) {
        const fail = inv.input.phone?.endsWith(this.failSuffix)
        inv.status = 'complete'
        inv.orderStatus = fail ? 'failed' : 'delivered'
      }
    }
    return this.view(inv)
  }

  async getOrder(id: string): Promise<ProviderOrder> {
    const inv = [...this.invoices.values()].find((i) => i.orderId === id)
    if (!inv) throw new ProviderError('NOT_FOUND', 'Order not found', 404)
    const kind = inv.input.kind
    const redemption: ProviderOrder['redemption'] =
      kind === 'giftcard' ? { code: 'MOCK-' + id.slice(-8).toUpperCase(), pin: '1234', link: 'https://example.com/redeem', instructions: 'Redeem at the merchant checkout.' }
      : kind === 'esim' || kind === 'esim_topup' ? { esim: { iccid: inv.input.esimId ?? '8999' + id.replace(/\D/g, '').padEnd(15, '7').slice(0, 15), esimId: inv.input.esimId ?? 'esim_' + id.slice(-10), smdpAddress: 'smdp.example.com', activationCode: 'MOCK-' + id.slice(-6).toUpperCase(), lpa: `LPA:1$smdp.example.com$MOCK-${id.slice(-6).toUpperCase()}` } }
      : { message: 'Top-up delivered' }
    return { id, status: inv.orderStatus, redemption: inv.orderStatus === 'delivered' ? redemption : undefined }
  }
}
