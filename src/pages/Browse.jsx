import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listItems } from '../lib/api'
import { CATEGORIES } from '../lib/constants'
import { filterItems } from '../lib/utils'
import ItemCard from '../components/ItemCard'
import Icon from '../components/Icon'
import { EmptyState, ErrorBox, PageHeader, Spinner } from '../components/ui'

const DEFAULTS = { q: '', type: 'all', category: 'all', status: 'open', sort: 'newest' }

export default function Browse() {
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  // Filters live in the URL so results can be shared / bookmarked.
  const filters = {
    q: params.get('q') ?? DEFAULTS.q,
    type: params.get('type') ?? DEFAULTS.type,
    category: params.get('category') ?? DEFAULTS.category,
    status: params.get('status') ?? DEFAULTS.status,
    sort: params.get('sort') ?? DEFAULTS.sort,
  }

  function setFilter(key, value) {
    const next = new URLSearchParams(params)
    if (value === DEFAULTS[key]) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    listItems()
      .then(setItems)
      .catch((err) => setError(err.message))
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const results = useMemo(() => (items ? filterItems(items, filters) : []), [items, params.toString()])

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader title="Browse reports" subtitle="Search everything that has been lost or found on campus." />

      {/* Filters */}
      <div className="card mb-6 space-y-4 p-4 sm:p-5">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="input pl-11"
            placeholder="Search by name, description, place, brand…"
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            aria-label="Search reports"
          />
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Report type">
            {[
              ['all', 'All'],
              ['lost', 'Lost'],
              ['found', 'Found'],
            ].map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={filters.type === value}
                onClick={() => setFilter('type', value)}
                className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-semibold transition sm:flex-none ${
                  filters.type === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <select className="input" value={filters.category} onChange={(e) => setFilter('category', e.target.value)} aria-label="Category">
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select className="input" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
              <option value="open">Open only</option>
              <option value="resolved">Returned</option>
              <option value="all">Any status</option>
            </select>
            <select className="input" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Sort">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>
      </div>

      <ErrorBox message={error} />

      {!items && !error ? (
        <Spinner label="Loading reports…" />
      ) : (
        <>
          <p className="mb-4 text-sm font-medium text-slate-500">
            {results.length} result{results.length === 1 ? '' : 's'}
          </p>
          {results.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nothing matches your search"
              text="Try different words or clear some filters."
              action={
                <button className="btn-secondary" onClick={() => setParams({}, { replace: true })}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
