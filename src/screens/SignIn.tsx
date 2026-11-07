import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { toWalletError } from '../lib/nimiq'
import { ApiError } from '../lib/api'
import { errorText } from '../lib/errors'
import { Button, Notice, PoweredBy } from '../components/ui'
import { IconBolt } from '../components/icons'

export default function SignIn() {
  const { t, tMaybe } = useI18n()
  const { signIn } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function go() {
    setBusy(true); setError(null)
    try {
      await signIn()
    } catch (e) {
      setError(e instanceof ApiError ? errorText(e, tMaybe) : (tMaybe(`errors.${toWalletError(e).type}`) ?? t('signin.failed')))
    } finally { setBusy(false) }
  }
  return (
    <div className="min-h-full flex flex-col bg-app pt-safe pb-safe">
      <div className="mx-auto max-w-lg w-full flex-1 flex flex-col px-6">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="h-20 w-20 rounded-3xl bg-brand-600 text-white grid place-items-center shadow-lg"><IconBolt size={40} /></div>
          <h1 className="mt-6 text-3xl font-bold">Loadup</h1>
          <p className="mt-2 text-muted">{t('tagline')}</p>
          <h2 className="mt-10 text-xl font-semibold">{t('signin.title')}</h2>
          <p className="mt-2 text-muted">{t('signin.body')}</p>
        </div>
        <div className="space-y-3 pb-6">
          {error && <Notice>{error}</Notice>}
          <Button onClick={go} loading={busy}>{busy ? t('signin.working') : t('signin.button')}</Button>
          <Link to="/about" className="block text-center text-sm text-muted underline">{t('settings.privacy')}</Link>
          <PoweredBy />
        </div>
      </div>
    </div>
  )
}
