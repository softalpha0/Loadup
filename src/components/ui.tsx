import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import type { OrderStatus } from '../../shared/types'
import { useI18n } from '../lib/i18n'
import { IconAlert, IconBack, IconCheck, IconClock, IconHome, IconList, IconSettings, IconX, IconBolt } from './icons'

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' ') }

export function Screen({ title, back, children, actions, bottomNav = false }: {
  title?: string; back?: boolean | string; children: ReactNode; actions?: ReactNode; bottomNav?: boolean
}) {
  const nav = useNavigate()
  const { t } = useI18n()
  return (
    <div className="min-h-full flex flex-col bg-app">
      {(title || back) && (
        <header className="sticky top-0 z-20 pt-safe bg-app/90 backdrop-blur">
          <div className="mx-auto max-w-lg flex items-center gap-2 px-4 h-14">
            {back && (
              <button aria-label={t('common.back')} onClick={() => (typeof back === 'string' ? nav(back) : history.length > 1 ? nav(-1) : nav('/'))}
                className="-ml-2 h-11 w-11 grid place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                <IconBack size={22} />
              </button>
            )}
            <h1 className="text-lg font-semibold truncate flex-1">{title}</h1>
            {actions}
          </div>
        </header>
      )}
      <main className={cx('mx-auto w-full max-w-lg flex-1 px-4', bottomNav ? 'pb-24' : 'pb-8')}>{children}</main>
      {bottomNav && <BottomNav />}
    </div>
  )
}

function BottomNav() {
  const { t } = useI18n()
  const item = (to: string, label: string, icon: ReactNode) => (
    <NavLink to={to} end className={({ isActive }) => cx('flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium', isActive ? 'text-brand-600 dark:text-brand-100' : 'text-muted')}>
      {icon}{label}
    </NavLink>
  )
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-app pb-safe">
      <div className="mx-auto max-w-lg flex">
        {item('/', 'Loadup', <IconHome size={22} />)}
        {item('/orders', t('orders.title'), <IconList size={22} />)}
        {item('/settings', t('settings.title'), <IconSettings size={22} />)}
      </div>
    </nav>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'pay' | 'danger'
export function Button({ variant = 'primary', loading, className, children, full = true, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; full?: boolean }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50',
    pay: 'bg-gradient-to-b from-gold-400 to-gold-500 text-ink shadow-lg shadow-gold-500/25 disabled:opacity-60',
    secondary: 'bg-surface border border-app hover:bg-surface-2 disabled:opacity-50',
    ghost: 'hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
  }
  return (
    <button {...rest} disabled={rest.disabled || loading}
      className={cx('min-h-12 px-5 rounded-2xl font-semibold text-base inline-flex items-center justify-center gap-2 transition active:scale-[.98]', full && 'w-full', styles[variant], className)}>
      {loading && <Spinner size={18} />}
      {children}
    </button>
  )
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cx('block w-full text-left bg-surface rounded-2xl border border-app p-4', onClick && 'active:scale-[.99] transition hover:border-brand-500/40', className)}>
      {children}
    </Tag>
  )
}

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx('animate-spin', className)} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export const STATUS_STYLE: Record<OrderStatus, { cls: string; icon: ReactNode }> = {
  created: { cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-300', icon: <IconClock size={14} /> },
  awaiting_payment: { cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: <IconClock size={14} /> },
  paid: { cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', icon: <IconBolt size={14} /> },
  processing: { cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', icon: <Spinner size={12} /> },
  delivered: { cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: <IconCheck size={14} /> },
  failed: { cls: 'bg-red-500/10 text-red-700 dark:text-red-300', icon: <IconX size={14} /> },
  expired: { cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-300', icon: <IconClock size={14} /> },
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n()
  const s = STATUS_STYLE[status]
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', s.cls)}>{s.icon}{t(`status.${status}`)}</span>
}

export function Input({ label, hint, error, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string | null }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium mb-1.5">{label}</span>}
      <input {...rest} className={cx('w-full h-12 rounded-xl border bg-surface px-4 text-base outline-none focus:ring-2 focus:ring-brand-500/40', error ? 'border-red-500' : 'border-app', className)} />
      {error ? <span className="block text-sm text-red-600 mt-1">{error}</span> : hint ? <span className="block text-sm text-muted mt-1">{hint}</span> : null}
    </label>
  )
}

export function Notice({ kind = 'error', children }: { kind?: 'error' | 'info' | 'warn'; children: ReactNode }) {
  const cls = kind === 'error' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : kind === 'warn' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'bg-blue-500/10 text-blue-800 dark:text-blue-200'
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('flex gap-2 rounded-xl px-3.5 py-3 text-sm', cls)}>
      {kind !== 'info' && <IconAlert size={18} className="shrink-0 mt-0.5" />}
      <div>{children}</div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-center text-muted py-10 px-6">{children}</p>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mt-6 mb-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-app last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-right break-all">{children}</span>
    </div>
  )
}

export function PoweredBy() {
  const { t } = useI18n()
  return <p className="text-center text-xs text-muted mt-8">{t('common.poweredBy')}</p>
}

// ── toast ─────────────────────────────────────────────────────────
const ToastCtx = createContext<(msg: string) => void>(() => undefined)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2200)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 rounded-full bg-ink text-white dark:bg-white dark:text-ink px-4 py-2 text-sm shadow-lg">{msg}</div>
      )}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n()
  const toast = useToast()
  return (
    <Button variant="secondary" full={false} className="min-h-10 px-3 text-sm" onClick={async () => {
      try { await navigator.clipboard.writeText(value) } catch {
        const ta = document.createElement('textarea'); ta.value = value; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
      }
      toast(t('common.copied'))
    }}>{label ?? t('common.copy')}</Button>
  )
}
