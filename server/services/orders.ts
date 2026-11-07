import { and, eq, gte, inArray, sql, desc, lt, isNull } from 'drizzle-orm'
import type { DB } from '../db/client'
import { orders, limits, requests } from '../db/schema'
import type { TopupProvider } from '../providers/types'
import { ProviderError } from '../providers/types'
import { DataCipher, randomId } from '../crypto'
import { checkLimits, dayKey, type LimitConfig } from '../../shared/limits'
import { mapProviderStatus, isFinal, type ProviderOrderStatus } from '../../shared/status'
import { maskPhone } from '../../shared/phone'
import type { OrderDTO, OrderKind, OrderStatus, Redemption, Product } from '../../shared/types'
import { AppError } from './errors'
import { formatMoney } from '../providers/normalize'
import { btcUsd, satsToUsd } from './rates'

export type OrderRow = typeof orders.$inferSelect

export interface OrderDeps {
  db: DB
  provider: TopupProvider
  cipher: DataCipher
  limits: LimitConfig
  webhookUrl?: string
  rate?: () => Promise<number | null>
}

export interface CreateOrderInput {
  userId: string
  kind: OrderKind
  productId: string
  packageId?: string
  value?: number
  /** E.164 */
  phone?: { e164: string; last4: string; callingCode: string }
  esimId?: string
  requestId?: string
}

const OPEN_STATUSES: OrderStatus[] = ['awaiting_payment', 'paid', 'processing']

export class OrderService {
  constructor(private d: OrderDeps) {}

  // ── Pricing / limits ────────────────────────────────────────────────

  private estimateUsd(product: Product, packageId?: string, value?: number): number | undefined {
    if (packageId) return product.packages.find((p) => p.id === packageId)?.priceUsd
    if (value !== undefined) {
      if (product.currency === 'USD') return value
      const ref = product.packages.find((p) => p.priceUsd && p.value)
      if (ref) return (value / ref.value) * ref.priceUsd!
    }
    return undefined
  }

  /** USD already committed today: paid orders (limits table) + open unpaid invoices. */
  async usedTodayUsd(userId: string, excludeOrderId?: string): Promise<number> {
    const day = dayKey()
    const [row] = await this.d.db.select().from(limits).where(and(eq(limits.userId, userId), eq(limits.day, day)))
    const paid = row?.totalUsdCents ?? 0
    const open = await this.d.db
      .select({ s: sql<number>`coalesce(sum(${orders.priceUsdCents}), 0)` })
      .from(orders)
      .where(and(
        eq(orders.userId, userId),
        eq(orders.status, 'awaiting_payment'),
        isNull(orders.paymentAttemptedAt),
        gte(orders.invoiceExpiresAt, new Date()),
        excludeOrderId ? sql`${orders.id} <> ${excludeOrderId}` : sql`true`,
      ))
    return (paid + Number(open[0]?.s ?? 0)) / 100
  }

  private async enforceLimits(userId: string, usd: number, excludeOrderId?: string) {
    const used = await this.usedTodayUsd(userId, excludeOrderId)
    const res = checkLimits(usd, used, this.d.limits)
    if (!res.ok) {
      throw new AppError(422, res.code,
        res.code === 'LIMIT_PER_ORDER'
          ? `Orders are limited to $${res.limitUsd} each.`
          : `Daily limit of $${res.limitUsd} reached. You can spend $${res.remainingUsd.toFixed(2)} more today.`,
        res)
    }
  }

  private async resolveUsd(invUsd: number | undefined, sats: number | undefined, estimate: number | undefined): Promise<number> {
    if (invUsd !== undefined) return invUsd
    if (sats !== undefined) {
      const rate = await (this.d.rate ?? (() => btcUsd()))()
      if (rate) return satsToUsd(sats, rate)
    }
    if (estimate !== undefined) return estimate
    throw new AppError(503, 'PRICE_UNAVAILABLE', 'We could not price this order right now. Please try again in a minute.')
  }

  // ── Create ──────────────────────────────────────────────────────────

  async create(input: CreateOrderInput): Promise<OrderRow> {
    const { provider } = this.d
    if (!provider.configured()) throw new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'Top-ups are temporarily unavailable.')

