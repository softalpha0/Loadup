import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { OrderDTO, OrderKind, RequestDTO } from '../../shared/types'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { errorText } from '../lib/errors'
import { relative } from '../lib/format'
import { Empty, Notice, Screen, Spinner, cx, useToast } from '../components/ui'
import { OrderRow } from '../components/OrderRow'
import { IconRepeat } from '../components/icons'

const FILTERS: (OrderKind | 'all')[] = ['all', 'airtime', 'data', 'esim', 'giftcard']

export default function Orders() {
  const { t, tMaybe } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'requests' ? 'requests' : 'orders'
  const [filter, setFilter] = useState<OrderKind | 'all'>('all')
  const [orders, setOrders] = useState<OrderDTO[] | null>(null)
  const [requests, setRequests] = useState<RequestDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nav = useNavigate()
  const toast = useToast()

  useEffect(() => {
    setError(null)
    if (tab === 'orders') {
      setOrders(null)
      api<{ orders: OrderDTO[] }>(`/orders${filter === 'all' ? '' : `?kind=${filter}`}`).then((r) => setOrders(r.orders)).catch((e) => setError(errorText(e, tMaybe)))
    } else {
      setRequests(null)
      api<{ requests: RequestDTO[] }>('/requests').then((r) => setRequests(r.requests)).catch((e) => setError(errorText(e, tMaybe)))
    }
  }, [tab, filter, tMaybe])

  async function reorder(o: OrderDTO) {
    try { const r = await api<{ order: OrderDTO }>('/orders', { body: { reorderOf: o.id } }); nav(`/order/${r.order.id}`) }
    catch (e) { toast(errorText(e, tMaybe)) }
  }

  return (
    <Screen title={t('orders.title')} bottomNav>
      <div className="grid grid-cols-2 bg-surface-2 rounded-xl p-1 mt-1" role="tablist">
        {(['orders', 'requests'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'orders' ? {} : { tab: k })}
            className={cx('h-10 rounded-lg font-semibold', tab === k ? 'bg-surface shadow-sm' : 'text-muted')}>{t(k === 'orders' ? 'orders.ordersTab' : 'orders.requestsTab')}</button>
        ))}
      </div>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}

      {tab === 'orders' && (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 py-3">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cx('shrink-0 rounded-full px-4 h-9 text-sm font-medium border', filter === f ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface border-app')}>
                {f === 'all' ? t('orders.filterAll') : t(`kinds.${f}`)}
              </button>
            ))}
          </div>
          {!orders && !error && <div className="py-10 grid place-items-center"><Spinner /></div>}
          {orders?.length === 0 && <Empty>{t('orders.empty')}</Empty>}
          <div className="space-y-2">
            {orders?.map((o) => (
              <OrderRow key={o.id} order={o} action={['airtime', 'data', 'giftcard', 'esim_topup'].includes(o.kind) && (
                <button aria-label={t('orders.reorder')} onClick={() => reorder(o)} className="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-surface-2"><IconRepeat size={18} /></button>
              )} />
            ))}
          </div>
        </>
      )}

      {tab === 'requests' && (
        <div className="space-y-2 mt-3">
          {!requests && !error && <div className="py-10 grid place-items-center"><Spinner /></div>}
          {requests?.length === 0 && <Empty>{t('orders.noRequests')}</Empty>}
          {requests?.map((r) => <RequestRow key={r.code} r={r} />)}
        </div>
      )}
    </Screen>
  )
}

function RequestRow({ r }: { r: RequestDTO }) {
  const { t, locale } = useI18n()
  const state = r.orderStatus ? t(`status.${r.orderStatus}`) : t(`request.${r.status === 'open' ? 'status' : r.status}` as never)
  return (
    <Link to={`/r/${r.code}`} className="block bg-surface rounded-2xl border border-app p-3">
      <div className="flex justify-between gap-2">
        <span className="font-medium">{r.productName} · {r.packageLabel}</span>
        <span className="text-sm text-muted">{r.code}</span>
      </div>
      <div className="text-sm text-muted">{r.recipientMasked} · {r.status === 'open' ? t('request.expires', { d: relative(r.expiresAt, locale) }) : state}</div>
    </Link>
  )
}
