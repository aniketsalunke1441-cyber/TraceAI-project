import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMatchesForItems, listClaimsForUser, listItems } from '../lib/api'
import Icon from '../components/Icon'
import ItemCard, { MatchCard } from '../components/ItemCard'
import { EmptyState, ErrorBox, Spinner } from '../components/ui'

function StatCard({ label, value, icon, tone, to }) {
  const tones = {
    rose: 'bg-rose-50 text-rose-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  }
  return (
    <Link to={to} className="card flex items-center gap-4 p-4 transition hover:shadow-md sm:p-5">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
        <Icon name={icon} />
      </span>
      <div>
        <p className="text-2xl font-extrabold text-slate-900">{value}</p>
        <p className="text-xs font-semibold text-slate-500 sm:text-sm">{label}</p>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.id) return
    Promise.all([listItems(), listClaimsForUser(user.id)])
      .then(async ([items, claims]) => {
        const mine = (items || []).filter((i) => i.user_id === user.id)
        const open = mine.filter((i) => i.status === 'open')
        // potential matches saved in the database for each of my open reports
        const saved = await getMatchesForItems(open, 3)
        const matches = open.map((i) => ({ item: i, matches: saved.get(i.id) || [] })).filter((m) => m.matches.length > 0)
        const recent = (items || []).filter((i) => i.user_id !== user.id && i.status === 'open').slice(0, 4)
        setData({ mine, matches, claims: claims || { incoming: [], outgoing: [] }, recent })
      })
      .catch((err) => setError(err.message))
  }, [user?.id])

  if (error) return <div className="container-page py-10"><ErrorBox message={error} /></div>
  if (!data) return <Spinner label="Loading your dashboard…" />

  const { mine, matches, claims, recent } = data
  const pendingIncoming = claims.incoming.filter((c) => c.status === 'pending').length
  const firstName = (user?.name || '').trim().split(' ')[0] || 'there'

  return (
    <div className="container-page py-8 sm:py-10">
      {/* Greeting + quick actions */}
      <div className="flex flex-col gap-5 rounded-3xl bg-slate-950 p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-sm text-slate-400">Dashboard</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Hi {firstName} 👋</h1>
          <p className="mt-1 text-slate-300">
            {matches.length > 0
              ? `We found potential matches for ${matches.length} of your reports.`
              : 'Report an item and we will start matching right away.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Link to="/report/lost" className="btn-lost">
            <Icon name="plus" className="h-4 w-4" /> Report Lost
          </Link>
          <Link to="/report/found" className="btn-found">
            <Icon name="plus" className="h-4 w-4" /> Report Found
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="My lost reports" value={mine.filter((i) => i.type === 'lost').length} icon="search" tone="rose" to="/my-reports?tab=lost" />
        <StatCard label="My found reports" value={mine.filter((i) => i.type === 'found').length} icon="inbox" tone="emerald" to="/my-reports?tab=found" />
        <StatCard label="Claims to review" value={pendingIncoming} icon="shield" tone="amber" to="/claims" />
        <StatCard label="Items returned" value={mine.filter((i) => i.status === 'resolved').length} icon="check" tone="indigo" to="/my-reports" />
      </div>

      {pendingIncoming > 0 && (
        <Link
          to="/claims"
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 hover:bg-amber-100"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="alert" className="h-5 w-5" />
            You have {pendingIncoming} ownership claim{pendingIncoming > 1 ? 's' : ''} waiting for your decision.
          </span>
          <Icon name="arrowRight" className="h-5 w-5 shrink-0" />
        </Link>
      )}

      {/* AI matches */}
      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
            <Icon name="sparkles" className="h-4 w-4" />
          </span>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">AI matches for your reports</h2>
          <span className="chip bg-amber-100 text-amber-800">Potential — not verified</span>
        </div>
        {matches.length === 0 ? (
          <EmptyState
            icon="sparkles"
            title="No matches yet"
            text="When someone posts a report similar to yours, it will appear here with a match score."
            action={<Link to="/report/lost" className="btn-primary">Report an item</Link>}
          />
        ) : (
          <div className="space-y-6">
            {matches.map(({ item, matches: list }) => (
              <div key={item.id} className="card p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-500">
                    Matches for your {item.type} report:{' '}
                    <Link to={`/items/${item.id}`} className="font-bold text-slate-900 hover:text-indigo-700">
                      {item.title}
                    </Link>
                  </p>
                  <Link to={`/items/${item.id}`} className="text-sm font-semibold text-indigo-600 hover:underline">
                    View report →
                  </Link>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {list.map((m) => (
                    <MatchCard key={m.item.id} match={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent community reports */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Recent reports on campus</h2>
          <Link to="/browse" className="text-sm font-semibold text-indigo-600 hover:underline">
            See all →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {recent.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </div>
  )
}
