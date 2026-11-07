// Tolerant normalisers for Bitrefill v2 payloads. Field names differ slightly between
// endpoints and API versions, so each reader checks the documented name first and then
// known alternatives.
import type { Product, ProductPackage, ProductType, Redemption } from '../../shared/types'
import { decodeBolt11 } from '../../shared/bolt11'
import { normalizeInvoiceStatus, normalizeOrderStatus } from '../../shared/status'
import type { ProviderInvoice, ProviderOrder } from './types'

type Obj = Record<string, any>
const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const s = String(v).trim().replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined
  return Number(s)
}
const str = (...vals: unknown[]): string | undefined => {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim()
  for (const v of vals) if (typeof v === 'number') return String(v)
  return undefined
}

export function unwrap<T = any>(body: any): T {
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T
}

export function parseDataPlan(label: string): { dataGb?: number; days?: number } {
  const out: { dataGb?: number; days?: number } = {}
  const gb = /(\d+(?:\.\d+)?)\s*(GB|MB)/i.exec(label)
  if (gb) out.dataGb = gb[2].toUpperCase() === 'MB' ? Number(gb[1]) / 1024 : Number(gb[1])
  if (/unlimited/i.test(label)) out.dataGb = Infinity
  const d = /(\d+)\s*(day|days|d\b)/i.exec(label)
  if (d) out.days = Number(d[1])
  return out
}

function productType(p: Obj, hint?: ProductType): ProductType {
  const cats: string[] = [
    ...(Array.isArray(p.categories) ? p.categories : []),
    p.category, p.product_type, p.type,
  ].filter(Boolean).map((c: any) => String(typeof c === 'object' ? c.slug ?? c.name : c).toLowerCase())
  if (cats.some((c) => c.includes('esim'))) return 'esim'
  if (cats.some((c) => c.includes('data') || c.includes('bundle'))) return 'data'
  if (cats.some((c) => c.includes('refill') || c.includes('topup') || c.includes('top-up') || c.includes('airtime') || c.includes('phone'))) return 'airtime'
  if (hint) return hint
  if (String(p.recipient_type ?? '').includes('phone')) return 'airtime'
  return 'giftcard'
}

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: value % 1 ? 2 : 0 }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}

export function normalizePackage(pk: Obj, currency: string, type: ProductType): ProductPackage | null {
  const value = num(pk.value ?? pk.amount ?? pk.face_value)
  const id = str(pk.package_id, pk.id, pk.value)
  const rawLabel = str(pk.name, pk.label, pk.title)
  if (!id) return null
  const textValue = value === undefined ? str(pk.value) : undefined
  const label = type === 'esim' || type === 'data'
    ? (rawLabel ?? textValue ?? (value !== undefined ? formatMoney(value, currency) : id))
    : (value !== undefined ? formatMoney(value, currency) : rawLabel ?? textValue ?? id)
  const plan = parseDataPlan(rawLabel ?? textValue ?? '')
  // eSIM/data packages often carry the plan text as their value; use the price as value then.
  const effectiveValue = value ?? num(pk.price) ?? 0
  const priceUsd = num(pk.usd_price ?? pk.price_usd ?? pk.priceUsd ?? (String(pk.price_currency ?? pk.currency ?? '').toUpperCase() === 'USD' ? pk.price : undefined))
  return { id, value: effectiveValue, label, priceUsd, ...plan }
}

export function normalizeProduct(p: Obj, hint?: ProductType): Product {
  const type = productType(p, hint)
  const currency = str(p.currency, p.currency_code)?.toUpperCase() ?? 'USD'
  const packages = (Array.isArray(p.packages) ? p.packages : [])
    .map((pk: Obj) => normalizePackage(pk, currency, type))
    .filter(Boolean) as ProductPackage[]
  const r = p.range ?? (p.min_value !== undefined ? { min: p.min_value, max: p.max_value, step: p.step } : undefined)
  const range = r && num(r.min) !== undefined && num(r.max) !== undefined
    ? { min: num(r.min)!, max: num(r.max)!, step: num(r.step) ?? 1 }
    : undefined
  return {
    id: String(p.id ?? p.slug),
    name: str(p.name, p.title, p.id) ?? 'Product',
    type,
    country: (str(p.country_code, p.country, Array.isArray(p.countries) ? p.countries[0] : undefined) ?? '').toUpperCase(),
    currency,
    imageUrl: str(p.image, p.image_url, p.logo, p.icon_url),
    description: str(p.description, p.short_description),
    packages,
    range,
    recipientType: String(p.recipient_type ?? '').includes('phone') || type === 'airtime' || type === 'data' ? 'phone' : 'none',
  }
}

