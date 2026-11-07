export interface LimitConfig {
  perOrderUsd: number
  perDayUsd: number
}

export type LimitResult =
  | { ok: true }
  | { ok: false; code: 'LIMIT_PER_ORDER' | 'LIMIT_PER_DAY'; limitUsd: number; remainingUsd: number }

/**
 * @param orderUsd  price of the new order in USD
 * @param usedTodayUsd  USD already paid today plus open (unexpired, unpaid) invoices
 */
export function checkLimits(orderUsd: number, usedTodayUsd: number, cfg: LimitConfig): LimitResult {
  const cents = (n: number) => Math.round(n * 100)
  if (!Number.isFinite(orderUsd) || orderUsd < 0) {
    return { ok: false, code: 'LIMIT_PER_ORDER', limitUsd: cfg.perOrderUsd, remainingUsd: 0 }
  }
  if (cents(orderUsd) > cents(cfg.perOrderUsd)) {
    return { ok: false, code: 'LIMIT_PER_ORDER', limitUsd: cfg.perOrderUsd, remainingUsd: cfg.perOrderUsd }
  }
  const remaining = Math.max(0, cents(cfg.perDayUsd) - cents(usedTodayUsd)) / 100
  if (cents(usedTodayUsd) + cents(orderUsd) > cents(cfg.perDayUsd)) {
    return { ok: false, code: 'LIMIT_PER_DAY', limitUsd: cfg.perDayUsd, remainingUsd: remaining }
  }
  return { ok: true }
}

/** UTC day key used by the limits table, e.g. "2026-11-07" */
export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}
