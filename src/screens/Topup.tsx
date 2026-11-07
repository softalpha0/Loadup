import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parsePhoneNumberFromString, AsYouType, type CountryCode } from 'libphonenumber-js'
import type { PhoneCheckResult, Product, RequestDTO } from '../../shared/types'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { errorText } from '../lib/errors'
import { useOrderCreate } from '../lib/useOrderCreate'
import { countryName, flag, money } from '../lib/format'
import { Button, Card, CopyButton, Input, Notice, Screen, SectionTitle, Spinner, cx, useToast } from '../components/ui'
import { CountryPicker, defaultCountry, rememberCountry } from '../components/CountryPicker'
import { Qr } from '../components/Qr'
import { IconCheck, IconShare } from '../components/icons'
import { Link } from 'react-router-dom'

type Check = PhoneCheckResult & { masked: string }
type Choice = { productId: string; packageId?: string; value?: number; label: string; kind: 'airtime' | 'data' }

export default function Topup() {
  const { t, tMaybe, locale } = useI18n()
  const { me, refresh } = useAuth()
  const toast = useToast()
  const [params] = useSearchParams()
  const savedId = params.get('saved')
  const saved = me?.savedNumbers.find((n) => n.id === savedId)

  const [country, setCountry] = useState(defaultCountry)
  const [phone, setPhone] = useState('')
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<Check | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'airtime' | 'data'>('airtime')
  const [choice, setChoice] = useState<Choice | null>(null)
  const [custom, setCustom] = useState('')
  const [nickname, setNickname] = useState('')
  const [useSaved, setUseSaved] = useState<string | null>(savedId)
  const [requestOpen, setRequestOpen] = useState(false)
  const order = useOrderCreate()

  async function runCheck(body: Record<string, unknown>) {
    setChecking(true); setError(null); setCheck(null); setChoice(null)
    try {
      const res = await api<Check>('/phone/check', { body })
      setCheck(res)
      const hasAirtime = res.products.some((p) => p.type === 'airtime')
      setTab(hasAirtime ? 'airtime' : 'data')
    } catch (e) {
      setError(errorText(e, tMaybe))
    } finally { setChecking(false) }
  }

  useEffect(() => {
    if (savedId) runCheck({ savedNumberId: savedId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedId])

  const parsed = useMemo(() => parsePhoneNumberFromString(phone, country as CountryCode), [phone, country])
  const valid = Boolean(parsed?.isValid())

  function submitPhone(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) { setError(t('phone.invalid', { country: countryName(country, locale) })); return }
    rememberCountry(country)
    setUseSaved(null)
    runCheck({ phone: parsed!.number, country })
  }

  const products = check?.products ?? []
  const byTab = products.filter((p) => (tab === 'airtime' ? p.type === 'airtime' : p.type === 'data'))
  const rangeProduct = byTab.find((p) => p.range)
  const recipientBody = useSaved ? { savedNumberId: useSaved } : { phone: check?.e164, country }

  function customChoice(p: Product): Choice | null {
    const v = Number(custom)
    if (!p.range || !custom) return null
    const ok = v >= p.range.min && v <= p.range.max
    return ok ? { productId: p.id, value: v, label: money(v, p.currency, locale), kind: tab } : null
  }
  const customInvalid = rangeProduct && custom !== '' && !customChoice(rangeProduct)
  const effective = choice ?? (rangeProduct ? customChoice(rangeProduct) : null)

  async function review() {
    if (!effective) return
    if (nickname.trim() && !useSaved && check) {
      await api('/saved-numbers', { body: { nickname: nickname.trim(), phone: check.e164, operatorId: check.operator?.id } })
        .then(() => { toast(t('phone.savedOk')); refresh() }).catch(() => undefined)
    }
    await order.create({ kind: effective.kind, productId: effective.productId, packageId: effective.packageId, value: effective.value, ...recipientBody })
  }

  return (
    <Screen title={t('phone.title')} back="/">
      {!check && !checking && (
        <form onSubmit={submitPhone} className="mt-2">
          <span className="block text-sm font-medium mb-1.5">{t('phone.label')}</span>
          <div className="flex gap-2">
            <CountryPicker value={country} onChange={(c) => { setCountry(c); setError(null) }} />
            <input
              inputMode="tel" autoComplete="tel" placeholder={t('phone.placeholder')} aria-label={t('phone.label')}
              value={phone} onChange={(e) => { setPhone(new AsYouType(country as CountryCode).input(e.target.value)); setError(null) }}
              className="flex-1 min-w-0 h-12 rounded-xl border border-app bg-surface px-4 text-lg outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          {error && <div className="mt-3"><Notice>{error}</Notice></div>}
          <div className="mt-4"><Button type="submit" disabled={!phone}>{t('phone.check')}</Button></div>

          {!!me?.savedNumbers.length && (
            <>
              <SectionTitle>{t('home.saved')}</SectionTitle>
              <div className="space-y-2">
                {me.savedNumbers.map((n) => (
                  <Card key={n.id} onClick={() => { setUseSaved(n.id); runCheck({ savedNumberId: n.id }) }}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{flag(n.country)} {n.nickname}</span>
                      <span className="text-muted">{n.masked}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </form>
      )}

      {checking && <div className="py-16 flex flex-col items-center gap-3 text-muted"><Spinner size={28} />{t('phone.checking')}</div>}

      {check && (
        <div className="mt-2 space-y-4">
          <Card>
            <div className="flex items-center gap-3">
              {check.operator?.logoUrl
                ? <img src={check.operator.logoUrl} alt="" className="h-10 w-10 rounded-xl object-contain bg-white" />
                : <span className="h-10 w-10 rounded-xl bg-brand-500/10 grid place-items-center text-xl">{flag(check.country)}</span>}
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{saved?.nickname ?? check.masked}</div>
                <div className="text-sm text-muted">{check.operator ? `${t('phone.detected')}: ${check.operator.name}` : countryName(check.country, locale)}</div>
              </div>
              <button className="text-brand-600 font-medium px-2 py-2" onClick={() => { setCheck(null); setUseSaved(null) }}>{t('phone.change')}</button>
            </div>
          </Card>

          {products.length === 0 ? (
            <div className="space-y-3">
              <Notice kind="warn">{t('phone.notAvailable')}</Notice>
              <p className="text-muted text-center">{t('phone.tryEsim')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Link to="/esim"><Button variant="secondary">{t('home.esim')}</Button></Link>
                <Link to="/gift"><Button variant="secondary">{t('home.gift')}</Button></Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 bg-surface-2 rounded-xl p-1" role="tablist">
                {(['airtime', 'data'] as const).map((k) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setChoice(null); setCustom('') }}
                    disabled={!products.some((p) => p.type === k)}
                    className={cx('h-10 rounded-lg font-semibold disabled:opacity-40', tab === k ? 'bg-surface shadow-sm' : 'text-muted')}>
                    {t(`packages.${k}`)}
                  </button>
                ))}
              </div>

              {byTab.length === 0 && <p className="text-muted text-center py-6">{t('packages.none')}</p>}
              {byTab.map((p) => (
                <div key={p.id}>
                  {byTab.length > 1 && <div className="text-sm font-semibold text-muted mb-2">{p.name}</div>}
                  <div className="grid grid-cols-2 gap-2">
                    {p.packages.map((pk) => {
                      const sel = choice?.packageId === pk.id
                      return (
                        <button key={pk.id} onClick={() => { setChoice({ productId: p.id, packageId: pk.id, label: pk.label, kind: tab }); setCustom('') }}
                          aria-pressed={sel}
                          className={cx('rounded-2xl border p-3 text-left min-h-20 transition', sel ? 'border-brand-600 ring-2 ring-brand-500/30 bg-brand-500/5' : 'border-app bg-surface')}>
                          <div className="font-bold text-lg flex items-center justify-between">{pk.label}{sel && <IconCheck size={18} className="text-brand-600" />}</div>
                          {pk.priceUsd != null && <div className="text-sm text-muted">{t('common.approx', { v: `$${pk.priceUsd.toFixed(2)}` })}</div>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {rangeProduct?.range && (
                <Input
                  label={t('packages.custom')} inputMode="decimal" value={custom}
                  placeholder={`${rangeProduct.currency} ${rangeProduct.range.min}–${rangeProduct.range.max}`}
                  hint={t('packages.customHint', { min: money(rangeProduct.range.min, rangeProduct.currency, locale), max: money(rangeProduct.range.max, rangeProduct.currency, locale) })}
                  error={customInvalid ? t('packages.invalidAmount', { min: rangeProduct.range.min, max: rangeProduct.range.max }) : null}
                  onChange={(e) => { setCustom(e.target.value.replace(/[^0-9.]/g, '')); setChoice(null) }}
                />
              )}

              {!useSaved && (
                <Input label={t('phone.saveAs')} placeholder={t('phone.nicknamePh')} value={nickname} maxLength={40} onChange={(e) => setNickname(e.target.value)} />
              )}

              {order.error && <Notice>{order.error}</Notice>}
              <div className="space-y-2 pt-2">
                <Button onClick={review} disabled={!effective} loading={order.busy}>{t('packages.review')}</Button>
                <Button variant="secondary" disabled={!effective} onClick={() => setRequestOpen(true)}>{t('packages.askSomeone')}</Button>
              </div>
            </>
          )}
        </div>
      )}

      {requestOpen && effective && check && (
        <RequestSheet choice={effective} recipient={recipientBody} masked={check.masked} onClose={() => setRequestOpen(false)} />
      )}
    </Screen>
  )
}

function RequestSheet({ choice, recipient, masked, onClose }: { choice: Choice; recipient: Record<string, unknown>; masked: string; onClose: () => void }) {
  const { t, tMaybe } = useI18n()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ request: RequestDTO; url: string } | null>(null)

  async function create() {
    setBusy(true); setError(null)
    try {
      setCreated(await api('/requests', { body: { kind: choice.kind, productId: choice.productId, packageId: choice.packageId, value: choice.value, note: note || undefined, ...recipient } }))
    } catch (e) { setError(errorText(e, tMaybe)) } finally { setBusy(false) }
  }
  const shareText = t('request.shareText', { label: choice.label, phone: masked })
  async function share() {
    if (!created) return
    if (navigator.share) await navigator.share({ title: 'Loadup', text: shareText, url: created.url }).catch(() => undefined)
    else await navigator.clipboard?.writeText(`${shareText} ${created.url}`).catch(() => undefined)
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="bg-surface w-full max-w-lg rounded-t-3xl p-5 pb-8 pb-safe space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">{created ? t('request.ready') : t('request.title')}</h2>
        {!created ? (
          <>
            <Card className="bg-surface-2"><div className="font-semibold">{choice.label}</div><div className="text-muted text-sm">{masked}</div></Card>
            <Input label={t('request.note')} placeholder={t('request.notePh')} value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} />
            {error && <Notice>{error}</Notice>}
            <Button onClick={create} loading={busy}>{t('request.create')}</Button>
          </>
        ) : (
          <div className="text-center space-y-4">
            <Qr value={created.url} size={180} />
            <div className="text-sm break-all bg-surface-2 rounded-xl p-3">{created.url}</div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={share}><IconShare size={18} />{t('common.share')}</Button>
              <CopyButton value={created.url} label={t('request.copyLink')} />
            </div>
            <Link to={`/r/${created.request.code}`} className="block text-brand-600 font-medium">{t('request.status')} →</Link>
          </div>
        )}
        <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
      </div>
    </div>
  )
}
