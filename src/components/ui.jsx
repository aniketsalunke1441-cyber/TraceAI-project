import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { CATEGORY_EMOJI } from '../lib/constants'
import { matchLabel } from '../lib/matching'

export function TypeBadge({ type }) {
  return type === 'lost' ? (
    <span className="chip bg-rose-100 text-rose-700">● Lost</span>
  ) : (
    <span className="chip bg-emerald-100 text-emerald-700">● Found</span>
  )
}

export function StatusBadge({ status }) {
  const styles = {
    open: 'bg-sky-100 text-sky-700',
    resolved: 'bg-slate-200 text-slate-700',
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-700',
  }
  const labels = { open: 'Open', resolved: 'Returned ✓', pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }
  return <span className={`chip ${styles[status] || 'bg-slate-100 text-slate-600'}`}>{labels[status] || status}</span>
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

export function ErrorBox({ message }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function EmptyState({ icon = 'inbox', title, text, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ItemImage({ item, className = '', emojiSize = 'text-5xl' }) {
  if (!item) {
    return (
      <div className={`grid place-items-center bg-slate-100 ${className}`} aria-label="No photo">
        <span className={`${emojiSize} drop-shadow-sm`}>📦</span>
      </div>
    )
  }
  if (item.image_url) {
    return <img src={item.image_url} alt={item.title || 'Item photo'} className={`object-cover ${className}`} loading="lazy" />
  }
  const bg = item.type === 'lost' ? 'from-rose-100 to-orange-50' : 'from-emerald-100 to-sky-50'
  return (
    <div className={`grid place-items-center bg-gradient-to-br ${bg} ${className}`} aria-label="No photo">
      <span className={`${emojiSize} drop-shadow-sm`}>{CATEGORY_EMOJI[item.category] || '📦'}</span>
    </div>
  )
}

/** Circular match score, e.g. "87%". */
export function MatchRing({ score, size = 56 }) {
  const { tone } = matchLabel(score)
  const colors = { emerald: '#059669', indigo: '#4f46e5', amber: '#d97706' }
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Match score ${score}%`}>
      <svg viewBox="0 0 50 50" className="h-full w-full -rotate-90">
        <circle cx="25" cy="25" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle
          cx="25"
          cy="25"
          r={r}
          fill="none"
          stroke={colors[tone]}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (score / 100) * c}
        />
      </svg>
      <span className={`absolute inset-0 grid place-items-center font-extrabold text-slate-900 ${size < 60 ? "text-xs" : "text-sm"}`}>{score}%</span>
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function BackLink({ to, label = 'Back' }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const fallback = auth?.user ? '/dashboard' : '/browse'
  const cls = 'mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900'
  const content = (
    <>
      <Icon name="arrowLeft" className="h-4 w-4" /> {label}
    </>
  )
  if (to) return <Link to={to} className={cls}>{content}</Link>
  return (
    <button
      type="button"
      // Go back if we came from inside the app, otherwise fall back to dashboard or browse.
      onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback))}
      className={cls}
    >
      {content}
    </button>
  )
}
