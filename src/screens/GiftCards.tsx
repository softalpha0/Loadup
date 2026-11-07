import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Product } from '../../shared/types'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { errorText } from '../lib/errors'
import { useOrderCreate } from '../lib/useOrderCreate'
import { flag, money } from '../lib/format'
import { Button, Card, Empty, Input, Notice, Screen, Spinner, cx } from '../components/ui'
import { CountryPicker, defaultCountry } from '../components/CountryPicker'
import { IconGift, IconSearch } from '../components/icons'

export default function GiftCards() {
  const { t, tMaybe } = useI18n()
  const nav = useNavigate()
  const [country, setCountry] = useState(defaultCountry)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [list, setList] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(id) }, [q])
  useEffect(() => {
    setList(null); setError(null)
    const qs = new URLSearchParams({ type: 'giftcard', country, ...(debounced ? { q: debounced } : {}) })
    api<{ products: Product[] }>(`/products?${qs}`, { auth: false }).then((r) => setList(r.products)).catch((e) => setError(errorText(e, tMaybe)))
  }, [country, debounced, tMaybe])
  return (
    <Screen title={t('gift.title')} back="/">
      <div className="mt-2 flex gap-2">
        <CountryPicker value={country} onChange={setCountry} showDial={false} />
        <div className="flex-1 flex items-center gap-2 h-12 rounded-xl border border-app bg-surface px-3 min-w-0">
          <IconSearch size={18} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('gift.search')} aria-label={t('gift.search')} className="bg-transparent outline-none flex-1 min-w-0" />
        </div>
      </div>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      {!list && !error && <div className="py-10 grid place-items-center"><Spinner /></div>}
      {list?.length === 0 && <Empty>{t('gift.none')}</Empty>}
      <div className="grid grid-cols-2 gap-3 mt-4">
        {list?.map((p) => (
          <button key={p.id} onClick={() => nav(`/gift/${encodeURIComponent(p.id)}`)} className="rounded-2xl bg-surface border border-app p-3 text-left active:scale-[.98] transition">
            <div className="aspect-[3/2] rounded-xl bg-surface-2 grid place-items-center overflow-hidden mb-2">
              {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-contain" /> : <IconGift size={32} className="text-pink-500" />}
            </div>
            <div className="font-semibold truncate">{p.name}</div>
            <div className="text-xs text-muted">{flag(p.country)} {p.currency}</div>
          </button>
        ))}
      </div>
    </Screen>
  )
}

export function GiftCardProduct() {
  const { id } = useParams<{ id: string }>()
  const { t, tMaybe, locale } = useI18n()
  const [p, setP] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pkg, setPkg] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const order = useOrderCreate()
  useEffect(() => {
    api<{ product: Product }>(`/products/${encodeURIComponent(id!)}`, { auth: false }).then((r) => setP(r.product)).catch((e) => setError(errorText(e, tMaybe)))
  }, [id, tMaybe])
  const v = Number(custom)
  const customOk = p?.range && custom !== '' && v >= p.range.min && v <= p.range.max
  return (
    <Screen title={p?.name ?? t('gift.title')} back>
      {error && <Notice>{error}</Notice>}
      {!p && !error && <div className="py-10 grid place-items-center"><Spinner /></div>}
      {p && (
        <div className="space-y-4 mt-2">
          <Card className="flex items-center gap-3">
            <div className="h-14 w-20 rounded-xl bg-surface-2 grid place-items-center overflow-hidden">{p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-contain" /> : <IconGift className="text-pink-500" />}</div>
            <div className="min-w-0"><div className="font-semibold">{p.name}</div><div className="text-sm text-muted">{flag(p.country)} {p.currency}</div></div>
          </Card>
          {p.description && <p className="text-sm text-muted line-clamp-4">{p.description}</p>}
          <div className="text-sm font-semibold text-muted">{t('gift.values')}</div>
          <div className="grid grid-cols-3 gap-2">
            {p.packages.map((pk) => (
              <button key={pk.id} aria-pressed={pkg === pk.id} onClick={() => { setPkg(pk.id); setCustom('') }}
                className={cx('rounded-2xl border p-3 font-bold', pkg === pk.id ? 'border-brand-600 ring-2 ring-brand-500/30 bg-brand-500/5' : 'border-app bg-surface')}>
                {pk.label}
                {pk.priceUsd != null && <span className="block text-xs font-normal text-muted">≈ ${pk.priceUsd.toFixed(2)}</span>}
              </button>
            ))}
          </div>
          {p.range && (
            <Input label={t('packages.custom')} inputMode="decimal" value={custom} onChange={(e) => { setCustom(e.target.value.replace(/[^0-9.]/g, '')); setPkg(null) }}
              hint={t('packages.customHint', { min: money(p.range.min, p.currency, locale), max: money(p.range.max, p.currency, locale) })}
              error={custom && !customOk ? t('packages.invalidAmount', { min: p.range.min, max: p.range.max }) : null} />
          )}
          {order.error && <Notice>{order.error}</Notice>}
          <Button disabled={!pkg && !customOk} loading={order.busy}
            onClick={() => order.create({ kind: 'giftcard', productId: p.id, ...(pkg ? { packageId: pkg } : { value: v }) })}>{t('packages.review')}</Button>
        </div>
      )}
    </Screen>
  )
}
