import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { OrderDTO } from '../../shared/types'
import { api, ApiError, getToken } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { errorText } from '../lib/errors'
import { clearPaying, isUncertainPayment, markPaying, nimBalance, payInvoice, toWalletError, wasPaying } from '../lib/nimiq'
import { countdown, nim, sats, usd } from '../lib/format'
import { supportHref } from '../lib/support'
import { useNow } from '../lib/useNow'
import { Button, Card, CopyButton, Input, Notice, Row, Screen, Spinner, StatusBadge, cx, useToast, PoweredBy } from '../components/ui'
import { IconCheck, IconClock, IconHelp, IconRepeat, IconX, IconBolt } from '../components/icons'
import { Qr } from '../components/Qr'
import { KindIcon } from '../components/OrderRow'

export default function OrderScreen() {
  const { id } = useParams<{ id: string }>()
  const { t, tMaybe } = useI18n()
  const [order, setOrder] = useState<OrderDTO | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)

  const load = useCallback(async () => {
    try {
      const { order } = await api<{ order: OrderDTO }>(`/orders/${id}`)
      setOrder(order)
      return order
    } catch (e) {
      setLoadError(errorText(e, tMaybe))
      return null
    }
  }, [id, tMaybe])

  // Report a possibly-submitted payment. Retries; the local marker is only cleared once the server knows.
  const reportPaid = useCallback(async (body: { hash?: string; swapId?: string; uncertain?: boolean }) => {
    for (let i = 0; i < 5; i++) {
      try {
        const res = await api<{ order: OrderDTO }>(`/orders/${id}/paid`, { body })
        clearPaying(id!)
        setOrder(res.order)
        return res.order
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) { clearPaying(id!); break }
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
      }
    }
    return null
  }, [id])

  useEffect(() => {
    (async () => {
      const o = await load()
      // The app was closed while the Nimiq Pay dialog was open → never offer to pay this invoice again.
      if (o && wasPaying(o.id)) {
        if (o.status === 'awaiting_payment' && !o.paymentAttempted) {
          setUncertain(true)
          await reportPaid({ uncertain: true })
        } else clearPaying(o.id)
      }
    })()
  }, [load, reportPaid])

  // Live updates once payment is in flight
  const live = order && !['delivered', 'failed', 'expired'].includes(order.status) && (order.paymentAttempted || order.status !== 'awaiting_payment')
  useEffect(() => {
    if (!live || !id) return
    let es: EventSource | null = null
    let poll: number | undefined
    const startPolling = () => { poll = window.setInterval(load, 3000) }
    if (typeof EventSource !== 'undefined') {
      es = new EventSource(`/api/orders/${id}/stream?token=${encodeURIComponent(getToken() ?? '')}`)
      es.addEventListener('order', (ev) => setOrder(JSON.parse((ev as MessageEvent).data)))
      es.onerror = () => { es?.close(); es = null; if (!poll) startPolling() }
    } else startPolling()
    return () => { es?.close(); if (poll) window.clearInterval(poll) }
  }, [live, id, load])

  if (loadError && !order) return <Screen title={t('track.title')} back><div className="mt-6"><Notice>{loadError}</Notice></div></Screen>
  if (!order) return <Screen title={t('track.title')} back><div className="py-20 grid place-items-center"><Spinner size={28} /></div></Screen>

  const title = order.status === 'awaiting_payment' && !order.paymentAttempted ? t('review.title') : t('track.title')
  return (
    <Screen title={title} back="/">
      <div className="mt-2 space-y-4">
        <Summary order={order} />
        {order.status === 'awaiting_payment' && !order.paymentAttempted && !uncertain
          ? <PayPanel order={order} setOrder={setOrder} reportPaid={reportPaid} setUncertain={setUncertain} reload={load} />
          : order.status === 'expired' && !order.paymentAttempted
            ? <ExpiredPanel order={order} setOrder={setOrder} />
            : order.status === 'delivered'
              ? <Result order={order} />
              : order.status === 'failed'
                ? <Failed order={order} />
                : <Tracking order={order} uncertain={uncertain} />}
      </div>
      <PoweredBy />
    </Screen>
  )
}

