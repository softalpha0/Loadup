import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { RequestDTO } from '../../shared/types'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { errorText } from '../lib/errors'
import { relative } from '../lib/format'
import { useOrderCreate } from '../lib/useOrderCreate'
import { Button, Card, CopyButton, Notice, Row, Screen, Spinner, StatusBadge, PoweredBy } from '../components/ui'
import { Qr } from '../components/Qr'
import { IconShare } from '../components/icons'

export default function RequestView() {
  const { code } = useParams<{ code: string }>()
  const { t, tMaybe, locale } = useI18n()
  const { me } = useAuth()
  const [r, setR] = useState<RequestDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const order = useOrderCreate()
  const [cancelling, setCancelling] = useState(false)
  const load = () => api<{ request: RequestDTO }>(`/requests/${code}`).then((x) => setR(x.request)).catch((e) => setError(errorText(e, tMaybe)))
  useEffect(() => { load() }, [code, me?.address]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!r?.isRequester || r.status === 'expired' || (r.orderStatus && ['delivered', 'failed'].includes(r.orderStatus))) return
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [r?.isRequester, r?.status, r?.orderStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const url = `${window.location.origin}/r/${code}`
  return (
    <Screen title={r?.isRequester ? t('request.title') : t('request.payerTitle')} back="/">
      {error && <Notice>{error}</Notice>}
      {!r && !error && <div className="py-10 grid place-items-center"><Spinner /></div>}
      {r && (
        <div className="space-y-4 mt-2">
          {!r.isRequester && r.status === 'open' && <p className="text-muted">{t('request.payerBody')}</p>}
          <Card>
            <Row label={t('review.product')}>{r.productName}</Row>
            <Row label={t('review.amount')}>{r.packageLabel}</Row>
            <Row label={t('review.recipient')}>{r.recipientMasked}</Row>
            {r.orderStatus && <Row label={t('request.status')}><StatusBadge status={r.orderStatus} /></Row>}
            {r.status === 'open' && <Row label="">{t('request.expires', { d: relative(r.expiresAt, locale) })}</Row>}
          </Card>
          {r.note && <Card className="bg-surface-2 italic">“{r.note}”</Card>}

          {r.status === 'paid' && !r.orderStatus && <Notice kind="info">{t('request.paid')}</Notice>}
          {r.status === 'expired' && <Notice kind="warn">{t('request.expired')}</Notice>}

          {r.isRequester && r.status === 'open' && (
            <div className="text-center space-y-3">
              <p className="text-muted">{t('request.yours')}</p>
              <Qr value={url} size={180} />
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => navigator.share ? navigator.share({ title: 'Loadup', text: t('request.shareText', { label: r.packageLabel ?? '', phone: r.recipientMasked }), url }).catch(() => undefined) : navigator.clipboard?.writeText(url)}>
                  <IconShare size={18} />{t('common.share')}
                </Button>
                <CopyButton value={url} label={t('request.copyLink')} />
              </div>
              <Button variant="ghost" loading={cancelling} onClick={async () => { setCancelling(true); await api(`/requests/${code}`, { method: 'DELETE' }).catch(() => undefined); await load(); setCancelling(false) }}>{t('request.cancel')}</Button>
            </div>
          )}

          {!r.isRequester && r.status === 'open' && (
            <>
              {order.error && <Notice>{order.error}</Notice>}
              <Button variant="pay" loading={order.busy} onClick={() => order.create({ requestCode: r.code })}>{t('request.payFor')}</Button>
              <p className="text-center text-sm text-muted">{t('review.chooseNext')}</p>
            </>
          )}
        </div>
      )}
      <PoweredBy />
    </Screen>
  )
}
