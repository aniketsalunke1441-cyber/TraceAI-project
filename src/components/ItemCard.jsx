import { Link } from 'react-router-dom'
import Icon from './Icon'
import { ItemImage, MatchRing, StatusBadge, TypeBadge } from './ui'
import { formatDate, timeAgo } from '../lib/utils'
import { matchLabel } from '../lib/matching'

export default function ItemCard({ item }) {
  return (
    <Link
      to={`/items/${item.id}`}
      className="card group flex min-w-0 flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200"
    >
      <div className="relative">
        <ItemImage item={item} className="aspect-[4/3] w-full" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <TypeBadge type={item.type} />
          {item.status !== 'open' && <StatusBadge status={item.status} />}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.category}</p>
        <h3 className="mt-1 line-clamp-2 font-bold text-slate-900 group-hover:text-indigo-700">{item.title}</h3>
        <div className="mt-3 space-y-1.5 text-sm text-slate-500">
          <p className="flex items-center gap-1.5">
            <Icon name="map" className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{item.location}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <Icon name="calendar" className="h-4 w-4 shrink-0 text-slate-400" />
            {formatDate(item.date)}
          </p>
        </div>
        <p className="mt-auto pt-3 text-xs text-slate-400">Posted {timeAgo(item.created_at)}</p>
      </div>
    </Link>
  )
}

/** One AI match result row. */
export function MatchCard({ match, detailed = false }) {
  const { item, score, reasons, breakdown = [] } = match
  const { label } = matchLabel(score)
  return (
    <Link
      to={`/items/${item.id}`}
      className="card flex min-w-0 gap-3 p-4 transition hover:border-indigo-200 sm:gap-4 hover:shadow-md"
    >
      <ItemImage item={item} className="h-14 w-14 shrink-0 rounded-xl sm:h-24 sm:w-24" emojiSize="text-2xl sm:text-4xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <TypeBadge type={item.type} />
              <span className="text-xs font-bold text-indigo-600">{label}</span>
              <span className="text-[11px] font-medium text-slate-400">· unverified</span>
            </div>
            <h4 className="line-clamp-2 font-bold leading-snug text-slate-900">{item.title}</h4>
            <p className="truncate text-sm text-slate-500">
              {item.location} · {formatDate(item.date)}
            </p>
          </div>
          <MatchRing score={score} size={52} />
        </div>
        {reasons.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {reasons.slice(0, 4).map((r) => (
              <li key={r} className="chip bg-slate-100 font-medium text-slate-600">
                {r}
              </li>
            ))}
          </ul>
        )}
        {detailed && breakdown.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 sm:grid-cols-3" aria-label="Score breakdown">
            {breakdown.map((b) => (
              <div key={b.key} title={`${b.label}: ${b.value}% similar (weight ${Math.round(b.weight * 100)}%)`}>
                <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                  <span>{b.label}</span>
                  <span>{b.value}%</span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${b.value >= 70 ? 'bg-emerald-500' : b.value >= 40 ? 'bg-indigo-500' : 'bg-slate-300'}`}
                    style={{ width: `${b.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