function Summary({ order }: { order: OrderDTO }) {
  const { t, locale } = useI18n()
  return (
    <Card>
      <div className="flex items-center gap-3 mb-2">
        <KindIcon kind={order.kind} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{order.productName}</div>
          <div className="text-sm text-muted">{t(`kinds.${order.kind}`)}</div>
        </div>
        <StatusBadge status={order.status} />
      </div>
      {order.recipientMasked && <Row label={t('review.recipient')}>{order.recipientMasked}</Row>}
      {order.esimId && <Row label={t('review.esim')}>{order.esimId}</Row>}
      <Row label={t('review.amount')}>{order.packageLabel}</Row>
      {order.priceUsd != null && (
        <Row label={t('review.price')}>
          <span className="block">{t('common.approx', { v: usd(order.priceUsd, locale) })}</span>
          {order.priceSats != null && <span className="block text-xs text-muted font-normal">{sats(order.priceSats, locale)} · Lightning</span>}
        </Row>
      )}
    </Card>
  )
}

function PayPanel({ order, setOrder, reportPaid, setUncertain, reload }: {
  order: OrderDTO; setOrder: (o: OrderDTO) => void; reload: () => Promise<OrderDTO | null>
  reportPaid: (b: { hash?: string; swapId?: string; uncertain?: boolean }) => Promise<OrderDTO | null>
  setUncertain: (v: boolean) => void
}) {
  const { t, tMaybe, locale } = useI18n()
  const now = useNow(1000)
  const [paying, setPaying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const refreshingRef = useRef(false)
  const expiresAt = order.invoiceExpiresAt ? new Date(order.invoiceExpiresAt).getTime() : 0
  const left = expiresAt - now

  useEffect(() => { nimBalance().then(setBalance) }, [])

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return null
    refreshingRef.current = true; setRefreshing(true); setError(null)
    try {
      const res = await api<{ order: OrderDTO }>(`/orders/${order.id}/refresh-invoice`, { method: 'POST', body: {} })
      setOrder(res.order)
      return res.order
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'INVOICE_ALREADY_PAID' || e.code === 'PAYMENT_ALREADY_SUBMITTED')) await reload()
      else setError(errorText(e, tMaybe))
      return null
    } finally { refreshingRef.current = false; setRefreshing(false) }
  }, [order.id, setOrder, reload, tMaybe])

  // F11: auto-refresh an expired invoice while the user is on this screen (never while paying)
  useEffect(() => {
    if (expiresAt && left <= 0 && !paying && !refreshingRef.current) refresh()
  }, [left <= 0, paying]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pay() {
    setError(null)
    let current: OrderDTO | null = order
    if (!current.bolt11 || left < 20_000) current = await refresh()
    if (!current?.bolt11) return
    setPaying(true)
    markPaying(current.id, current.bolt11)
    try {
      const res = await payInvoice(current.bolt11)
      await reportPaid({ hash: res.hash, swapId: res.swapId })
    } catch (e) {
      const w = toWalletError(e)
      if (isUncertainPayment(w)) {
        // A9: never show a second Pay button — check the order status instead.
        setUncertain(true)
        await reportPaid({ uncertain: true, hash: w.data?.hash, swapId: w.data?.swapId })
      } else if (w.type === 'NETWORK_ERROR' || w.type === 'UNKNOWN_ERROR') {
        // Check the provider before allowing another attempt (Nimiq Pay also rejects duplicates).
        clearPaying(current.id)
        const fresh = await reload()
        if (fresh && (fresh.status !== 'awaiting_payment' || fresh.paymentAttempted)) return
        setError(t('errors.NETWORK_ERROR'))
      } else {
        clearPaying(current.id)
        setError(tMaybe(`errors.${w.type}`) ?? t('errors.generic'))
        if (w.type === 'INVALID_REQUEST') await refresh()
      }
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className={cx('flex items-center justify-center gap-2 text-sm font-medium', left < 60_000 ? 'text-amber-600' : 'text-muted')}>
        {refreshing ? <><Spinner size={16} />{t('review.refreshing')}</> : left > 0 ? <><IconClock size={16} />{t('review.expiresIn', { t: countdown(left) })}</> : <>{t('review.expired')}</>}
      </div>
      {error && <Notice>{error}</Notice>}
      <Button variant="pay" onClick={pay} loading={paying} disabled={refreshing || !order.bolt11}>
        {!paying && <IconBolt size={20} />}{paying ? t('review.paying') : t('review.pay')}
      </Button>
      <p className="text-center text-sm text-muted">{t('review.chooseNext')}</p>
      {balance != null && <p className="text-center text-xs text-muted">{t('review.nimBalance', { v: nim(balance, locale) })}</p>}
      <p className="text-center text-xs text-muted">{t('review.delivery')}</p>
    </div>
  )
}

function ExpiredPanel({ order, setOrder }: { order: OrderDTO; setOrder: (o: OrderDTO) => void }) {
  const { t, tMaybe } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-3 text-center">
      <p className="text-muted">{tMaybe(`result.failed.${order.failureReason}`) ?? t('result.failed.invoice_expired')}</p>
      {error && <Notice>{error}</Notice>}
      <Button loading={busy} onClick={async () => {
        setBusy(true); setError(null)
        try { setOrder((await api<{ order: OrderDTO }>(`/orders/${order.id}/refresh-invoice`, { method: 'POST', body: {} })).order) }
        catch (e) { setError(errorText(e, tMaybe)) } finally { setBusy(false) }
      }}>{t('review.refresh')}</Button>
    </div>
  )
}

