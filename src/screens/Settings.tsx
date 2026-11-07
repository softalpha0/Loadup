import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { exitFullscreen, getFullscreen, requestFullscreen } from '@nimiq/mini-app-sdk'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { LOCALE_NAMES, useI18n, type Locale } from '../lib/i18n'
import { flag, shortAddress } from '../lib/format'
import { Button, Card, Empty, Screen, SectionTitle, cx, useToast } from '../components/ui'
import { IconChevron, IconTrash } from '../components/icons'
import { ONBOARDED_KEY } from './Onboarding'
import { setToken } from '../lib/api'

export default function Settings() {
  const { t, locale, setLocale } = useI18n()
  const { me, refresh, signOut, config } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [editing, setEditing] = useState<string | null>(null)
  const [nick, setNick] = useState('')
  const [fs, setFs] = useState(false)

  async function changeLocale(l: Locale) {
    setLocale(l)
    await api('/me', { method: 'PATCH', body: { locale: l } }).catch(() => undefined)
  }
  async function toggleFullscreen() {
    try {
      const on = await getFullscreen().catch(() => fs)
      if (on) { await exitFullscreen(); setFs(false) }
      else if (window.confirm(t('settings.fullscreenAsk'))) { await requestFullscreen(); setFs(true) }
    } catch { toast(t('errors.UNSUPPORTED')) }
  }
  async function deleteAll() {
    if (!window.confirm(t('settings.deleteConfirm'))) return
    await api('/me', { method: 'DELETE' })
    setToken(null)
    toast(t('settings.deleted'))
    await refresh()
    nav('/')
  }
  const link = (to: string, label: string) => (
    <Link to={to} className="flex items-center justify-between py-3 border-b border-app last:border-0 font-medium">{label}<IconChevron size={18} className="text-muted" /></Link>
  )

  return (
    <Screen title={t('settings.title')} bottomNav>
      {me && (
        <Card className="mt-1">
          <div className="text-sm text-muted">{t('settings.wallet')}</div>
          <div className="font-mono text-sm mt-0.5">{shortAddress(me.address)}</div>
          <div className="text-sm text-muted mt-3">{t('settings.limits')}</div>
          <div className="text-sm">{t('settings.limitsBody', { order: me.limits.perOrderUsd, day: me.limits.perDayUsd, used: me.limits.usedTodayUsd.toFixed(2) })}</div>
        </Card>
      )}

      <SectionTitle>{t('settings.language')}</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => (
          <button key={l} onClick={() => changeLocale(l)} aria-pressed={locale === l}
            className={cx('h-12 rounded-xl border font-medium', locale === l ? 'border-brand-600 bg-brand-500/10 text-brand-700 dark:text-brand-100' : 'border-app bg-surface')}>{LOCALE_NAMES[l]}</button>
        ))}
      </div>

      <SectionTitle>{t('settings.saved')}</SectionTitle>
      {!me?.savedNumbers.length ? <Empty>{t('settings.noSaved')}</Empty> : (
        <div className="space-y-2">
          {me.savedNumbers.map((n) => (
            <Card key={n.id}>
              {editing === n.id ? (
                <form className="flex gap-2" onSubmit={async (e) => {
                  e.preventDefault()
                  await api(`/saved-numbers/${n.id}`, { method: 'PATCH', body: { nickname: nick } }).catch(() => undefined)
                  setEditing(null); refresh()
                }}>
                  <input autoFocus value={nick} maxLength={40} onChange={(e) => setNick(e.target.value)} className="flex-1 h-10 rounded-lg border border-app bg-surface px-3" />
                  <Button full={false} className="min-h-10" type="submit">{t('common.save')}</Button>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{flag(n.country)} {n.nickname}</div>
                    <div className="text-sm text-muted">{n.masked}</div>
                  </div>
                  <button className="text-sm text-brand-600 font-medium px-2 py-2" onClick={() => { setEditing(n.id); setNick(n.nickname) }}>{t('settings.rename')}</button>
                  <button aria-label={t('common.delete')} className="h-10 w-10 grid place-items-center rounded-xl text-red-600 bg-red-500/10"
                    onClick={async () => { await api(`/saved-numbers/${n.id}`, { method: 'DELETE' }); refresh() }}><IconTrash size={18} /></button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>Loadup</SectionTitle>
      <Card className="py-1">
        {link('/about', `${t('settings.privacy')} · ${t('settings.faq')}`)}
        {link('/esims', t('esim.mine'))}
        {link('/status', t('settings.status'))}
        {(config?.supportUrl || config?.supportEmail) && (
          <a href={config.supportUrl ?? `mailto:${config.supportEmail}`} target="_blank" rel="noreferrer" className="flex items-center justify-between py-3 border-b border-app last:border-0 font-medium">{t('settings.help')}<IconChevron size={18} className="text-muted" /></a>
        )}
        <button onClick={toggleFullscreen} className="w-full flex items-center justify-between py-3 border-b border-app font-medium">{t('settings.fullscreen')}<IconChevron size={18} className="text-muted" /></button>
        <button onClick={() => { try { localStorage.removeItem(ONBOARDED_KEY) } catch { /* ignore */ } window.location.assign('/') }} className="w-full flex items-center justify-between py-3 font-medium">{t('settings.intro')}<IconChevron size={18} className="text-muted" /></button>
      </Card>

      <div className="space-y-2 mt-6">
        <Button variant="secondary" onClick={() => signOut()}>{t('settings.signOut')}</Button>
        <Button variant="danger" onClick={deleteAll}>{t('settings.deleteData')}</Button>
      </div>
    </Screen>
  )
}
