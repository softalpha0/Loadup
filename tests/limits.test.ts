import { describe, it, expect } from 'vitest'
import { checkLimits, dayKey } from '../shared/limits'

const cfg = { perOrderUsd: 100, perDayUsd: 300 }

describe('limits', () => {
  it('allows orders within both limits', () => {
    expect(checkLimits(100, 200, cfg)).toEqual({ ok: true })
    expect(checkLimits(0.5, 0, cfg)).toEqual({ ok: true })
  })
  it('blocks orders above the per-order limit', () => {
    expect(checkLimits(100.01, 0, cfg)).toMatchObject({ ok: false, code: 'LIMIT_PER_ORDER' })
  })
  it('blocks orders above the daily limit and reports what is left', () => {
    expect(checkLimits(50, 260, cfg)).toEqual({ ok: false, code: 'LIMIT_PER_DAY', limitUsd: 300, remainingUsd: 40 })
  })
  it('rejects non-finite amounts', () => {
    expect(checkLimits(NaN, 0, cfg).ok).toBe(false)
    expect(checkLimits(-1, 0, cfg).ok).toBe(false)
  })
  it('handles float rounding', () => {
    expect(checkLimits(0.1 + 0.2, 299.7, cfg).ok).toBe(true)
  })
  it('uses UTC day keys', () => {
    expect(dayKey(new Date('2026-11-07T23:59:59Z'))).toBe('2026-11-07')
  })
})
