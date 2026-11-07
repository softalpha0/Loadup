import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { secureHeaders } from 'hono/secure-headers'
import { z } from 'zod'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import type { Database } from './db/client'
import { users, sessions, savedNumbers, orders, requests, limits } from './db/schema'
import type { TopupProvider } from './providers/types'
import { MockProvider } from './providers/mock'
import { DataCipher, randomCode, randomId, safeEqual } from './crypto'
import { verifySignedMessage } from './auth/nimiq-signature'
import { issueToken, readToken, signInMessage } from './auth/session'
import { OrderService, mapProviderError, type OrderRow } from './services/orders'
import { formatMoney } from './providers/normalize'
import { AppError } from './services/errors'
import { parsePhone, maskPhone } from '../shared/phone'
import { ORDER_KINDS, ORDER_STATUSES, type AppConfig, type RequestDTO, type SavedNumberDTO, type OrderKind, type OrderStatus } from '../shared/types'
import { isFinal } from '../shared/status'
import type { Env } from './env'

export interface AppDeps {
  env: Env
  database: Database
  provider: TopupProvider
  rate?: () => Promise<number | null>
}

type Vars = { userId: string; sessionId: string }

const LOCALES = ['en', 'es', 'fr', 'pt'] as const

export function createApp(deps: AppDeps) {
  const { env, database, provider } = deps
  const db = database.db
  const cipher = new DataCipher(env.DATA_ENCRYPTION_KEY)
  const appUrl = env.PUBLIC_APP_URL.replace(/\/$/, '')
  const webhookUrl = appUrl.startsWith('https://')
    ? `${appUrl}/api/webhooks/bitrefill${env.WEBHOOK_TOKEN ? `?token=${encodeURIComponent(env.WEBHOOK_TOKEN)}` : ''}`
    : undefined
  const svc = new OrderService({
    db, provider, cipher,
    limits: { perOrderUsd: env.LIMIT_PER_ORDER_USD, perDayUsd: env.LIMIT_PER_DAY_USD },
    webhookUrl,
    rate: deps.rate,
  })

  const app = new Hono<{ Variables: Vars }>()
  const api = new Hono<{ Variables: Vars }>()

  app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false, xFrameOptions: false, contentSecurityPolicy: undefined }))

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.code, message: err.message, details: err.details }, err.status as 400)
    if (err instanceof z.ZodError) return c.json({ error: 'INVALID_INPUT', message: 'Please check your input.', details: err.issues }, 400)
    console.error('[loadup] unhandled', err)
    const mapped = mapProviderError(err)
    return c.json({ error: mapped.code, message: mapped.message }, mapped.status as 500)
  })

  // ── helpers ───────────────────────────────────────────────────────
  async function authUser(c: Context<{ Variables: Vars }>): Promise<{ userId: string; sessionId: string } | null> {
    const h = c.req.header('authorization')
    const token = h?.startsWith('Bearer ') ? h.slice(7) : null
    const sid = readToken(env.SESSION_SECRET, token)
    if (!sid) return null
    const [s] = await db.select().from(sessions).where(eq(sessions.id, sid))
    if (!s || !s.userId || s.nonce || s.expiresAt.getTime() < Date.now()) return null
    return { userId: s.userId, sessionId: s.id }
  }
  const requireAuth = async (c: Context<{ Variables: Vars }>, next: () => Promise<void>) => {
    const a = await authUser(c)
    if (!a) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in again.')
    c.set('userId', a.userId)
    c.set('sessionId', a.sessionId)
    await next()
  }

  function savedDTO(r: typeof savedNumbers.$inferSelect): SavedNumberDTO {
    return { id: r.id, nickname: r.nickname, masked: maskPhone(r.callingCode, r.phoneLast4), last4: r.phoneLast4, country: r.country, operatorId: r.operatorId }
  }

  async function requestDTO(r: typeof requests.$inferSelect, viewerId?: string): Promise<RequestDTO> {
    let orderStatus: OrderStatus | null = null
    if (r.orderId) {
      const o = await svc.get(r.orderId)
      orderStatus = (o?.status as OrderStatus) ?? null
    }
    const expired = r.status === 'open' && r.expiresAt.getTime() < Date.now()
    return {
      code: r.code, kind: r.kind as OrderKind, productId: r.productId, productName: r.productName,
      packageId: r.packageId, packageLabel: r.packageLabel, value: r.value ? Number(r.value) : null, currency: r.currency,
      recipientMasked: maskPhone(r.recipientCallingCode, r.recipientLast4), note: r.note,
      status: expired ? 'expired' : (r.status as RequestDTO['status']), orderStatus,
      expiresAt: r.expiresAt.toISOString(), isRequester: viewerId === r.requesterUserId,
    }
  }

  async function resolvePhone(userId: string, body: { phone?: string; country?: string; savedNumberId?: string }) {
    if (body.savedNumberId) {
      const [s] = await db.select().from(savedNumbers).where(and(eq(savedNumbers.id, body.savedNumberId), eq(savedNumbers.userId, userId)))
      if (!s) throw new AppError(404, 'NOT_FOUND', 'Saved number not found.')
      const parsed = parsePhone(cipher.decrypt(s.phoneEnc))
      if (!parsed) throw new AppError(400, 'INVALID_PHONE', 'That saved number is not valid any more.')
      return parsed
    }
    if (!body.phone) return undefined
    const parsed = parsePhone(body.phone, body.country)
    if (!parsed) throw new AppError(400, 'INVALID_PHONE', 'That phone number does not look right.')
    return parsed
  }

  // ── public ────────────────────────────────────────────────────────
  api.get('/config', (c) => {
    const cfg: AppConfig = {
      provider: provider.name,
      providerConfigured: provider.configured(),
      limits: { perOrderUsd: env.LIMIT_PER_ORDER_USD, perDayUsd: env.LIMIT_PER_DAY_USD },
      supportEmail: env.SUPPORT_EMAIL || undefined,
      supportUrl: env.SUPPORT_URL || undefined,
      appUrl,
    }
    return c.json(cfg)
  })

  api.get('/health', async (c) => {
    const dbOk = await database.ping().catch(() => false)
    const p = await provider.health().catch((e) => ({ ok: false, detail: String(e?.message ?? e) }))
    const ok = dbOk && p.ok
    return c.json({
      ok,
      db: dbOk ? 'ok' : 'error',
      provider: { name: provider.name, configured: provider.configured(), reachable: p.ok, detail: p.detail },
      time: new Date().toISOString(),
    }, ok ? 200 : 503)
  })

  // ── auth ──────────────────────────────────────────────────────────
  api.post('/auth/nonce', async (c) => {
    const nonce = randomId()
    const id = randomId('s_')
    const host = new URL(appUrl).host
    const message = signInMessage(nonce, host, new Date())
    await db.insert(sessions).values({ id, nonce, message, expiresAt: new Date(Date.now() + 5 * 60_000) })
    return c.json({ nonceId: id, message })
  })

  api.post('/auth/verify', async (c) => {
    const body = z.object({
      nonceId: z.string(), publicKey: z.string().min(64), signature: z.string().min(128),
      address: z.string().optional(), locale: z.string().optional(),
    }).parse(await c.req.json())
    const [s] = await db.select().from(sessions).where(eq(sessions.id, body.nonceId))
    if (!s || !s.nonce || !s.message || s.userId || s.expiresAt.getTime() < Date.now()) {
      throw new AppError(400, 'NONCE_EXPIRED', 'Sign-in request expired. Please try again.')
    }
    const res = verifySignedMessage(s.message, body.publicKey, body.signature)
    if (!res.valid || !res.address) throw new AppError(401, 'BAD_SIGNATURE', 'Signature could not be verified.')
    const locale = LOCALES.find((l) => body.locale?.toLowerCase().startsWith(l)) ?? null
    let [user] = await db.select().from(users).where(eq(users.nimAddress, res.address))
    if (!user) {
      ;[user] = await db.insert(users).values({ id: randomId('u_'), nimAddress: res.address, locale }).onConflictDoNothing().returning()
      if (!user) [user] = await db.select().from(users).where(eq(users.nimAddress, res.address))
    }
    // Consume the nonce (single use) and turn the row into a 30-day session.
    const [upd] = await db.update(sessions).set({ userId: user.id, nonce: null, message: null, expiresAt: new Date(Date.now() + 30 * 86400_000) })
      .where(and(eq(sessions.id, s.id), eq(sessions.nonce, s.nonce))).returning()
    if (!upd) throw new AppError(400, 'NONCE_EXPIRED', 'Sign-in request expired. Please try again.')
    return c.json({ token: issueToken(env.SESSION_SECRET, s.id), address: user.nimAddress, locale: user.locale })
  })

  api.post('/auth/logout', requireAuth, async (c) => {
    await db.delete(sessions).where(eq(sessions.id, c.get('sessionId')))
    return c.json({ ok: true })
  })

  // ── me ────────────────────────────────────────────────────────────
  api.get('/me', requireAuth, async (c) => {
    const userId = c.get('userId')
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in again.')
    const saved = await db.select().from(savedNumbers).where(eq(savedNumbers.userId, userId)).orderBy(desc(savedNumbers.createdAt))
    const recent = await svc.list(userId, { limit: 5 })
    const used = await svc.usedTodayUsd(userId)
    return c.json({
      address: user.nimAddress,
      locale: user.locale,
      savedNumbers: saved.map(savedDTO),
      recentOrders: recent.map((o) => svc.toDTO(o)),
      limits: { perOrderUsd: env.LIMIT_PER_ORDER_USD, perDayUsd: env.LIMIT_PER_DAY_USD, usedTodayUsd: used },
    })
  })

  api.patch('/me', requireAuth, async (c) => {
    const body = z.object({ locale: z.enum(LOCALES) }).parse(await c.req.json())
    await db.update(users).set({ locale: body.locale }).where(eq(users.id, c.get('userId')))
    return c.json({ ok: true })
  })

  api.delete('/me', requireAuth, async (c) => {
    const userId = c.get('userId')
    await svc.deleteForUser(userId)
    await db.delete(requests).where(eq(requests.requesterUserId, userId))
    await db.delete(savedNumbers).where(eq(savedNumbers.userId, userId))
    await db.delete(limits).where(eq(limits.userId, userId))
    await db.delete(sessions).where(eq(sessions.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
    return c.json({ ok: true })
  })

  // ── catalogue ─────────────────────────────────────────────────────
  api.post('/phone/check', requireAuth, async (c) => {
    const body = z.object({ phone: z.string().optional(), country: z.string().length(2).optional(), savedNumberId: z.string().optional() }).parse(await c.req.json())
    const parsed = await resolvePhone(c.get('userId'), body)
    if (!parsed) throw new AppError(400, 'INVALID_PHONE', 'Enter a phone number.')
    try {
      const res = await provider.checkPhone(parsed.e164, parsed.country)
      return c.json({ ...res, masked: maskPhone(parsed.callingCode, parsed.last4) })
    } catch (e) {
      const m = mapProviderError(e)
      if (m.code === 'NOT_AVAILABLE' || m.code === 'PROVIDER_REJECTED') {
        return c.json({ e164: parsed.e164, country: parsed.country, products: [], masked: maskPhone(parsed.callingCode, parsed.last4) })
      }
      throw m
    }
  })

  api.get('/products', async (c) => {
    const q = z.object({
      type: z.enum(['airtime', 'data', 'esim', 'giftcard']).optional(),
      country: z.string().length(2).optional(),
      q: z.string().max(80).optional(),
    }).parse(c.req.query())
    try {
      const list = await provider.listProducts({ type: q.type, country: q.country, query: q.q })
      c.header('Cache-Control', 'public, max-age=600')
      return c.json({ products: list })
    } catch (e) { throw mapProviderError(e) }
  })

  api.get('/products/:id', async (c) => {
    try {
      return c.json({ product: await provider.getProduct(c.req.param('id')!) })
    } catch (e) { throw mapProviderError(e) }
  })

  api.get('/esims/products', async (c) => {
    const q = z.object({ country: z.string().length(2).optional(), q: z.string().max(80).optional() }).parse(c.req.query())
    try {
      const list = await provider.listEsims({ country: q.country, query: q.q })
      c.header('Cache-Control', 'public, max-age=600')
      return c.json({ products: list })
    } catch (e) { throw mapProviderError(e) }
  })

  /** "My eSIMs": delivered eSIM purchases plus their top-ups */
  api.get('/esims', requireAuth, async (c) => {
    const rows = await db.select().from(orders)
      .where(and(eq(orders.userId, c.get('userId')), inArray(orders.kind, ['esim', 'esim_topup'])))
      .orderBy(desc(orders.createdAt))
    const byId = new Map<string, { esimId: string; iccid?: string; productId: string; productName: string; country?: string; createdAt: string; history: ReturnType<OrderService['toDTO']>[]; lpa?: string }>()
    for (const r of rows.slice().reverse()) {
      const dto = svc.toDTO(r, { includeRedemption: true })
      const esimId = r.kind === 'esim' ? (dto.redemption?.esim?.esimId ?? dto.redemption?.esim?.iccid) : r.esimId
      if (!esimId) continue
      if (r.kind === 'esim' && r.status === 'delivered') {
        byId.set(esimId, { esimId, iccid: dto.redemption?.esim?.iccid, productId: r.productId, productName: r.productName, createdAt: dto.createdAt, history: [dto], lpa: dto.redemption?.esim?.lpa })
      } else if (r.kind === 'esim_topup' && byId.has(esimId)) {
        byId.get(esimId)!.history.push(dto)
      }
    }
    return c.json({ esims: [...byId.values()].reverse() })
  })

  // ── orders ────────────────────────────────────────────────────────
  const createSchema = z.object({
    kind: z.enum(ORDER_KINDS).optional(),
    productId: z.string().optional(),
    packageId: z.string().optional(),
    value: z.number().positive().optional(),
    phone: z.string().optional(),
    country: z.string().length(2).optional(),
    savedNumberId: z.string().optional(),
    esimId: z.string().optional(),
    requestCode: z.string().optional(),
    reorderOf: z.string().optional(),
  })

  api.post('/orders', requireAuth, async (c) => {
    const userId = c.get('userId')
    const body = createSchema.parse(await c.req.json())

    if (body.requestCode) {
      const [r] = await db.select().from(requests).where(eq(requests.code, body.requestCode.toUpperCase()))
      if (!r) throw new AppError(404, 'NOT_FOUND', 'Request not found.')
      if (r.status !== 'open' || r.expiresAt.getTime() < Date.now()) throw new AppError(409, 'REQUEST_CLOSED', 'This request was already paid or has expired.')
      // Reuse an open, unattempted order for this request by the same payer (no duplicate invoices).
      const [existing] = await db.select().from(orders).where(and(eq(orders.requestId, r.id), eq(orders.userId, userId), eq(orders.status, 'awaiting_payment')))
      if (existing) return c.json({ order: svc.toDTO(existing) })
      const phone = parsePhone(cipher.decrypt(r.recipientPhoneEnc))!
      const row = await svc.create({
        userId, kind: r.kind as OrderKind, productId: r.productId, packageId: r.packageId ?? undefined,
        value: r.packageId ? undefined : Number(r.value), phone: { e164: phone.e164, last4: phone.last4, callingCode: phone.callingCode }, requestId: r.id,
      })
      return c.json({ order: svc.toDTO(row, { requestCode: r.code }) }, 201)
    }

    if (body.reorderOf) {
      const prev = await svc.getForUser(body.reorderOf, userId)
      const phoneStr = svc.decryptPhone(prev)
      const phone = phoneStr ? parsePhone(phoneStr) : null
      const row = await svc.create({
        userId, kind: prev.kind as OrderKind, productId: prev.productId, packageId: prev.packageId ?? undefined,
        value: prev.packageId ? undefined : Number(prev.value),
        phone: phone ? { e164: phone.e164, last4: phone.last4, callingCode: phone.callingCode } : undefined,
        esimId: prev.esimId ?? undefined,
      })
      return c.json({ order: svc.toDTO(row) }, 201)
    }

    if (!body.kind || !body.productId) throw new AppError(400, 'INVALID_INPUT', 'kind and productId are required.')
    const phone = await resolvePhone(userId, body)
    if (body.kind === 'esim_topup' && body.esimId) {
      // The eSIM must belong to this user.
      const owned = await db.select({ id: orders.id, enc: orders.redemptionJsonEnc }).from(orders)
        .where(and(eq(orders.userId, userId), eq(orders.kind, 'esim'), eq(orders.status, 'delivered')))
      const ok = owned.some((o) => {
        if (!o.enc) return false
        const r = cipher.decryptJson<{ esim?: { esimId?: string; iccid?: string } }>(o.enc)
        return r.esim?.esimId === body.esimId || r.esim?.iccid === body.esimId
      })
      if (!ok) throw new AppError(404, 'NOT_FOUND', 'eSIM not found.')
    }
    const row = await svc.create({
      userId, kind: body.kind, productId: body.productId, packageId: body.packageId, value: body.value,
      phone: phone ? { e164: phone.e164, last4: phone.last4, callingCode: phone.callingCode } : undefined,
      esimId: body.esimId,
    })
    return c.json({ order: svc.toDTO(row) }, 201)
  })

  api.get('/orders', requireAuth, async (c) => {
    const q = z.object({ kind: z.enum(ORDER_KINDS).optional(), status: z.enum(ORDER_STATUSES).optional() }).parse(c.req.query())
    const rows = await svc.list(c.get('userId'), q)
    return c.json({ orders: rows.map((r) => svc.toDTO(r)) })
  })

  async function orderView(row: OrderRow) {
    let requestCode: string | null = null
    if (row.requestId) {
      const [r] = await db.select({ code: requests.code }).from(requests).where(eq(requests.id, row.requestId))
      requestCode = r?.code ?? null
    }
    return svc.toDTO(row, { includeRedemption: true, requestCode })
  }

  api.get('/orders/:id', requireAuth, async (c) => {
    let row = await svc.getForUser(c.req.param('id')!, c.get('userId'))
    // Opportunistic sync when the user is looking at an open order (at most every 3s).
    if (!isFinal(row.status as OrderStatus) && (!row.lastSyncedAt || Date.now() - row.lastSyncedAt.getTime() > 3000)) {
      row = await svc.sync(row).catch(() => row)
    }
    return c.json({ order: await orderView(row) })
  })

  api.get('/orders/:id/stream', async (c) => {
    // EventSource cannot send headers → token in query string
    const token = c.req.query('token')
    const sid = readToken(env.SESSION_SECRET, token)
    const [s] = sid ? await db.select().from(sessions).where(eq(sessions.id, sid)) : []
    if (!s?.userId || s.nonce || s.expiresAt.getTime() < Date.now()) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in again.')
    const id = c.req.param('id')!
    await svc.getForUser(id, s.userId)
    return streamSSE(c, async (stream) => {
      let last = ''
      const started = Date.now()
      let tick = 0
      while (!stream.aborted && Date.now() - started < 5 * 60_000) {
        let row = (await svc.get(id))!
        if (!isFinal(row.status as OrderStatus) && tick % 2 === 0) row = await svc.sync(row).catch(() => row)
        const dto = await orderView(row)
        const sig = `${dto.status}|${dto.updatedAt}|${dto.bolt11 ?? ''}`
        if (sig !== last) {
          last = sig
          await stream.writeSSE({ event: 'order', data: JSON.stringify(dto) })
        }
        if (isFinal(dto.status)) break
        tick++
        await stream.sleep(2000)
      }
    })
  })

  api.post('/orders/:id/paid', requireAuth, async (c) => {
    const body = z.object({ hash: z.string().max(200).optional(), swapId: z.string().max(200).optional(), uncertain: z.boolean().optional() }).parse(await c.req.json().catch(() => ({})))
    const row = await svc.getForUser(c.req.param('id')!, c.get('userId'))
    const updated = await svc.markPaymentSubmitted(row, body)
    return c.json({ order: await orderView(updated) })
  })

  api.post('/orders/:id/refresh-invoice', requireAuth, async (c) => {
    const row = await svc.getForUser(c.req.param('id')!, c.get('userId'))
    const updated = await svc.refreshInvoice(row)
    return c.json({ order: await orderView(updated) })
  })

  /** Public, privacy-safe receipt for sharing */
  api.get('/receipts/:token', async (c) => {
    const [row] = await db.select().from(orders).where(eq(orders.receiptToken, c.req.param('token')!))
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Receipt not found.')
    const dto = svc.toDTO(row)
    return c.json({
      receipt: {
        id: dto.id, kind: dto.kind, status: dto.status, productName: dto.productName, packageLabel: dto.packageLabel,
        recipientMasked: dto.recipientMasked, priceUsd: dto.priceUsd, priceSats: dto.priceSats, createdAt: dto.createdAt, updatedAt: dto.updatedAt,
      },
    })
  })

  // ── saved numbers ─────────────────────────────────────────────────
  api.get('/saved-numbers', requireAuth, async (c) => {
    const rows = await db.select().from(savedNumbers).where(eq(savedNumbers.userId, c.get('userId'))).orderBy(desc(savedNumbers.createdAt))
    return c.json({ savedNumbers: rows.map(savedDTO) })
  })

  api.post('/saved-numbers', requireAuth, async (c) => {
    const body = z.object({
      nickname: z.string().trim().min(1).max(40),
      phone: z.string().optional(), country: z.string().length(2).optional(),
      orderId: z.string().optional(), operatorId: z.string().max(100).optional(),
    }).parse(await c.req.json())
    const userId = c.get('userId')
    let e164: string | null = null
    if (body.orderId) e164 = svc.decryptPhone(await svc.getForUser(body.orderId, userId))
    else if (body.phone) e164 = body.phone
    const parsed = e164 ? parsePhone(e164, body.country) : null
    if (!parsed) throw new AppError(400, 'INVALID_PHONE', 'That phone number does not look right.')
    const count = await db.select({ id: savedNumbers.id }).from(savedNumbers).where(eq(savedNumbers.userId, userId))
    if (count.length >= 30) throw new AppError(409, 'TOO_MANY', 'You can save up to 30 numbers.')
    const [row] = await db.insert(savedNumbers).values({
      id: randomId('n_'), userId, nickname: body.nickname, phoneEnc: cipher.encrypt(parsed.e164),
      phoneLast4: parsed.last4, callingCode: parsed.callingCode, country: parsed.country, operatorId: body.operatorId ?? null,
    }).returning()
    return c.json({ savedNumber: savedDTO(row) }, 201)
  })

  api.patch('/saved-numbers/:id', requireAuth, async (c) => {
    const body = z.object({ nickname: z.string().trim().min(1).max(40) }).parse(await c.req.json())
    const [row] = await db.update(savedNumbers).set({ nickname: body.nickname })
      .where(and(eq(savedNumbers.id, c.req.param('id')!), eq(savedNumbers.userId, c.get('userId')))).returning()
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Saved number not found.')
    return c.json({ savedNumber: savedDTO(row) })
  })

  api.delete('/saved-numbers/:id', requireAuth, async (c) => {
    await db.delete(savedNumbers).where(and(eq(savedNumbers.id, c.req.param('id')!), eq(savedNumbers.userId, c.get('userId'))))
    return c.json({ ok: true })
  })

  // ── top-up requests ───────────────────────────────────────────────
  api.post('/requests', requireAuth, async (c) => {
    const body = z.object({
      kind: z.enum(['airtime', 'data']),
      productId: z.string(), packageId: z.string().optional(), value: z.number().positive().optional(),
      phone: z.string().optional(), country: z.string().length(2).optional(), savedNumberId: z.string().optional(),
      note: z.string().trim().max(140).optional(),
    }).parse(await c.req.json())
    const userId = c.get('userId')
    const phone = await resolvePhone(userId, body)
    if (!phone) throw new AppError(400, 'PHONE_REQUIRED', 'Enter a phone number.')
    let product
    try { product = await provider.getProduct(body.productId) } catch (e) { throw mapProviderError(e) }
    let label: string | undefined
    let value: number | undefined
    if (body.packageId) {
      const pk = product.packages.find((p) => p.id === body.packageId)
      if (!pk) throw new AppError(400, 'UNKNOWN_PACKAGE', 'That package is no longer available.')
      label = pk.label; value = pk.value
    } else if (body.value && product.range) {
      if (body.value < product.range.min || body.value > product.range.max) throw new AppError(400, 'VALUE_OUT_OF_RANGE', `Amount must be between ${product.range.min} and ${product.range.max} ${product.currency}.`)
      value = body.value
      label = formatMoney(body.value, product.currency)
    } else throw new AppError(400, 'PACKAGE_REQUIRED', 'Choose a package or amount.')
    const open = await db.select({ id: requests.id }).from(requests).where(and(eq(requests.requesterUserId, userId), eq(requests.status, 'open')))
    if (open.length >= 20) throw new AppError(409, 'TOO_MANY', 'You have too many open requests.')
    let code = randomCode(8)
    for (let i = 0; i < 3; i++) {
      const [exists] = await db.select({ id: requests.id }).from(requests).where(eq(requests.code, code))
      if (!exists) break
      code = randomCode(8)
    }
    const [row] = await db.insert(requests).values({
      id: randomId('r_'), code, requesterUserId: userId, kind: body.kind, productId: product.id, productName: product.name,
      packageId: body.packageId ?? null, packageLabel: label ?? null, value: value !== undefined ? String(value) : null, currency: product.currency,
      recipientPhoneEnc: cipher.encrypt(phone.e164), recipientLast4: phone.last4, recipientCallingCode: phone.callingCode,
      note: body.note || null, status: 'open', expiresAt: new Date(Date.now() + 7 * 86400_000),
    }).returning()
    return c.json({ request: await requestDTO(row, userId), url: `${appUrl}/r/${row.code}` }, 201)
  })

  api.get('/requests', requireAuth, async (c) => {
    const rows = await db.select().from(requests).where(eq(requests.requesterUserId, c.get('userId'))).orderBy(desc(requests.createdAt)).limit(50)
    return c.json({ requests: await Promise.all(rows.map((r) => requestDTO(r, c.get('userId')))) })
  })

  api.get('/requests/:code', async (c) => {
    const [row] = await db.select().from(requests).where(eq(requests.code, c.req.param('code')!.toUpperCase()))
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Request not found.')
    const viewer = await authUser(c)
    return c.json({ request: await requestDTO(row, viewer?.userId) })
  })

  api.delete('/requests/:code', requireAuth, async (c) => {
    await db.update(requests).set({ status: 'expired' })
      .where(and(eq(requests.code, c.req.param('code')!.toUpperCase()), eq(requests.requesterUserId, c.get('userId')), eq(requests.status, 'open')))
    return c.json({ ok: true })
  })

  // ── provider webhook & cron ───────────────────────────────────────
  api.post('/webhooks/bitrefill', async (c) => {
    if (env.WEBHOOK_TOKEN && !safeEqual(c.req.query('token') ?? '', env.WEBHOOK_TOKEN)) return c.json({ ok: false }, 401)
    const body = await c.req.json().catch(() => ({})) as any
    const invoiceId = String(body?.id ?? body?.invoice_id ?? body?.data?.id ?? body?.invoice?.id ?? '')
    if (invoiceId) {
      // Webhooks are unsigned → only a trigger. State always comes from GET /invoices/{id}.
      await svc.syncByInvoiceId(invoiceId).catch((e) => console.error('[loadup] webhook sync failed', e))
    }
    return c.json({ ok: true })
  })

  api.all('/cron/tick', async (c) => {
    if (env.CRON_SECRET) {
      const auth = c.req.header('authorization') ?? ''
      if (!safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) return c.json({ ok: false }, 401)
    } else if (env.NODE_ENV === 'production') {
      return c.json({ ok: false, message: 'CRON_SECRET not set' }, 403)
    }
    return c.json({ ok: true, ...(await runCron()) })
  })

  async function runCron() {
    const res = await svc.tick()
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
    await db.update(requests).set({ status: 'expired' }).where(and(eq(requests.status, 'open'), lt(requests.expiresAt, new Date())))
    return res
  }

  // ── dev only: simulate a Lightning payment with the mock provider ──
  if (provider instanceof MockProvider && env.NODE_ENV !== 'production') {
    api.post('/dev/mock/pay', async (c) => {
      const { bolt11 } = await c.req.json() as { bolt11: string }
      const inv = [...provider.invoices.values()].find((i) => i.bolt11 === bolt11)
      if (!inv) return c.json({ error: 'NOT_FOUND' }, 404)
      const ok = provider.simulatePayment(inv.id)
      return c.json({ ok, hash: 'mockhash_' + inv.id, swapId: 'mockswap_' + inv.id })
    })
    api.post('/dev/mock/expire/:orderId', async (c) => {
      const row = await svc.get(c.req.param('orderId')!)
      if (!row?.providerInvoiceId) return c.json({ error: 'NOT_FOUND' }, 404)
      provider.expire(row.providerInvoiceId)
      await db.update(orders).set({ invoiceExpiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, row.id))
      return c.json({ ok: true })
    })
  }

  api.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'Not found' }, 404))
  app.route('/api', api)

  return { app, services: { orders: svc }, runCron }
}
