import type { AppConfig } from '../../shared/types'
import { interpolate } from './i18n'

export function supportHref(cfg: AppConfig | null, orderId: string, status: string, tpl: { subject: string; body: string }): string {
  const vars = { id: orderId, status }
  if (cfg?.supportUrl) {
    const u = new URL(cfg.supportUrl)
    u.searchParams.set('order', orderId)
    return u.toString()
  }
  const to = cfg?.supportEmail ?? ''
  return `mailto:${to}?subject=${encodeURIComponent(interpolate(tpl.subject, vars))}&body=${encodeURIComponent(interpolate(tpl.body, vars))}`
}
