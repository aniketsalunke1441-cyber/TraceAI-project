import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listClaimsForUser, listMyItems } from '../lib/api'
import { formatDate } from '../lib/utils'
import Icon from '../components/Icon'
import { EmptyState, ErrorBox, ItemImage, PageHeader, Spinner, StatusBadge, TypeBadge } from '../components/ui'

const TABS = [
  ['all', 'All'],
  ['lost', 'Lost'],
  ['found', 'Found'],
]

export default function MyReports() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'all'
  const [items, setItems] = useState(null)
  const [claimCounts, setClaimCounts] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.id) return
    let active = true
    Promise.all([listMyItems(user.id), listClaimsForUser(user.id)])
      .then(([mine, claims]) => {
        if (!active) return
        setItems((mine || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
        const counts = {}
        for (const c of claims?.incoming || []) if (c.status === 'pending') counts[c.item_id] = (counts[c.item_id] || 0) + 1
        setClaimCounts(counts)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
    return () => {
      active = false
    }
  }, [user?.id])

  const visible = items ? items.filter((i) => tab === 'all' || i.type === tab) : []

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader title="My reports" subtitle="Everything you have reported as lost or found.">
        <Link to="/report/lost" className="btn-lost">
          <Icon name="plus" className="h-4 w-4" /> Lost
        </Link>
        <Link to="/report/found" className="btn-found">
          <Icon name="plus" className="h-4 w-4" /> Found
        </Link>
      </PageHeader>

      <div className="mb-5 inline-flex rounded-xl bg-slate-200/70 p-1">
        {TABS.map(([value, label]) => (
          <button
            type="button"
            key={value}
            onClick={() => setParams(value === 'all' ? {} : { tab: value }, { replace: true })}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              tab === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
            {items && <span className="ml-1.5 text-xs text-slate-400">{items.filter((i) => value === 'all' || i.type === value).length}</span>}
          </button>
        ))}
      </div>

      <ErrorBox message={error} />

      {!items && !error ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No reports here yet"
          text="Report a lost or found item and it will appear here."
          action={<Link to="/report/lost" className="btn-primary">Report an item</Link>}
        />
      ) : (
        <div className="card divide-y divide-slate-100">
          {visible.map((item) => (
            <Link key={item.id} to={`/items/${item.id}`} className="flex items-center gap-4 p-4 transition hover:bg-slate-50">
              <ItemImage item={item} className="h-16 w-16 shrink-0 rounded-xl" emojiSize="text-3xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <TypeBadge type={item.type} />
                  <StatusBadge status={item.status} />
                  {claimCounts[item.id] > 0 && (
                    <span className="chip bg-amber-100 text-amber-800">
                      {claimCounts[item.id]} claim{claimCounts[item.id] > 1 ? 's' : ''} to review
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate font-bold text-slate-900">{item.title}</p>
                <p className="truncate text-sm text-slate-500">
                  {item.location} · {formatDate(item.date)}
                </p>
              </div>
              <Icon name="arrowRight" className="hidden h-5 w-5 shrink-0 text-slate-300 sm:block" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