    let product: Product
    try {
      product = await provider.getProduct(input.productId)
    } catch (e) {
      throw mapProviderError(e)
    }
    let pkgLabel: string | undefined
    if (input.packageId) {
      const pkg = product.packages.find((p) => p.id === input.packageId)
      if (!pkg) throw new AppError(400, 'UNKNOWN_PACKAGE', 'That package is no longer available.')
      pkgLabel = pkg.label
    } else if (input.value !== undefined) {
      const r = product.range
      if (!r) throw new AppError(400, 'CUSTOM_AMOUNT_UNSUPPORTED', 'Choose one of the packages.')
      const stepOk = Math.abs(((input.value - r.min) / r.step) - Math.round((input.value - r.min) / r.step)) < 1e-9
      if (input.value < r.min || input.value > r.max || !stepOk) {
        throw new AppError(400, 'VALUE_OUT_OF_RANGE', `Amount must be between ${r.min} and ${r.max} ${product.currency}.`)
      }
      pkgLabel = formatMoney(input.value, product.currency)
    } else {
      throw new AppError(400, 'PACKAGE_REQUIRED', 'Choose a package or amount.')
    }
    const needsPhone = input.kind === 'airtime' || input.kind === 'data'
    if (needsPhone && !input.phone) throw new AppError(400, 'PHONE_REQUIRED', 'Enter a phone number.')
    if (input.kind === 'esim_topup' && !input.esimId) throw new AppError(400, 'ESIM_REQUIRED', 'Choose the eSIM to top up.')

    const estimate = this.estimateUsd(product, input.packageId, input.value)
    if (estimate !== undefined) await this.enforceLimits(input.userId, estimate)

    const id = randomId('o_')
    let inv
    try {
      inv = await provider.createInvoice({
        kind: input.kind,
        productId: input.productId,
        packageId: input.packageId,
        value: input.packageId ? undefined : input.value,
        phone: input.phone?.e164,
        esimId: input.esimId,
        webhookUrl: this.d.webhookUrl,
      })
    } catch (e) {
      throw mapProviderError(e)
    }
    if (!inv.bolt11) throw new AppError(502, 'NO_LIGHTNING_INVOICE', 'The provider did not return a Lightning invoice.')

    const usd = await this.resolveUsd(inv.priceUsd, inv.priceSats, estimate)
    // Re-check with the real invoice price (may differ from the catalogue estimate).
    await this.enforceLimits(input.userId, usd)

