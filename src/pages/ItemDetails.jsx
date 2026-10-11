import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createClaim, deleteItem, describeMatchEngine, getItem, getMatches, listClaimsForItem, refreshMatches, updateItemStatus } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { formatDate, shortName, timeAgo } from '../lib/utils'
import Icon from '../components/Icon'
import { MatchCard } from '../components/ItemCard'
import ClaimCard from '../components/ClaimCard'
import { BackLink, EmptyState, ErrorBox, ItemImage, Spinner, StatusBadge, TypeBadge } from '../components/ui'

function Detail({ icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  )
}

function ClaimForm({ item, user, onDone }) {
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState(user.email)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()
  const isFound = item.type === 'found'

  async function handleSubmit(e) {
    e.preventDefault()
    if (message.trim().length < 15) return setError('Please describe it in more detail (at least 15 characters).')
    if (contact.trim().length < 5) return setError('Please add a phone number or email.')
    setBusy(true)
    setError('')
    try {
      await createClaim({ item, user, message, contact })
      toast.success('Claim sent. The reporter has been notified.')
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div>
        <label htmlFor="claim-message" className="label">
          {isFound ? 'Prove it is yours' : 'Tell the owner what you found'}
        </label>
        <textarea
          id="claim-message"
          rows={4}
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            isFound
              ? 'Describe details only the owner would know: contents, marks, lock-screen, serial number…'
              : 'Describe where you found it and some details so the owner can confirm.'
          }
        />
      </div>
      <div>
        <label htmlFor="claim-contact" className="label">
          Your contact (only shared with the reporter)
        </label>
        <input id="claim-contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <ErrorBox message={error} />
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        <Icon name="shield" className="h-4 w-4" />
        {busy ? 'Sending…' : isFound ? 'Submit ownership claim' : 'Send “I found it” response'}
      </button>
    </form>
  )
}

