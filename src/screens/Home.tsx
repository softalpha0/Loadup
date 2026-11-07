import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { Empty, Screen, SectionTitle, PoweredBy } from '../components/ui'
import { IconGift, IconGlobe, IconPhone, IconPlus, IconSim, IconLink } from '../components/icons'
import { OrderRow } from '../components/OrderRow'
import { flag } from '../lib/format'

export default function Home() {
  const { t } = useI18n()
  const { me, refresh } = useAuth()
  const nav = useNavigate()
  useEffect(() => { refresh() }, [refresh])

  const tile = (to: string, title: string, sub: string, icon: React.ReactNode, cls: string, big = false) => (
    <Link to={to} className={`rounded-3xl p-4 text-white shadow-md active:scale-[.98] transition flex flex-col justify-between ${cls} ${big ? 'col-span-2 min-h-36' : 'min-h-32'}`}>
      <span className="h-11 w-11 rounded-2xl bg-white/20 grid place-items-center">{icon}</span>
      <span>
        <span className="block text-lg font-bold leading-tight">{title}</span>
        <span className="block text-sm opacity-90">{sub}</span>
      </span>
    </Link>
  )

  return (
    <Screen bottomNav>
      <div className="pt-safe" />
      <div className="pt-6 pb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-brand-600">Loadup</div>
          <h1 className="text-2xl font-bold">{t('home.hello')}</h1>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        {tile('/topup', t('home.airtime'), t('home.airtimeSub'), <IconPhone size={24} />, 'bg-gradient-to-br from-brand-500 to-brand-700', true)}
        {tile('/esim', t('home.esim'), t('home.esimSub'), <IconGlobe size={24} />, 'bg-gradient-to-br from-teal-400 to-teal-600')}
        {tile('/gift', t('home.gift'), t('home.giftSub'), <IconGift size={24} />, 'bg-gradient-to-br from-pink-500 to-rose-600')}
      </div>

      <SectionTitle action={<Link to="/settings" className="text-sm text-brand-600 font-medium">{t('common.edit')}</Link>}>{t('home.saved')}</SectionTitle>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {me?.savedNumbers.map((n) => (
          <button key={n.id} onClick={() => nav(`/topup?saved=${n.id}`)} className="shrink-0 bg-surface border border-app rounded-2xl px-4 py-3 text-left min-w-36">
            <div className="font-semibold">{flag(n.country)} {n.nickname}</div>
            <div className="text-sm text-muted">•••• {n.last4}</div>
          </button>
        ))}
        <button onClick={() => nav('/topup')} className="shrink-0 border border-dashed border-app rounded-2xl px-4 py-3 text-muted flex items-center gap-2">
          <IconPlus size={18} />{t('home.addNumber')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <Link to="/esims" className="bg-surface border border-app rounded-2xl px-4 py-3 flex items-center gap-2 font-medium"><IconSim size={18} />{t('home.myEsims')}</Link>
        <Link to="/orders?tab=requests" className="bg-surface border border-app rounded-2xl px-4 py-3 flex items-center gap-2 font-medium"><IconLink size={18} />{t('home.requests')}</Link>
      </div>

      <SectionTitle action={<Link to="/orders" className="text-sm text-brand-600 font-medium">{t('common.seeAll')}</Link>}>{t('home.recent')}</SectionTitle>
      {me?.recentOrders.length ? (
        <div className="space-y-2">{me.recentOrders.map((o) => <OrderRow key={o.id} order={o} />)}</div>
      ) : <Empty>{t('home.noOrders')}</Empty>}
      <PoweredBy />
    </Screen>
  )
}
