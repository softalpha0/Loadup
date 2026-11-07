import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { OrderDTO } from '../../shared/types'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { errorText } from '../lib/errors'
import { dateTime, sats, usd } from '../lib/format'
import { Button, Card, Notice, Row, Screen, Spinner, StatusBadge, useToast, PoweredBy } from '../components/ui'
import { IconLink, IconShare } from '../components/icons'

type ReceiptData = Pick<OrderDTO, 'id' | 'kind' | 'status' | 'productName' | 'packageLabel' | 'recipientMasked' | 'priceUsd' | 'priceSats' | 'createdAt' | 'updatedAt'>

function ReceiptCard({ r }: { r: ReceiptData }) {
  const { t, locale } = useI18n()
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg font-bold">Loadup</span>
        <StatusBadge status={r.status} />
      </div>
      <Row label={t('review.product')}>{r.productName}</Row>
      <Row label={t('review.amount')}>{r.packageLabel}</Row>
      {r.recipientMasked && <Row label={t('review.recipient')}>{r.recipientMasked}</Row>}
      {r.priceUsd != null && <Row label={t('receipt.price')}>{t('common.approx', { v: usd(r.priceUsd, locale) })}{r.priceSats != null && <span className="block text-xs text-muted font-normal">{sats(r.priceSats, locale)}</span>}</Row>}
      <Row label={t('receipt.date')}>{dateTime(r.createdAt, locale)}</Row>
      <Row label={t('receipt.orderId')}><span className="text-xs">{r.id}</span></Row>
      <p className="text-xs text-muted mt-3">{t('receipt.paidWith')}</p>
    </Card>
  )
}

async function receiptImage(r: ReceiptData, labels: Record<string, string>): Promise<Blob | null> {
  const W = 1080, H = 1350
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  if (!g) return null
  const grad = g.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#5b5bf6'); grad.addColorStop(1, '#3d36c2')
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  g.fillStyle = '#ffffff'
  g.beginPath(); g.roundRect(80, 260, W - 160, 900, 48); g.fill()
  g.fillStyle = '#ffffff'; g.font = 'bold 84px system-ui, sans-serif'; g.fillText('Loadup', 80, 170)
  g.font = '36px system-ui, sans-serif'; g.globalAlpha = .85; g.fillText(labels.tagline, 80, 225); g.globalAlpha = 1
  const ok = r.status === 'delivered'
  g.fillStyle = ok ? '#10b981' : r.status === 'failed' ? '#ef4444' : '#3b82f6'
  g.beginPath(); g.arc(W / 2, 400, 70, 0, Math.PI * 2); g.fill()
  g.strokeStyle = '#fff'; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath()
  if (ok) { g.moveTo(W / 2 - 32, 402); g.lineTo(W / 2 - 6, 428); g.lineTo(W / 2 + 36, 380) } else { g.moveTo(W / 2 - 24, 376); g.lineTo(W / 2 + 24, 424); g.moveTo(W / 2 + 24, 376); g.lineTo(W / 2 - 24, 424) }
  g.stroke()
  g.fillStyle = '#1f2348'; g.textAlign = 'center'; g.font = 'bold 56px system-ui, sans-serif'
  g.fillText(r.packageLabel ?? '', W / 2, 560)
  g.font = '40px system-ui, sans-serif'; g.fillStyle = '#6b7091'
  g.fillText(labels.status, W / 2, 620)
  g.textAlign = 'left'
  const rows: [string, string][] = [
    [labels.product, r.productName],
    ...(r.recipientMasked ? [[labels.recipient, r.recipientMasked] as [string, string]] : []),
    ...(r.priceUsd != null ? [[labels.price, `≈ $${r.priceUsd.toFixed(2)}`] as [string, string]] : []),
    [labels.date, labels.dateValue],
    [labels.orderId, r.id],
  ]
  let y = 730
  for (const [k, v] of rows) {
    g.fillStyle = '#6b7091'; g.font = '34px system-ui, sans-serif'; g.fillText(k, 140, y)
    g.fillStyle = '#1f2348'; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(v.length > 34 ? v.slice(0, 33) + '…' : v, W - 140, y); g.textAlign = 'left'
    y += 80
  }
  g.fillStyle = '#6b7091'; g.font = '30px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(labels.paidWith, W / 2, 1110)
  g.fillStyle = '#ffffff'; g.font = '30px system-ui, sans-serif'; g.fillText(labels.powered, W / 2, 1260)
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'))
}

export function OrderReceipt() {
  const { id } = useParams<{ id: string }>()
  const { t, tMaybe, locale } = useI18n()
  const toast = useToast()
  const [o, setO] = useState<OrderDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api<{ order: OrderDTO }>(`/orders/${id}`).then((r) => setO(r.order)).catch((e) => setError(errorText(e, tMaybe))) }, [id, tMaybe])
  const publicUrl = o ? `${window.location.origin}/receipt/${o.receiptToken}` : ''

  async function shareImage() {
    if (!o) return
    const blob = await receiptImage(o, {
      tagline: t('tagline').slice(0, 60), status: t(`status.${o.status}`), product: t('review.product'), recipient: t('review.recipient'),
      price: t('receipt.price'), date: t('receipt.date'), dateValue: dateTime(o.createdAt, locale), orderId: t('receipt.orderId'),
      paidWith: t('receipt.paidWith'), powered: t('common.poweredBy'),
    })
    if (!blob) return
    const file = new File([blob], `loadup-${o.id}.png`, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Loadup receipt' }).catch(() => undefined)
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    }
  }
  async function shareLink() {
    if (navigator.share) await navigator.share({ title: 'Loadup receipt', url: publicUrl }).catch(() => undefined)
    else { await navigator.clipboard?.writeText(publicUrl).catch(() => undefined); toast(t('receipt.linkCopied')) }
  }

  return (
    <Screen title={t('receipt.title')} back>
      {error && <Notice>{error}</Notice>}
      {!o && !error && <div className="py-10 grid place-items-center"><Spinner /></div>}
      {o && (
        <div className="space-y-3 mt-2">
          <ReceiptCard r={o} />
          <Button onClick={shareImage}><IconShare size={18} />{t('receipt.shareImage')}</Button>
          <Button variant="secondary" onClick={shareLink}><IconLink size={18} />{t('receipt.shareLink')}</Button>
        </div>
      )}
    </Screen>
  )
}

export function PublicReceipt() {
  const { token } = useParams<{ token: string }>()
  const { t, tMaybe } = useI18n()
  const [r, setR] = useState<ReceiptData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api<{ receipt: ReceiptData }>(`/receipts/${token}`, { auth: false }).then((x) => setR(x.receipt)).catch((e) => setError(errorText(e, tMaybe))) }, [token, tMaybe])
  return (
    <Screen title={t('receipt.title')}>
      {error && <Notice>{error}</Notice>}
      {!r && !error && <div className="py-10 grid place-items-center"><Spinner /></div>}
      {r && <div className="mt-2"><ReceiptCard r={r} /></div>}
      <PoweredBy />
    </Screen>
  )
}
