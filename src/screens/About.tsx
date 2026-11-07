import { useI18n } from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { Card, Screen, SectionTitle, PoweredBy } from '../components/ui'

export default function About() {
  const { t, dict } = useI18n()
  const { config } = useAuth()
  return (
    <Screen title={t('about.title')} back>
      <SectionTitle>{t('settings.privacy')}</SectionTitle>
      <Card>
        <ul className="space-y-3 list-disc pl-5">
          {dict.about.disclosures.map((d) => <li key={d}>{d}</li>)}
        </ul>
      </Card>
      <SectionTitle>{t('settings.faq')}</SectionTitle>
      <div className="space-y-2">
        {dict.about.faq.map(([q, a]) => (
          <details key={q} className="bg-surface rounded-2xl border border-app px-4 py-3 group">
            <summary className="font-medium cursor-pointer list-none flex justify-between gap-2">{q}<span className="text-muted group-open:rotate-45 transition">+</span></summary>
            <p className="mt-2 text-muted">{a}</p>
          </details>
        ))}
      </div>
      {(config?.supportEmail || config?.supportUrl) && (
        <>
          <SectionTitle>{t('settings.help')}</SectionTitle>
          <Card>
            {config.supportUrl && <a className="block text-brand-600 underline" href={config.supportUrl} target="_blank" rel="noreferrer">{config.supportUrl}</a>}
            {config.supportEmail && <a className="block text-brand-600 underline" href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>}
          </Card>
        </>
      )}
      <p className="mt-6 text-sm text-muted text-center">MIT · <a className="underline" href="https://github.com/softalpha0/loadup" target="_blank" rel="noreferrer">github.com/softalpha0/loadup</a></p>
      <PoweredBy />
    </Screen>
  )
}
