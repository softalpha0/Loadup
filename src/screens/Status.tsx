import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { Card, Row, Screen, Spinner, cx } from '../components/ui'

interface Health { ok: boolean; db: string; provider: { name: string; configured: boolean; reachable: boolean; detail?: string }; time: string }

export default function Status() {
  const { t } = useI18n()
  const [h, setH] = useState<Health | null>(null)
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  useEffect(() => {
    fetch('/api/health').then(async (r) => { setApiOk(true); setH(await r.json()) }).catch(() => setApiOk(false))
  }, [])
  const dot = (ok: boolean | undefined) => <span className={cx('inline-block h-2.5 w-2.5 rounded-full mr-2', ok ? 'bg-emerald-500' : 'bg-red-500')} />
  return (
    <Screen title={t('statusPage.title')} back>
      <Card className="mt-2">
        {apiOk === null ? <div className="py-6 grid place-items-center"><Spinner /></div> : (
          <>
            <Row label={t('statusPage.api')}>{dot(apiOk)}{apiOk ? t('statusPage.ok') : t('statusPage.down')}</Row>
            {h && <>
              <Row label={t('statusPage.db')}>{dot(h.db === 'ok')}{h.db === 'ok' ? t('statusPage.ok') : t('statusPage.down')}</Row>
              <Row label={t('statusPage.provider')}>{h.provider.name}</Row>
              <Row label={t('statusPage.configured')}>{dot(h.provider.configured)}{h.provider.configured ? t('common.yes') : t('statusPage.notConfigured')}</Row>
              <Row label={t('statusPage.reachable')}>{dot(h.provider.reachable)}{h.provider.reachable ? t('common.yes') : t('common.no')}</Row>
              <p className="text-xs text-muted mt-3">{h.time}</p>
            </>}
          </>
        )}
      </Card>
    </Screen>
  )
}
