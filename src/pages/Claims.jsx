import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { listClaimsForUser } from '../lib/api'
import ClaimCard from '../components/ClaimCard'
import { EmptyState, ErrorBox, PageHeader, Spinner } from '../components/ui'

export default function Claims() {
  const { user } = useAuth()
  const [claims, setClaims] = useState(null)
  const [tab, setTab] = useState('incoming')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    listClaimsForUser(user.id)
      .then(setClaims)
      .catch((err) => setError(err.message))
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  const list = claims ? claims[tab] : []
  const pending = claims ? claims.incoming.filter((c) => c.status === 'pending').length : 0

  return (
    <div className="container-page max-w-4xl py-8 sm:py-10">
      <PageHeader title="Ownership claims" subtitle="Review claims on your reports and track the ones you made." />

      <div className="mb-5 inline-flex rounded-xl bg-slate-200/70 p-1">
        {[
          ['incoming', `On my reports${pending ? ` (${pending} pending)` : ''}`],
          ['outgoing', 'My claims'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              tab === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorBox message={error} />

      {!claims && !error ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState
          icon="shield"
          title={tab === 'incoming' ? 'No claims on your reports' : 'You have not made any claims'}
          text={
            tab === 'incoming'
              ? 'When someone says an item you reported is theirs, it shows up here.'
              : 'Found your item in Browse? Open it and submit an ownership claim.'
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((c) => (
            <ClaimCard key={c.id} claim={c} role={tab === 'incoming' ? 'owner' : 'claimant'} showItem onChange={load} />
          ))}
        </div>
      )}
    </div>
  )
}