export function normalizeInvoice(raw: Obj): ProviderInvoice {
  const inv = unwrap<Obj>(raw)
  const payment: Obj = inv.payment ?? inv.payment_info ?? {}
  const bolt11 = str(payment.address, payment.lightning_invoice, payment.invoice, payment.payment_request, inv.lightning_invoice)
  let expiresAt: Date | undefined
  let priceSats: number | undefined
  if (bolt11) {
    try {
      const info = decodeBolt11(bolt11)
      expiresAt = new Date(info.expiresAt)
      priceSats = info.amountSats
    } catch { /* fall back to explicit fields */ }
  }
  const expField = str(inv.expiration_time, inv.expires_at, payment.expiration_time, payment.expires_at)
  if (!expiresAt && expField) expiresAt = new Date(/^\d+$/.test(expField) ? Number(expField) * (expField.length <= 10 ? 1000 : 1) : expField)
  if (!priceSats) {
    const cur = String(payment.currency ?? '').toUpperCase()
    const amt = num(payment.price ?? payment.amount)
    if (amt !== undefined && cur === 'BTC') priceSats = Math.ceil(amt * 1e8)
    if (amt !== undefined && (cur === 'SAT' || cur === 'SATS' || cur === 'SATOSHI')) priceSats = Math.ceil(amt)
  }
  const usdCandidates = [inv.usd_price, inv.price_usd, inv.subtotal_usd, String(inv.currency ?? '').toUpperCase() === 'USD' ? (inv.price ?? inv.subtotal) : undefined]
  const priceUsd = usdCandidates.map(num).find((n) => n !== undefined)
  const orders = (Array.isArray(inv.orders) ? inv.orders : []).map((o: Obj) => ({
    id: String(o.id ?? o.order_id),
    status: normalizeOrderStatus(o.status),
  }))
  return {
    id: String(inv.id ?? inv.invoice_id),
    status: normalizeInvoiceStatus(inv.status),
    bolt11,
    expiresAt,
    priceSats,
    priceUsd,
    orders,
  }
}

export function normalizeOrder(raw: Obj): ProviderOrder {
  const o = unwrap<Obj>(raw)
  const ri: Obj = o.redemption_info ?? o.redemption ?? {}
  const esimRaw: Obj | undefined = o.esim ?? ri.esim ?? (ri.iccid || ri.lpa || ri.activation_code ? ri : undefined)
  const redemption: Redemption = {
    code: str(ri.code, ri.voucher, ri.gift_code),
    pin: str(ri.pin),
    link: str(ri.link, ri.url, ri.redemption_url),
    instructions: str(ri.instructions, ri.other),
    message: str(ri.message, ri.extra_fields?.message),
  }
  if (esimRaw) {
    const smdp = str(esimRaw.smdp_address, esimRaw.smdp, esimRaw.sm_dp_address)
    const ac = str(esimRaw.activation_code, esimRaw.matching_id)
    redemption.esim = {
      iccid: str(esimRaw.iccid),
      esimId: str(esimRaw.esim_id, esimRaw.id),
      lpa: str(esimRaw.lpa, esimRaw.qr_code_text, esimRaw.lpa_string) ?? (smdp && ac ? `LPA:1$${smdp}$${ac}` : undefined),
      smdpAddress: smdp,
      activationCode: ac,
      installUrl: str(esimRaw.install_url, esimRaw.direct_install_url),
      iosInstallUrl: str(esimRaw.ios_install_url, esimRaw.apple_install_url),
      androidInstallUrl: str(esimRaw.android_install_url),
    }
  }
  for (const k of Object.keys(redemption) as (keyof Redemption)[]) if (redemption[k] === undefined) delete redemption[k]
  return {
    id: String(o.id ?? o.order_id),
    status: normalizeOrderStatus(o.status),
    redemption: Object.keys(redemption).length ? redemption : undefined,
  }
}
