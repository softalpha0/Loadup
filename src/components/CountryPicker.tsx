import { useMemo, useState } from 'react'
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js'
import { countryName, flag } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { IconSearch, IconX } from './icons'

export function useCountries() {
  const { locale } = useI18n()
  return useMemo(() => getCountries()
    .map((c) => ({ code: c, name: countryName(c, locale), dial: getCountryCallingCode(c as CountryCode) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale)), [locale])
}

export function CountryPicker({ value, onChange, showDial = true }: { value: string; onChange: (c: string) => void; showDial?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const { t } = useI18n()
  const countries = useCountries()
  const current = countries.find((c) => c.code === value)
  const filtered = countries.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase() === q.toLowerCase() || c.dial.startsWith(q.replace('+', '')))
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('phone.country')}
        className="h-12 shrink-0 rounded-xl border border-app bg-surface px-3 flex items-center gap-1.5 font-medium">
        <span className="text-xl">{flag(value)}</span>{showDial && current && <span>+{current.dial}</span>}
        {!showDial && <span>{current?.name ?? value}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="bg-surface w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[80vh] flex flex-col pb-safe" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 h-11 rounded-xl bg-surface-2 px-3">
                <IconSearch size={18} className="text-muted" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} className="bg-transparent outline-none flex-1" />
              </div>
              <button className="h-11 w-11 grid place-items-center" onClick={() => setOpen(false)} aria-label={t('common.close')}><IconX /></button>
            </div>
            <ul className="overflow-y-auto px-2 pb-4">
              {filtered.map((c) => (
                <li key={c.code}>
                  <button className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-2 text-left" onClick={() => { onChange(c.code); setOpen(false); setQ('') }}>
                    <span className="text-xl">{flag(c.code)}</span><span className="flex-1">{c.name}</span>
                    {showDial && <span className="text-muted">+{c.dial}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}

export function defaultCountry(): string {
  try {
    const stored = localStorage.getItem('loadup:country')
    if (stored) return stored
  } catch { /* ignore */ }
  const region = navigator.language.split('-')[1]
  return region && /^[A-Z]{2}$/.test(region) ? region : 'NG'
}
export function rememberCountry(c: string) {
  try { localStorage.setItem('loadup:country', c) } catch { /* ignore */ }
}