function Tracking({ order, uncertain }: { order: OrderDTO; uncertain: boolean }) {
  const { t } = useI18n()
  const steps = [
    { key: 'paid', label: t('track.paid') },
    { key: 'processing', label: t('track.processing') },
    { key: 'delivered', label: t('track.delivered') },
  ]
  const idx = order.status === 'processing' ? 1 : order.status === 'delivered' ? 2 : 0
  return (
    <div className="space-y-4">
      {uncertain && order.status !== 'processing' && (
        <Notice kind="info"><strong className="block">{t('track.checking')}</strong>{t('track.checkingBody')}</Notice>
      )}
      <Card>
        <ol className="space-y-5 py-2" aria-label={t('track.title')}>
          {steps.map((s, i) => {
            const done = i < idx || (i === 0 && order.status !== 'awaiting_payment')
            const active = i === idx && !done
            return (
              <li key={s.key} className="flex items-center gap-3">
                <span className={cx('h-9 w-9 rounded-full grid place-items-center shrink-0',
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-500/15 text-blue-600' : 'bg-surface-2 text-muted')}>
                  {done ? <IconCheck size={18} /> : active ? <Spinner size={18} /> : <span className="text-sm">{i + 1}</span>}
                </span>
                <span className={cx('font-medium', !done && !active && 'text-muted')}>{s.label}</span>
              </li>
            )
          })}
        </ol>
      </Card>
      <p className="text-center text-sm text-muted">{t('track.usually')} · {t('track.live')}</p>
    </div>
  )
}

function Actions({ order, saveNumber = false }: { order: OrderDTO; saveNumber?: boolean }) {
  const { t } = useI18n()
  const { config, refresh, me } = useAuth()
  const nav = useNavigate()
  const alreadySaved = me?.savedNumbers.some((n) => n.masked === order.recipientMasked)
  const toast = useToast()
  const [reordering, setReordering] = useState(false)
  const [nick, setNick] = useState<string | null>(null)
  const help = supportHref(config, order.id, order.status, { subject: t('support.subject'), body: t('support.body') })
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" loading={reordering} onClick={async () => {
          setReordering(true)
          try { const r = await api<{ order: OrderDTO }>('/orders', { body: { reorderOf: order.id } }); nav(`/order/${r.order.id}`) }
          catch (e) { toast((e as Error).message) } finally { setReordering(false) }
        }}><IconRepeat size={18} />{t('result.reorder')}</Button>
        <Link to={`/order/${order.id}/receipt`}><Button variant="secondary">{t('result.receipt')}</Button></Link>
      </div>
      {saveNumber && order.recipientMasked && !alreadySaved && (
        nick === null
          ? <Button variant="ghost" onClick={() => setNick('')}>{t('result.saveNumber')}</Button>
          : <form className="flex gap-2 items-end" onSubmit={async (e) => {
              e.preventDefault()
              if (!nick.trim()) return
              await api('/saved-numbers', { body: { nickname: nick.trim(), orderId: order.id } }).then(() => { toast(t('phone.savedOk')); refresh(); setNick(null) }).catch((er) => toast(er.message))
            }}>
              <div className="flex-1"><Input autoFocus placeholder={t('phone.nicknamePh')} value={nick} maxLength={40} onChange={(e) => setNick(e.target.value)} /></div>
              <Button full={false} type="submit">{t('common.save')}</Button>
            </form>
      )}
      <a href={help} target="_blank" rel="noreferrer"><Button variant="ghost"><IconHelp size={18} />{t('result.help')}</Button></a>
      <p className="text-center text-xs text-muted">ID: {order.id}</p>
    </div>
  )
}

