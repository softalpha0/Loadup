import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { OrderDTO, Product } from '../../shared/types'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { errorText } from '../lib/errors'
import { useOrderCreate } from '../lib/useOrderCreate'
import { countryName, dateTime, flag } from '../lib/format'
import { Button, Card, Empty, Notice, Screen, SectionTitle, Spinner, StatusBadge, cx } from '../components/ui'
import { useCountries } from '../components/CountryPicker'
import { IconSearch, IconSim } from '../components/icons'

const POPULAR = ['US', 'JP', 'FR', 'GB', 'TH', 'TR', 'AE', 'ES', 'IT', 'MX', 'BR', 'NG']

export default function Esim() {
  const { t, locale } = useI18n()
  const countries = useCountries()
  const [q, setQ] = useState('')
  const [params, setParams] = useSearchParams()
  const country = params.get('country')
  const matches = q.length >= 2 ? countries.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []

  if (country) return <EsimPlans country={country} onBack={() => setParams({})} />

  return (
    <Screen title={t('esim.title')} back="/">
      <div className="mt-2 flex items-center gap-2 h-12 rounded-xl border border-app bg-surface px-3">
        <IconSearch size={18} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('esim.search')} aria-label={t('esim.search')} className="bg-transparent outline-none flex-1 text-base" />
      </div>
      {matches.length > 0 && (
        <div className="mt-2 space-y-1">
          {matches.map((c) => (
            <button key={c.code} onClick={() => setParams({ country: c.code })} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-surface border border-app text-left">
              <span className="text-xl">{flag(c.code)}</span>{c.name}
            </button>
          ))}
        </div>
      )}
      <SectionTitle>{t('esim.popular')}</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {POPULAR.map((c) => (
          <button key={c} onClick={() => setParams({ country: c })} className="rounded-2xl bg-surface border border-app py-3 px-2 text-center">
            <div className="text-2xl">{flag(c)}</div>
            <div className="text-sm font-medium truncate">{countryName(c, locale)}</div>
          </button>
        ))}
      </div>
      <Link to="/esims" className="mt-6 flex items-center justify-center gap-2 text-brand-600 font-medium"><IconSim size={18} />{t('esim.mine')}</Link>
    </Screen>
  )
}

function PlanList({ products, onPick, busyId }: { products: Product[]; onPick: (p: Product, pk: Product['packages'][number]) => void; busyId?: string | null }) {
  const { t } = useI18n()
  return (
    <div className="space-y-2">
      {products.flatMap((p) => p.packages.map((pk) => (
        <Card key={pk.id} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg">{pk.label}</div>
            <div className="text-sm text-muted truncate">{p.name}{pk.priceUsd != null && ` · ${t('common.approx', { v: `$${pk.priceUsd.toFixed(2)}` })}`}</div>
          </div>
          <Button full={false} loading={busyId === pk.id} disabled={!!busyId} onClick={() => onPick(p, pk)}>{t('esim.buy')}</Button>
        </Card>
      )))}
    </div>
  )
}

function usePlans(country: string) {
  const { tMaybe } = useI18n()
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setProducts(null)
    api<{ products: Product[] }>(`/esims/products?country=${country}`, { auth: false })
      .then((r) => setProducts(r.products.sort((a, b) => (a.packages[0]?.priceUsd ?? 0) - (b.packages[0]?.priceUsd ?? 0))))
      .catch((e) => setError(errorText(e, tMaybe)))
  }, [country, tMaybe])
  return { products, error }
}

function EsimPlans({ country, onBack }: { country: string; onBack: () => void }) {
  const { t, locale } = useI18n()
  const { products, error } = usePlans(country)
  const order = useOrderCreate()
  const [busy, setBusy] = useState<string | null>(null)
  return (
    <Screen title={`${flag(country)} ${countryName(country, locale)}`} back>
      <button className="sr-only" onClick={onBack}>{t('common.back')}</button>
      <SectionTitle>{t('esim.plans')}</SectionTitle>
      {error && <Notice>{error}</Notice>}
      {order.error && <div className="mb-3"><Notice>{order.error}</Notice></div>}
      {!products && !error && <div className="py-10 grid place-items-center"><Spinner /></div>}
      {products && products.length === 0 && <Empty>{t('esim.noPlans')}</Empty>}
      {products && <PlanList products={products} busyId={busy} onPick={async (p, pk) => { setBusy(pk.id); await order.create({ kind: 'esim', productId: p.id, packageId: pk.id }); setBusy(null) }} />}
    </Screen>
  )
}

interface MyEsim { esimId: string; iccid?: string; productId: string; productName: string; createdAt: string; history: OrderDTO[]; lpa?: string }

export function MyEsims() {
  const { t, tMaybe, locale } = useI18n()
  const [list, setList] = useState<MyEsim[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api<{ esims: MyEsim[] }>('/esims').then((r) => setList(r.esims)).catch((e) => setError(errorText(e, tMaybe))) }, [tMaybe])
  return (
    <Screen title={t('esim.mine')} back>
      {error && <Notice>{error}</Notice>}
      {!list && !error && <div className="py-10 grid place-items-center"><Spinner /></div>}
      {list?.length === 0 && (
        <div className="text-center"><Empty>{t('esim.none')}</Empty><Link to="/esim"><Button>{t('home.esim')}</Button></Link></div>
      )}
      <div className="space-y-3 mt-2">
        {list?.map((e) => (
          <Card key={e.esimId}>
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-teal-500/10 text-teal-600 grid place-items-center"><IconSim /></span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{e.productName}</div>
                <div className="text-xs text-muted truncate">{e.iccid ? `ICCID ${e.iccid}` : e.esimId}</div>
              </div>
              <Link to={`/esims/${encodeURIComponent(e.esimId)}/topup?product=${encodeURIComponent(e.productId)}`}><Button full={false} className="min-h-10 text-sm">{t('esim.topup')}</Button></Link>
            </div>
            <div className="mt-3 text-sm font-semibold text-muted">{t('esim.history')}</div>
            <ul className="mt-1 divide-y divide-[var(--border)]">
              {e.history.map((h) => (
                <li key={h.id}>
                  <Link to={`/order/${h.id}`} className="flex items-center justify-between py-2 gap-2">
                    <span>{h.packageLabel}<span className="block text-xs text-muted">{h.kind === 'esim' ? t('esim.purchased') : t('kinds.esim_topup')} · {dateTime(h.createdAt, locale)}</span></span>
                    <StatusBadge status={h.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </Screen>
  )
}

export function EsimTopup() {
  const { esimId } = useParams<{ esimId: string }>()
  const [params] = useSearchParams()
  const { t, tMaybe } = useI18n()
  const productId = params.get('product')
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const order = useOrderCreate()
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    if (!productId) return
    api<{ product: Product }>(`/products/${encodeURIComponent(productId)}`, { auth: false })
      .then((r) => setProducts([r.product])).catch((e) => setError(errorText(e, tMaybe)))
  }, [productId, tMaybe])
  return (
    <Screen title={t('esim.topupTitle')} back>
      <p className={cx('text-sm text-muted mt-1 mb-3 break-all')}>{esimId}</p>
      {error && <Notice>{error}</Notice>}
      {order.error && <div className="mb-3"><Notice>{order.error}</Notice></div>}
      {!products && !error && <div className="py-10 grid place-items-center"><Spinner /></div>}
      {products && <PlanList products={products} busyId={busy} onPick={async (p, pk) => { setBusy(pk.id); await order.create({ kind: 'esim_topup', productId: p.id, packageId: pk.id, esimId }); setBusy(null) }} />}
    </Screen>
  )
}
