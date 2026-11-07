import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { Button, cx } from '../components/ui'
import { IconBolt, IconCheck, IconPhone } from '../components/icons'

export const ONBOARDED_KEY = 'loadup:onboarded'
export function isOnboarded() { try { return localStorage.getItem(ONBOARDED_KEY) === '1' } catch { return true } }

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [i, setI] = useState(0)
  const cards = [
    { icon: <IconPhone size={44} />, title: t('onboarding.c1Title'), body: t('onboarding.c1Body'), tint: 'from-brand-500 to-brand-700' },
    { icon: <IconBolt size={44} />, title: t('onboarding.c2Title'), body: t('onboarding.c2Body'), tint: 'from-gold-400 to-gold-500' },
    { icon: <IconCheck size={44} />, title: t('onboarding.c3Title'), body: t('onboarding.c3Body'), tint: 'from-emerald-400 to-emerald-600' },
  ]
  const finish = () => { try { localStorage.setItem(ONBOARDED_KEY, '1') } catch { /* ignore */ } onDone() }
  const c = cards[i]
  return (
    <div className="min-h-full flex flex-col bg-app pt-safe pb-safe">
      <div className="mx-auto max-w-lg w-full flex-1 flex flex-col px-6">
        <div className="flex justify-end h-14 items-center">
          <button className="text-muted font-medium px-2 py-2" onClick={finish}>{t('onboarding.skip')}</button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div key={i} className={cx('animate-pop h-28 w-28 rounded-[2rem] bg-gradient-to-br text-white grid place-items-center shadow-xl', c.tint)}>{c.icon}</div>
          <h1 className="mt-8 text-2xl font-bold">{c.title}</h1>
          <p className="mt-3 text-muted text-lg leading-relaxed">{c.body}</p>
        </div>
        <div className="flex justify-center gap-2 mb-6" aria-hidden>
          {cards.map((_, j) => <span key={j} className={cx('h-2 rounded-full transition-all', j === i ? 'w-6 bg-brand-600' : 'w-2 bg-black/15 dark:bg-white/20')} />)}
        </div>
        <div className="pb-6">
          {i < cards.length - 1
            ? <Button onClick={() => setI(i + 1)}>{t('onboarding.next')}</Button>
            : <Button onClick={finish}>{t('onboarding.start')}</Button>}
        </div>
      </div>
    </div>
  )
}