function Result({ order }: { order: OrderDTO }) {
  const { t } = useI18n()
  const r = order.redemption
  if (order.kind === 'giftcard') {
    return (
      <div className="space-y-4">
        <SuccessMark title={t('result.giftTitle')} />
        <Card className="space-y-3">
          {r?.code && <div><div className="text-sm text-muted">{t('result.code')}</div><div className="flex items-center gap-2"><code className="flex-1 text-xl font-bold break-all">{r.code}</code><CopyButton value={r.code} /></div></div>}
          {r?.pin && <div><div className="text-sm text-muted">{t('result.pin')}</div><div className="flex items-center gap-2"><code className="flex-1 text-lg font-bold">{r.pin}</code><CopyButton value={r.pin} /></div></div>}
          {r?.link && <a href={r.link} target="_blank" rel="noreferrer"><Button>{t('result.link')}</Button></a>}
          {r?.instructions && <div><div className="text-sm text-muted">{t('result.instructions')}</div><p className="whitespace-pre-line">{r.instructions}</p></div>}
        </Card>
        <Actions order={order} />
      </div>
    )
  }
  if (order.kind === 'esim' || order.kind === 'esim_topup') {
    const e = r?.esim
    if (order.kind === 'esim_topup' || !e?.lpa) {
      return <div className="space-y-4"><SuccessMark title={t('track.delivered')} subtitle={`${order.packageLabel} · ${order.productName}`} /><Actions order={order} /></div>
    }
    const iosUrl = e.iosInstallUrl ?? `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(e.lpa)}`
    return (
      <div className="space-y-4">
        <SuccessMark title={t('result.esimTitle')} />
        <Card className="text-center space-y-3">
          <p className="text-muted text-sm">{t('result.esimScan')}</p>
          <Qr value={e.lpa} size={220} label="eSIM QR" />
          <div className="grid grid-cols-1 gap-2">
            {e.installUrl && <a href={e.installUrl} target="_blank" rel="noreferrer"><Button>{t('result.installLink')}</Button></a>}
            <a href={iosUrl} target="_blank" rel="noreferrer"><Button variant="secondary">{t('result.installIos')}</Button></a>
            {e.androidInstallUrl && <a href={e.androidInstallUrl} target="_blank" rel="noreferrer"><Button variant="secondary">{t('result.installAndroid')}</Button></a>}
          </div>
        </Card>
        <Card className="space-y-2 text-sm">
          <p>{t('result.iosSteps')}</p>
          <p>{t('result.androidSteps')}</p>
        </Card>
        <Card>
          <div className="text-sm font-semibold mb-1">{t('result.manual')}</div>
          {e.smdpAddress && <Row label={t('result.smdp')}><span className="flex items-center gap-2 justify-end">{e.smdpAddress}<CopyButton value={e.smdpAddress} /></span></Row>}
          {e.activationCode && <Row label={t('result.activation')}><span className="flex items-center gap-2 justify-end">{e.activationCode}<CopyButton value={e.activationCode} /></span></Row>}
          {e.iccid && <Row label={t('result.iccid')}>{e.iccid}</Row>}
        </Card>
        <Link to="/esims"><Button variant="secondary">{t('esim.mine')}</Button></Link>
        <Actions order={order} />
      </div>
    )
  }
  const phone = order.recipientMasked ?? ''
  return (
    <div className="space-y-4">
      <SuccessMark title={order.packageLabel ? t('result.credited', { amount: order.packageLabel, phone }) : t('result.creditedNoAmount', { phone })} />
      <Actions order={order} saveNumber />
    </div>
  )
}

function SuccessMark({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center py-4">
      <div className="animate-pop mx-auto h-20 w-20 rounded-full bg-emerald-500 text-white grid place-items-center shadow-lg shadow-emerald-500/30"><IconCheck size={44} /></div>
      <h2 className="mt-4 text-xl font-bold">{title}</h2>
      {subtitle && <p className="text-muted">{subtitle}</p>}
    </div>
  )
}

function Failed({ order }: { order: OrderDTO }) {
  const { t, tMaybe, dict } = useI18n()
  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <div className="mx-auto h-20 w-20 rounded-full bg-red-500 text-white grid place-items-center"><IconX size={40} /></div>
        <h2 className="mt-4 text-xl font-bold">{t('result.failedTitle')}</h2>
        <p className="mt-2 text-muted">{tMaybe(`result.failed.${order.failureReason}`) ?? t('result.failed.default')}</p>
      </div>
      {(order.failureReason === 'payment_not_received' || order.failureReason === 'refunded') && <Notice kind="warn">{dict.about.faq[3][1]}</Notice>}
      <Actions order={order} />
      <Link to="/"><Button variant="ghost">{t('result.home')}</Button></Link>
    </div>
  )
}
