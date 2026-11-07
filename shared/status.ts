import type { OrderStatus } from './types'

/** Bitrefill invoice states */
export type ProviderInvoiceStatus =
  | 'unpaid'
  | 'payment_detected'
  | 'payment_confirmed'
  | 'pending'
  | 'complete'
  | 'blocked'
  | 'denied'
  | 'payment_error'
  | 'expired'
  | 'unknown'

/** Bitrefill order states */
export type ProviderOrderStatus =
  | 'created'
  | 'payment_detected'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'refunded'
  | 'unknown'

export function normalizeInvoiceStatus(raw: unknown): ProviderInvoiceStatus {
  const s = String(raw ?? '').toLowerCase().replace(/[\s-]/g, '_')
  const known: ProviderInvoiceStatus[] = [
    'unpaid', 'payment_detected', 'payment_confirmed', 'pending', 'complete',
    'blocked', 'denied', 'payment_error', 'expired',
  ]
  if ((known as string[]).includes(s)) return s as ProviderInvoiceStatus
  if (s === 'completed' || s === 'paid_and_delivered') return 'complete'
  if (s === 'not_paid' || s === 'open' || s === 'created') return 'unpaid'
  if (s === 'failed' || s === 'error') return 'payment_error'
  return 'unknown'
}

export function normalizeOrderStatus(raw: unknown): ProviderOrderStatus {
  const s = String(raw ?? '').toLowerCase().replace(/[\s-]/g, '_')
  const known: ProviderOrderStatus[] = ['created', 'payment_detected', 'processing', 'delivered', 'failed', 'refunded']
  if ((known as string[]).includes(s)) return s as ProviderOrderStatus
  if (s === 'complete' || s === 'completed' || s === 'success') return 'delivered'
  if (s === 'pending' || s === 'in_progress') return 'processing'
  if (s === 'refund' || s === 'refunding') return 'refunded'
  if (s === 'error' || s === 'denied' || s === 'blocked') return 'failed'
  return 'unknown'
}

export interface StatusInput {
  invoice: ProviderInvoiceStatus
  /** Status of the provider order(s) belonging to the invoice, if any */
  order?: ProviderOrderStatus
  /** True when the Lightning invoice expiry has passed */
  invoiceExpired?: boolean
  /** True once the user submitted (or may have submitted) a payment */
  paymentAttempted?: boolean
  current: OrderStatus
}

const RANK: Record<OrderStatus, number> = {
  created: 0, awaiting_payment: 1, paid: 2, processing: 3, delivered: 4, failed: 4, expired: 4,
}

/**
 * Maps provider invoice/order states to a Loadup order status.
 * Statuses never move backwards (e.g. processing → paid) and final states are sticky.
 */
export function mapProviderStatus(input: StatusInput): { status: OrderStatus; reason?: string } {
  const { invoice, order, invoiceExpired, paymentAttempted, current } = input
  if (current === 'delivered' || current === 'failed' || current === 'expired') return { status: current }

  let next: OrderStatus = current
  let reason: string | undefined

  if (order === 'delivered' || (invoice === 'complete' && (!order || order === 'unknown'))) {
    next = 'delivered'
  } else if (order === 'failed') {
    next = 'failed'; reason = 'provider_failed'
  } else if (order === 'refunded') {
    next = 'failed'; reason = 'refunded'
  } else if (invoice === 'blocked' || invoice === 'denied') {
    next = 'failed'; reason = 'provider_' + invoice
  } else if (invoice === 'payment_error') {
    next = 'failed'; reason = 'payment_error'
  } else if (order === 'processing' || invoice === 'pending' || invoice === 'payment_confirmed') {
    next = 'processing'
  } else if (order === 'payment_detected' || invoice === 'payment_detected') {
    next = 'paid'
  } else if (invoice === 'expired' || (invoice === 'unpaid' && invoiceExpired)) {
    // Never paid. If the user attempted a payment we cannot just "refresh" — the
    // order is closed as failed so it is never paid twice.
    if (paymentAttempted) { next = 'failed'; reason = 'payment_not_received' }
    else { next = 'expired'; reason = 'invoice_expired' }
  } else if (invoice === 'unpaid') {
    next = paymentAttempted ? 'paid' : 'awaiting_payment'
  }

  if (RANK[next] < RANK[current]) return { status: current }
  return { status: next, reason }
}

export function isFinal(s: OrderStatus): boolean {
  return s === 'delivered' || s === 'failed' || s === 'expired'
}
