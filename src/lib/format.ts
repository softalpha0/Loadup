export function money(value: number | null | undefined, currency: string | null | undefined, locale = 'en'): string {
  if (value == null || !currency) return ''
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: value % 1 ? 2 : 0 }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}

export function usd(value: number | null | undefined, locale = 'en'): string {
  if (value == null) return ''
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

export function sats(n: number | null | undefined, locale = 'en'): string {
  if (n == null) return ''
  return `${new Intl.NumberFormat(locale).format(n)} sats`
}

export function nim(luna: number, locale = 'en'): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(luna / 1e5)} NIM`
}

export function dateTime(iso: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export function relative(iso: string, locale = 'en'): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function flag(country: string): string {
  if (!/^[A-Z]{2}$/i.test(country)) return '🌐'
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export function countryName(code: string, locale = 'en'): string {
  try { return new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase()) ?? code } catch { return code }
}

export function shortAddress(a: string): string {
  const parts = a.split(' ')
  return parts.length > 4 ? `${parts[0]} ${parts[1]} … ${parts[parts.length - 1]}` : a
}