export default function ItemDetails() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isNew = searchParams.get('new') === '1'
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const latestRequest = useRef(0) // ignore responses from older, slower requests

  const [item, setItem] = useState(undefined)
  const [matches, setMatches] = useState(null)
  const [claims, setClaims] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current
    const isLatest = () => requestId === latestRequest.current
    try {
      const found = await getItem(id)
      if (!isLatest()) return
      setItem(found)
      if (!found) return
      // The reporter's own view keeps the saved matches fresh (new reports may have arrived).
      if (user && found.user_id === user.id && found.status === 'open')
        await refreshMatches(found, user).catch((e) => console.warn('Match refresh failed', e))
      const [m, c] = await Promise.all([getMatches(found), listClaimsForItem(id, user)])
      if (!isLatest()) return
      setMatches(m)
      setClaims(c)
    } catch (err) {
      if (isLatest()) setError(err.message)
    }
  }, [id, user])

  useEffect(() => {
    if (!authLoading) load() // wait until we know who is logged in
  }, [load, authLoading])

  if (error) return <div className="container-page py-10"><ErrorBox message={error} /></div>
  if (item === undefined) return <Spinner />
  if (item === null)
    return (
      <div className="container-page py-10">
        <EmptyState
          icon="search"
          title="Report not found"
          text="It may have been deleted."
          action={<Link to="/browse" className="btn-primary">Browse reports</Link>}
        />
      </div>
    )

  const isOwner = user?.id === item.user_id
  const myClaim = user ? claims.find((c) => c.claimant_id === user.id && c.status !== 'rejected') || claims.find((c) => c.claimant_id === user.id) : null
  const ownerClaims = isOwner ? claims : []

  const approvedClaim = claims.find((c) => c.status === 'approved')

  async function recalculate() {
    setRecalculating(true)
    try {
      const count = await refreshMatches(item, user)
      setMatches(await getMatches(item))
      toast.success(`Matches recalculated and saved (${count} found) · ${describeMatchEngine()}.`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRecalculating(false)
    }
  }

  async function toggleStatus() {
    setBusy(true)
    try {
      const next = item.status === 'open' ? 'resolved' : 'open'
      await updateItemStatus(item.id, next, user)
      toast.success(next === 'resolved' ? 'Marked as returned.' : 'Report re-opened. Matches recalculated.')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this report permanently?')) return
    setBusy(true)
    try {
      await deleteItem(item.id, user, item)
      toast.success('Report deleted.')
      navigate('/my-reports', { replace: true })
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="container-page py-8 sm:py-10">
      <BackLink />

      {isNew && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Your report is live!</p>
            <p className="text-sm">
              We have already compared it with all {item.type === 'lost' ? 'found' : 'lost'} reports and saved the potential matches below.
            </p>
          </div>
        </div>
      )}

      {item.status === 'resolved' && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-slate-800">
          <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-bold">{approvedClaim ? 'Ownership verified ✓' : 'Returned to its owner'}</p>
            <p className="text-sm text-slate-500">
              {approvedClaim
                ? `The reporter approved ${approvedClaim.claimant_id === user?.id ? 'your' : `${approvedClaim.claimant_name}'s`} ownership claim.`
                : 'This report is closed.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: item info */}
        <div className="space-y-6 lg:col-span-3">
          <div className="card overflow-hidden">
            <ItemImage item={item} className="aspect-[16/10] w-full" />
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={item.type} />
                <StatusBadge status={item.status} />
                <span className="chip bg-slate-100 text-slate-600">{item.category}</span>
              </div>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{item.title}</h1>
              <p className="mt-1 text-sm text-slate-500">
                Reported by {isOwner ? 'you' : shortName(item.reporter_name)} · {timeAgo(item.created_at)}
              </p>
              <p className="mt-5 whitespace-pre-line leading-relaxed text-slate-700">{item.description}</p>
              <div className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
                <Detail icon="map" label={item.type === 'lost' ? 'Last seen at' : 'Found at'} value={item.location} />
                <Detail icon="calendar" label={item.type === 'lost' ? 'Date lost' : 'Date found'} value={formatDate(item.date)} />
                <Detail icon="tag" label="Colour" value={item.color} />
                <Detail icon="tag" label="Brand" value={item.brand} />
              </div>

              {isOwner && (
                <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-6">
                  <Link to={`/items/${item.id}/edit`} className="btn-secondary">
                    <Icon name="edit" className="h-4 w-4" /> Edit
                  </Link>
                  <button className="btn-secondary" onClick={toggleStatus} disabled={busy}>
                    <Icon name={item.status === 'open' ? 'check' : 'refresh'} className="h-4 w-4" />
                    {item.status === 'open' ? 'Mark as returned' : 'Re-open report'}
                  </button>
                  <button className="btn-danger" onClick={handleDelete} disabled={busy}>
                    <Icon name="trash" className="h-4 w-4" /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: claim panel */}
        <aside className="space-y-4 lg:col-span-2">
          {isOwner ? (
            <div>
              <h2 className="mb-3 text-lg font-extrabold text-slate-900">
                {item.type === 'found' ? 'Ownership claims' : '“I found it” responses'} ({ownerClaims.length})
              </h2>
              {ownerClaims.length === 0 ? (
                <EmptyState icon="shield" title="No claims yet" text="When someone responds to this report, you can review it here." />
              ) : (
                <div className="space-y-3">
                  {ownerClaims.map((c) => (
                    <ClaimCard key={c.id} claim={c} role="owner" onChange={load} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card p-5 sm:p-6">
              <h2 className="text-lg font-extrabold text-slate-900">
                {item.type === 'found' ? 'Is this yours?' : 'Have you found this?'}
              </h2>
              <p className="mb-4 mt-1 text-sm text-slate-500">
                {item.type === 'found'
                  ? 'Submit a claim with proof. The finder reviews it and shares pickup details if approved.'
                  : 'Let the owner know. They will confirm and arrange the hand-over.'}
              </p>
              {!user ? (
                <Link to="/login" state={{ from: `/items/${item.id}` }} className="btn-primary w-full">
                  Log in to respond
                </Link>
              ) : myClaim ? (
                <ClaimCard claim={myClaim} role="claimant" />
              ) : item.status !== 'open' ? (
                <p className="rounded-xl bg-slate-100 p-3 text-sm font-medium text-slate-600">
                  This item has already been returned to its owner.
                </p>
              ) : (
                <ClaimForm item={item} user={user} onDone={load} />
              )}
              {myClaim?.status === 'rejected' && item.status === 'open' && (
                <p className="mt-3 text-xs text-slate-500">Your previous claim was rejected.</p>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* AI matches */}
      <section className="mt-10">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
              <Icon name="sparkles" className="h-4 w-4" />
            </span>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Potential matches</h2>
          </div>
          {isOwner && item.status === 'open' && (
            <button className="btn-secondary px-3 py-2" onClick={recalculate} disabled={recalculating}>
              <Icon name="refresh" className="h-4 w-4" /> {recalculating ? 'Recalculating…' : 'Recalculate'}
            </button>
          )}
        </div>
        <p className="mb-1 text-sm text-slate-500">
          {item.type === 'lost' ? 'Found' : 'Lost'} reports ranked by similarity of description, category, colour, location and date. The bars show how strongly each signal matched.
        </p>
        <p className="mb-4 flex items-start gap-1.5 text-xs font-medium text-amber-700">
          <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
          AI suggestions only — not proof of ownership. Ownership is verified only when the reporter approves a claim.
        </p>
        {matches === null ? (
          <Spinner label="Finding matches…" />
        ) : matches.length === 0 ? (
          <EmptyState
            icon="sparkles"
            title={item.status === 'open' ? 'No likely matches yet' : 'Matching stopped'}
            text={
              item.status === 'open'
                ? 'We will keep comparing as new reports come in. Check back soon.'
                : 'This report is closed, so it is no longer matched with other reports.'
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {matches.map((m) => (
              <MatchCard key={m.item.id} match={m} detailed />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
