import { useNavigate } from 'react-router-dom'
import type { OrderDTO } from '../../shared/types'
import { useI18n } from '../lib/i18n'
import { relative } from '../lib/format'
import { StatusBadge } from './ui'
import { IconGift, IconGlobe, IconPhone, IconSim } from './icons'

export function KindIcon({ kind }: { kind: OrderDTO['kind'] }) {
  const icon = kind === 'giftcard' ? <IconGift /> : kind === 'esim' ? <IconGlobe /> : kind === 'esim_topup' ? <IconSim /> : <IconPhone />
  const tint = kind === 'giftcard' ? 'bg-pink-500/10 text-pink-600' : kind.startsWith('esim') ? 'bg-teal-500/10 text-teal-600' : 'bg-brand-500/10 text-brand-600'
  return <span className={`h-10 w-10 shrink-0 rounded-xl grid place-items-center ${tint}`}>{icon}</span>
}

export function OrderRow({ order, action }: { order: OrderDTO; action?: React.ReactNode }) {
  const nav = useNavigate()
  const { t, locale } = useI18n()
  return (
    <div className="flex items-center gap-3 bg-surface rounded-2xl border border-app p-3">
      <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => nav(`/order/${order.id}`)}>
        <KindIcon kind={order.kind} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{order.productName} · {order.packageLabel}</div>
          <div className="text-sm text-muted truncate">{order.recipientMasked ?? t(`kinds.${order.kind}`)} · {relative(order.createdAt, locale)}</div>
        </div>
        <StatusBadge status={order.status} />
      </button>
      {action}
    </div>
  )
}
