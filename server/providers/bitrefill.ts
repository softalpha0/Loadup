import type { PhoneCheckResult, Product, ProductType } from '../../shared/types'
import { ProviderError, type CreateInvoiceInput, type ProviderInvoice, type ProviderOrder, type TopupProvider } from './types'
import { normalizeInvoice, normalizeOrder, normalizeProduct, unwrap } from './normalize'

export interface BitrefillConfig {
  baseUrl: string
  apiKey?: string
  apiId?: string
  apiSecret?: string
  fetch?: typeof fetch
}

const TYPE_FILTER: Record<ProductType, string> = {
  airtime: 'refill',
  data: 'data',
  esim: 'esim',
  giftcard: 'giftcard',
}

export class BitrefillProvider implements TopupProvider {
  readonly name = 'bitrefill'
  private fetchFn: typeof fetch
  private cache = new Map<string, { at: number; value: unknown }>()

  constructor(private cfg: BitrefillConfig) {
    this.fetchFn = cfg.fetch ?? fetch
  }

  configured(): boolean {
    return Boolean(this.cfg.apiKey || (this.cfg.apiId && this.cfg.apiSecret))
  }

  private authHeader(): string {
    if (this.cfg.apiKey) return `Bearer ${this.cfg.apiKey}`
    if (this.cfg.apiId && this.cfg.apiSecret) {
      return 'Basic ' + Buffer.from(`${this.cfg.apiId}:${this.cfg.apiSecret}`).toString('base64')
    }
    throw new ProviderError('NOT_CONFIGURED', 'Bitrefill credentials are not configured')
  }

  private async request<T = any>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(this.cfg.baseUrl.replace(/\/$/, '') + path)
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    const res = await this.fetchFn(url, {
      method,
      headers: {
        Authorization: this.authHeader(),
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    const text = await res.text()
    let json: any
    try { json = text ? JSON.parse(text) : {} } catch { json = { message: text } }
    if (!res.ok) {
      const msg = json?.message ?? json?.error?.message ?? json?.error ?? `Bitrefill HTTP ${res.status}`
      const code = res.status === 404 ? 'NOT_FOUND'
        : res.status === 401 || res.status === 403 ? 'UNAUTHORIZED'
        : res.status >= 400 && res.status < 500 ? 'BAD_REQUEST' : 'UPSTREAM'
      throw new ProviderError(code, String(msg), res.status)
    }
    return json as T
  }

  private async cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
    const value = await fn()
    this.cache.set(key, { at: Date.now(), value })
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!)
    return value
  }

  async health() {
    if (!this.configured()) return { ok: false, detail: 'not configured' }
    try {
      await this.request('GET', '/ping')
      return { ok: true }
    } catch (e) {
      // Some API versions have no /ping — a cheap product query proves auth + reachability.
      try {
        await this.request('GET', '/products', undefined, { limit: 1 })
        return { ok: true }
      } catch (e2) {
        return { ok: false, detail: (e2 as Error).message || (e as Error).message }
      }
    }
  }

  async checkPhone(e164: string, country: string): Promise<PhoneCheckResult> {
    const raw = await this.request('GET', '/check_phone_number', undefined, { phone_number: e164.replace(/^\+/, '') })
    const d = unwrap<any>(raw) ?? {}
    const op = d.operator ?? d.operators?.[0] ?? d
    const operator = op && (op.slug || op.id || op.name)
      ? { id: String(op.slug ?? op.id ?? op.name), name: String(op.name ?? op.slug), logoUrl: op.logo ?? op.logo_image ?? op.image }
      : undefined
    let products: Product[] = []
    const rawProducts = d.products ?? op?.products
    if (Array.isArray(rawProducts) && rawProducts.length) {
      products = rawProducts.map((p: any) => normalizeProduct(p, 'airtime'))
    } else if (operator) {
      // Look up full product info (packages) for the operator's products
      const ids: string[] = Array.isArray(d.product_ids) ? d.product_ids : [operator.id]
      const settled = await Promise.allSettled(ids.map((id) => this.getProduct(id)))
      products = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
      if (!products.length) {
        products = await this.listProducts({ type: 'airtime', country, query: operator.name })
        const more = await this.listProducts({ type: 'data', country, query: operator.name }).catch(() => [])
        products = [...products, ...more]
      }
    }
    return {
      e164,
      country: String(d.country_code ?? d.country ?? country).toUpperCase(),
      operator,
      products: products.filter((p) => p.recipientType === 'phone'),
    }
  }

  async listProducts(q: { type?: ProductType; country?: string; query?: string }): Promise<Product[]> {
    const key = `products:${q.type}:${q.country}:${q.query}`
    return this.cached(key, 10 * 60_000, async () => {
      const path = q.query ? '/products/search' : '/products'
      const raw = await this.request('GET', path, undefined, {
        q: q.query,
        country: q.country?.toUpperCase(),
        product_type: q.type ? TYPE_FILTER[q.type] : undefined,
        category: q.type ? TYPE_FILTER[q.type] : undefined,
        limit: 50,
      })
      const list = unwrap<any[]>(raw) ?? []
      return (Array.isArray(list) ? list : [])
        .filter((p) => p && p.in_stock !== false)
        .map((p) => normalizeProduct(p, q.type))
        .filter((p) => !q.type || p.type === q.type || (q.type === 'airtime' && p.type === 'data'))
    })
  }

  async getProduct(id: string): Promise<Product> {
    return this.cached(`product:${id}`, 10 * 60_000, async () => {
      const raw = await this.request('GET', `/products/${encodeURIComponent(id)}`)
      return normalizeProduct(unwrap(raw))
    })
  }

  async listEsims(q: { country?: string; query?: string }): Promise<Product[]> {
    return this.cached(`esims:${q.country}:${q.query}`, 10 * 60_000, async () => {
      const raw = await this.request('GET', '/products/esims', undefined, { country: q.country?.toUpperCase(), q: q.query, limit: 50 })
      const list = unwrap<any[]>(raw) ?? []
      return (Array.isArray(list) ? list : []).map((p) => normalizeProduct(p, 'esim'))
    })
  }

  async createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoice> {
    const product: Record<string, unknown> = { product_id: input.productId, quantity: 1 }
    if (input.packageId) product.package_id = input.packageId
    else if (input.value !== undefined) product.value = input.value
    if (input.phone) product.phone_number = input.phone.replace(/^\+/, '')

    const common = { payment_method: 'lightning', auto_pay: false, ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}) }

    if (input.kind === 'esim' || input.kind === 'esim_topup') {
      const body = { ...common, ...product, ...(input.esimId ? { esim_id: input.esimId } : {}) }
      try {
        return normalizeInvoice(await this.request('POST', '/esims', body))
      } catch (e) {
        // Accounts where eSIMs are ordinary products use the generic invoice endpoint.
        if (!(e instanceof ProviderError && e.code === 'NOT_FOUND') || input.esimId) throw e
      }
    }
    const raw = await this.request('POST', '/invoices', { ...common, products: [product] })
    return normalizeInvoice(raw)
  }

  async getInvoice(id: string): Promise<ProviderInvoice> {
    return normalizeInvoice(await this.request('GET', `/invoices/${encodeURIComponent(id)}`))
  }

  async getOrder(id: string): Promise<ProviderOrder> {
    return normalizeOrder(await this.request('GET', `/orders/${encodeURIComponent(id)}`))
  }
}
