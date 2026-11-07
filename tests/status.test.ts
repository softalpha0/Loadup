import { describe, it, expect } from 'vitest'
import { mapProviderStatus, normalizeInvoiceStatus, normalizeOrderStatus } from '../shared/status'

describe('status mapping', () => {
  const m = (o: Parameters<typeof mapProviderStatus>[0]) => mapProviderStatus(o)

  it('maps the happy path', () => {
    expect(m({ invoice: 'unpaid', current: 'awaiting_payment' }).status).toBe('awaiting_payment')
    expect(m({ invoice: 'payment_detected', current: 'awaiting_payment' }).status).toBe('paid')
    expect(m({ invoice: 'payment_confirmed', current: 'paid' }).status).toBe('processing')
    expect(m({ invoice: 'pending', order: 'processing', current: 'paid' }).status).toBe('processing')
    expect(m({ invoice: 'complete', order: 'delivered', current: 'processing' }).status).toBe('delivered')
    expect(m({ invoice: 'complete', current: 'processing' }).status).toBe('delivered')
  })

  it('maps failures', () => {
    expect(m({ invoice: 'complete', order: 'failed', current: 'processing' })).toEqual({ status: 'failed', reason: 'provider_failed' })
    expect(m({ invoice: 'complete', order: 'refunded', current: 'processing' })).toEqual({ status: 'failed', reason: 'refunded' })
    expect(m({ invoice: 'denied', current: 'paid' }).status).toBe('failed')
    expect(m({ invoice: 'blocked', current: 'paid' }).status).toBe('failed')
    expect(m({ invoice: 'payment_error', current: 'paid' }).status).toBe('failed')
  })

  it('expires unpaid invoices only when no payment was attempted', () => {
    expect(m({ invoice: 'unpaid', invoiceExpired: true, current: 'awaiting_payment' }).status).toBe('expired')
    expect(m({ invoice: 'expired', current: 'awaiting_payment' }).status).toBe('expired')
    expect(m({ invoice: 'expired', paymentAttempted: true, current: 'paid' })).toEqual({ status: 'failed', reason: 'payment_not_received' })
    expect(m({ invoice: 'unpaid', paymentAttempted: true, current: 'awaiting_payment' }).status).toBe('paid')
  })

  it('never moves backwards and keeps final states', () => {
    expect(m({ invoice: 'payment_detected', current: 'processing' }).status).toBe('processing')
    expect(m({ invoice: 'unpaid', current: 'delivered' }).status).toBe('delivered')
    expect(m({ invoice: 'complete', order: 'delivered', current: 'failed' }).status).toBe('failed')
  })

  it('normalises provider strings', () => {
    expect(normalizeInvoiceStatus('Payment-Detected')).toBe('payment_detected')
    expect(normalizeInvoiceStatus('completed')).toBe('complete')
    expect(normalizeInvoiceStatus('weird')).toBe('unknown')
    expect(normalizeOrderStatus('complete')).toBe('delivered')
    expect(normalizeOrderStatus('pending')).toBe('processing')
  })
})