    const [row] = await this.d.db.insert(orders).values({
      id,
      userId: input.userId,
      kind: input.kind,
      productId: product.id,
      productName: product.name,
      packageId: input.packageId ?? null,
      packageLabel: pkgLabel ?? null,
      value: String(input.packageId ? product.packages.find((p) => p.id === input.packageId)?.value ?? '' : input.value),
      currency: product.currency,
      recipientPhoneEnc: input.phone ? this.d.cipher.encrypt(input.phone.e164) : null,
      recipientLast4: input.phone?.last4 ?? null,
      recipientCallingCode: input.phone?.callingCode ?? null,
      esimId: input.esimId ?? null,
      provider: provider.name,
      providerInvoiceId: inv.id,
      providerOrderId: inv.orders[0]?.id ?? null,
      bolt11: inv.bolt11,
      invoiceExpiresAt: inv.expiresAt ?? new Date(Date.now() + 10 * 60_000),
      priceSats: inv.priceSats ?? null,
      priceUsdCents: Math.round(usd * 100),
      status: 'awaiting_payment',
      requestId: input.requestId ?? null,
      receiptToken: randomId(),
    }).returning()
    return row
  }

  // ── Read ────────────────────────────────────────────────────────────

  async get(id: string): Promise<OrderRow | undefined> {
    const [row] = await this.d.db.select().from(orders).where(eq(orders.id, id))
    return row
  }

  async getForUser(id: string, userId: string): Promise<OrderRow> {
    const row = await this.get(id)
    if (!row || row.userId !== userId) throw new AppError(404, 'NOT_FOUND', 'Order not found.')
    return row
  }

  async list(userId: string, opts: { kind?: OrderKind; status?: OrderStatus; limit?: number } = {}) {
    const conds = [eq(orders.userId, userId)]
    if (opts.kind) conds.push(eq(orders.kind, opts.kind))
    if (opts.status) conds.push(eq(orders.status, opts.status))
    return this.d.db.select().from(orders).where(and(...conds)).orderBy(desc(orders.createdAt)).limit(opts.limit ?? 100)
  }

  decryptPhone(row: { recipientPhoneEnc: string | null }): string | null {
    return row.recipientPhoneEnc ? this.d.cipher.decrypt(row.recipientPhoneEnc) : null
  }

  toDTO(row: OrderRow, opts: { includeRedemption?: boolean; requestCode?: string | null } = {}): OrderDTO {
    let redemption: Redemption | null = null
    if (opts.includeRedemption && row.redemptionJsonEnc) {
      try { redemption = this.d.cipher.decryptJson<Redemption>(row.redemptionJsonEnc) } catch { redemption = null }
    }
    const final = isFinal(row.status as OrderStatus)
    return {
      id: row.id,
      kind: row.kind as OrderKind,
      status: row.status as OrderStatus,
      productId: row.productId,
      productName: row.productName,
      packageId: row.packageId,
      packageLabel: row.packageLabel,
      value: row.value ? Number(row.value) : null,
      currency: row.currency,
      recipientMasked: row.recipientLast4 ? maskPhone(row.recipientCallingCode ?? '', row.recipientLast4) : null,
      esimId: row.esimId,
      // The invoice is only handed out while it can (and may) be paid.
      bolt11: row.status === 'awaiting_payment' && !row.paymentAttemptedAt ? row.bolt11 : null,
      invoiceExpiresAt: row.invoiceExpiresAt?.toISOString() ?? null,
      priceSats: row.priceSats,
      priceUsd: row.priceUsdCents != null ? row.priceUsdCents / 100 : null,
      paymentAttempted: Boolean(row.paymentAttemptedAt),
      failureReason: row.failureReason,
      receiptToken: row.receiptToken,
      requestCode: opts.requestCode ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      redemption: final ? redemption : null,
    }
  }

  // ── Payment ─────────────────────────────────────────────────────────

  /**
   * Called after payLightningInvoice resolved (or with uncertain=true after
   * TRANSACTION_OUTCOME_UNKNOWN / DUPLICATE_PAYMENT). From this point on the
   * invoice is never handed out or refreshed again.
   */
  async markPaymentSubmitted(row: OrderRow, p: { hash?: string; swapId?: string; uncertain?: boolean }): Promise<OrderRow> {
    if (isFinal(row.status as OrderStatus) && row.status !== 'expired') return row
    const next: OrderStatus = row.status === 'awaiting_payment' || row.status === 'expired' ? 'paid' : (row.status as OrderStatus)
    const [updated] = await this.d.db.update(orders).set({
      paymentAttemptedAt: row.paymentAttemptedAt ?? new Date(),
      nimiqTxHash: p.hash ?? row.nimiqTxHash,
      swapId: p.swapId ?? row.swapId,
      status: next,
      failureReason: null,
      updatedAt: new Date(),
    }).where(eq(orders.id, row.id)).returning()
    if (!row.paymentAttemptedAt && row.userId && row.priceUsdCents) {
      await this.addToDailyTotal(row.userId, row.priceUsdCents)
    }
    if (updated.requestId) {
      await this.d.db.update(requests).set({ status: 'paid', orderId: updated.id }).where(eq(requests.id, updated.requestId))
    }
    return this.sync(updated)
  }

  private async addToDailyTotal(userId: string, cents: number) {
    await this.d.db.insert(limits).values({ userId, day: dayKey(), totalUsdCents: cents })
      .onConflictDoUpdate({ target: [limits.userId, limits.day], set: { totalUsdCents: sql`${limits.totalUsdCents} + ${cents}` } })
  }

  /** New BOLT11 for an expired, never-attempted order. Never for an order that may have been paid. */
  async refreshInvoice(row: OrderRow): Promise<OrderRow> {
    if (row.paymentAttemptedAt) throw new AppError(409, 'PAYMENT_ALREADY_SUBMITTED', 'A payment was already submitted for this order. We are checking its status.')
    if (!['awaiting_payment', 'expired'].includes(row.status)) throw new AppError(409, 'NOT_REFRESHABLE', 'This order can no longer be refreshed.')
    // Make sure the old invoice really is unpaid before replacing it.
    if (row.providerInvoiceId) {
      const current = await this.d.provider.getInvoice(row.providerInvoiceId).catch(() => null)
      if (current && !['unpaid', 'expired'].includes(current.status)) {
        const synced = await this.sync(row)
        throw new AppError(409, 'INVOICE_ALREADY_PAID', 'This invoice was already paid.', { status: synced.status })
      }
      if (current?.status === 'unpaid' && current.expiresAt && current.expiresAt.getTime() > Date.now() + 30_000) {
        return row // still valid — nothing to do
      }
    }
    const phone = this.decryptPhone(row)
    let inv
    try {
      inv = await this.d.provider.createInvoice({
        kind: row.kind as OrderKind,
        productId: row.productId,
        packageId: row.packageId ?? undefined,
        value: row.packageId ? undefined : Number(row.value),
        phone: phone ?? undefined,
        esimId: row.esimId ?? undefined,
        webhookUrl: this.d.webhookUrl,
      })
    } catch (e) {
      throw mapProviderError(e)
    }
    if (!inv.bolt11) throw new AppError(502, 'NO_LIGHTNING_INVOICE', 'The provider did not return a Lightning invoice.')
    const usd = await this.resolveUsd(inv.priceUsd, inv.priceSats, row.priceUsdCents != null ? row.priceUsdCents / 100 : undefined)
    if (row.userId) await this.enforceLimits(row.userId, usd, row.id)
    const [updated] = await this.d.db.update(orders).set({
      providerInvoiceId: inv.id,
      providerOrderId: inv.orders[0]?.id ?? null,
      bolt11: inv.bolt11,
      invoiceExpiresAt: inv.expiresAt ?? new Date(Date.now() + 10 * 60_000),
      priceSats: inv.priceSats ?? null,
      priceUsdCents: Math.round(usd * 100),
      status: 'awaiting_payment',
      failureReason: null,
      updatedAt: new Date(),
    }).where(and(eq(orders.id, row.id), isNull(orders.paymentAttemptedAt))).returning()
    if (!updated) throw new AppError(409, 'PAYMENT_ALREADY_SUBMITTED', 'A payment was already submitted for this order.')
    return updated
  }

  // ── Tracking ────────────────────────────────────────────────────────

  /** Re-fetches provider state and updates the order. Safe to call any time. */
  async sync(row: OrderRow): Promise<OrderRow> {
    if (isFinal(row.status as OrderStatus) && row.status !== 'expired') return row
    if (!row.providerInvoiceId) return row
    let inv
    try {
      inv = await this.d.provider.getInvoice(row.providerInvoiceId)
    } catch (e) {
      if (e instanceof ProviderError && e.code === 'NOT_FOUND' && row.status === 'awaiting_payment' && !row.paymentAttemptedAt) {
        return this.update(row, { status: 'expired', failureReason: 'invoice_missing' })
      }
      await this.d.db.update(orders).set({ lastSyncedAt: new Date() }).where(eq(orders.id, row.id))
      return row
    }
    const providerOrderId = inv.orders[0]?.id ?? row.providerOrderId
    let orderStatus: ProviderOrderStatus | undefined = inv.orders[0]?.status
    let redemption: Redemption | undefined
    if (providerOrderId && (inv.status === 'complete' || orderStatus === 'delivered' || orderStatus === 'failed' || orderStatus === 'refunded')) {
      try {
        const o = await this.d.provider.getOrder(providerOrderId)
        orderStatus = o.status === 'unknown' ? orderStatus : o.status
        redemption = o.redemption
      } catch { /* keep invoice-level status */ }
    }
    const expired = row.invoiceExpiresAt ? row.invoiceExpiresAt.getTime() < Date.now() : false
    const { status, reason } = mapProviderStatus({
      invoice: inv.status,
      order: orderStatus,
      invoiceExpired: expired,
      paymentAttempted: Boolean(row.paymentAttemptedAt),
      current: row.status === 'expired' ? 'awaiting_payment' : (row.status as OrderStatus),
    })
    const patch: Partial<OrderRow> = { providerOrderId, lastSyncedAt: new Date() }
    if (status !== row.status) { patch.status = status; patch.updatedAt = new Date(); patch.failureReason = reason ?? null }
    if (redemption) patch.redemptionJsonEnc = this.d.cipher.encryptJson(redemption)
    // A payment detected by the provider counts against today's limit even if the
    // client never reported it (e.g. the app was closed right after paying).
    if (!row.paymentAttemptedAt && ['paid', 'processing', 'delivered'].includes(status)) {
      patch.paymentAttemptedAt = new Date()
      if (row.userId && row.priceUsdCents) await this.addToDailyTotal(row.userId, row.priceUsdCents)
      if (row.requestId) await this.d.db.update(requests).set({ status: 'paid', orderId: row.id }).where(eq(requests.id, row.requestId))
    }
    return this.update(row, patch)
  }

  private async update(row: OrderRow, patch: Partial<OrderRow>): Promise<OrderRow> {
    const [u] = await this.d.db.update(orders).set(patch).where(eq(orders.id, row.id)).returning()
    return u ?? row
  }

  async syncByInvoiceId(invoiceId: string): Promise<OrderRow | null> {
    const [row] = await this.d.db.select().from(orders).where(eq(orders.providerInvoiceId, invoiceId))
    return row ? this.sync(row) : null
  }

  /** Cron: poll open orders, expire stale invoices. */
  async tick(): Promise<{ checked: number }> {
    const open = await this.d.db.select().from(orders)
      .where(inArray(orders.status, OPEN_STATUSES))
      .orderBy(orders.updatedAt)
      .limit(200)
    let checked = 0
    for (const row of open) {
      // Unpaid invoices far past expiry are expired without another provider call after 1h.
      if (row.status === 'awaiting_payment' && !row.paymentAttemptedAt && row.invoiceExpiresAt && row.invoiceExpiresAt.getTime() < Date.now() - 3600_000) {
        await this.update(row, { status: 'expired', failureReason: 'invoice_expired', updatedAt: new Date() })
        continue
      }
      await this.sync(row).catch(() => undefined)
      checked++
    }
    // Close abandoned sessions/requests
    return { checked }
  }

  async deleteForUser(userId: string) {
    // Orders keep the provider reference for accounting but drop all personal data.
    await this.d.db.update(orders).set({
      userId: null, recipientPhoneEnc: null, recipientLast4: null, recipientCallingCode: null, redemptionJsonEnc: null, updatedAt: new Date(),
    }).where(eq(orders.userId, userId))
  }

  /** Orders with a final status older than the given date that still have a phone — unused helper kept for retention jobs. */
  async purgeOldPhones(before: Date) {
    await this.d.db.update(orders).set({ recipientPhoneEnc: null })
      .where(and(lt(orders.createdAt, before), inArray(orders.status, ['delivered', 'failed', 'expired'])))
  }
}

export function mapProviderError(e: unknown): AppError {
  if (e instanceof AppError) return e
  if (e instanceof ProviderError) {
    switch (e.code) {
      case 'NOT_CONFIGURED': return new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'Top-ups are temporarily unavailable.')
      case 'NOT_FOUND': return new AppError(404, 'NOT_AVAILABLE', 'This product is not available.')
      case 'OUT_OF_STOCK': return new AppError(409, 'OUT_OF_STOCK', 'This product is out of stock right now.')
      case 'BAD_REQUEST': return new AppError(400, 'PROVIDER_REJECTED', e.message || 'The provider rejected this order.')
      case 'UNAUTHORIZED': return new AppError(503, 'PROVIDER_AUTH', 'Top-ups are temporarily unavailable.')
      default: return new AppError(502, 'PROVIDER_ERROR', 'The provider is not responding. Please try again.')
    }
  }
  return new AppError(500, 'INTERNAL', 'Something went wrong.')
}
