import { useI18n } from '../lib/i18n'
import { deepLinks, NIMIQ_PAY_ANDROID, NIMIQ_PAY_IOS } from '../lib/nimiq'
import { Button, PoweredBy } from '../components/ui'
import { IconAlert, IconBolt } from '../components/icons'
import { Link } from 'react-router-dom'

export function BrowserFallback() {
  const { t, dict } = useI18n()
  const links = deepLinks(window.location.href)
  return (
    <div className="min-h-full bg-app">
      <div className="mx-auto max-w-lg px-6 py-12 text-center">
        <div className="mx-auto h-20 w-20 rounded-3xl bg-brand-600 text-white grid place-items-center shadow-lg"><IconBolt size={40} /></div>
        <h1 className="mt-6 text-3xl font-bold">{t('fallback.title')}</h1>
        <p className="mt-3 text-muted text-lg">{t('fallback.body')}</p>
        <div className="mt-8 space-y-3">
          <a href={links.universal}><Button>{t('fallback.open')}</Button></a>
          <a href={links.scheme} className="block text-sm text-muted underline">nimiqpay://</a>
        </div>
        <ol className="mt-10 text-left space-y-3">
          {dict.fallback.steps.map((s, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="h-7 w-7 shrink-0 rounded-full bg-brand-600 text-white grid place-items-center text-sm font-bold">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-10 font-semibold">{t('fallback.get')}</p>
        <div className="mt-3 flex gap-3 justify-center">
          <a className="rounded-xl border border-app bg-surface px-4 py-3 font-medium" href={NIMIQ_PAY_IOS} target="_blank" rel="noreferrer">{t('fallback.ios')}</a>
          <a className="rounded-xl border border-app bg-surface px-4 py-3 font-medium" href={NIMIQ_PAY_ANDROID} target="_blank" rel="noreferrer">{t('fallback.android')}</a>
        </div>
        <div className="mt-8 flex gap-4 justify-center text-sm text-muted underline">
          <Link to="/about">{t('settings.privacy')}</Link>
          <Link to="/status">{t('settings.status')}</Link>
        </div>
        <PoweredBy />
      </div>
    </div>
  )
}

export function TestnetGate() {
  const { t } = useI18n()
  return (
    <div className="min-h-full bg-app grid place-items-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto h-20 w-20 rounded-3xl bg-amber-500/15 text-amber-600 grid place-items-center"><IconAlert size={40} /></div>
        <h1 className="mt-6 text-2xl font-bold">{t('network.title')}</h1>
        <p className="mt-3 text-muted">{t('network.body')}</p>
      </div>
    </div>
  )
}
