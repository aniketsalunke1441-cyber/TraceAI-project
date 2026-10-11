import { useState } from 'react'
import { Link } from 'react-router-dom'
import { respondToClaim } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { initials, timeAgo } from '../lib/utils'
import Icon from './Icon'
import { ErrorBox, ItemImage, StatusBadge } from './ui'

/**
 * Shows one ownership claim.
 *  - role="owner"    -> the item reporter sees Approve / Reject buttons.
 *  - role="claimant" -> the person who claimed sees the status & reply.
 */
export default function ClaimCard({ claim, role, showItem = false, onChange }) {
  const { user } = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState(null) // 'approved' | 'rejected' | null
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (mode === 'approved' && note.trim().length < 5) {
      setError('Add pickup details so the owner knows where to collect the item.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await respondToClaim(claim, mode, note, user)
      toast.success(mode === 'approved' ? 'Claim approved. Item marked as returned.' : 'Claim rejected.')
      setMode(null)
      onChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card min-w-0 p-4 sm:p-5">
      {showItem && claim.item && (
        <Link to={`/items/${claim.item.id}`} className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 hover:bg-slate-100">
          <ItemImage item={claim.item} className="h-12 w-12 shrink-0 rounded-lg" emojiSize="text-2xl" />
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{claim.item.type === 'found' ? 'Found item' : 'Lost item'}</p>
            <p className="truncate text-sm font-bold text-slate-900">{claim.item.title}</p>
          </div>
        </Link>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
            {initials(claim.claimant_name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900">{role === 'owner' ? claim.claimant_name : 'Your claim'}</p>
            <p className="text-xs text-slate-500">{timeAgo(claim.created_at)}</p>
          </div>
        </div>
        <StatusBadge status={claim.status} />
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Proof / message</p>
        {claim.message}
      </div>

      {role === 'owner' && (
        <p className="mt-3 text-sm text-slate-600">
          <span className="font-semibold">Contact:</span> {claim.claimant_contact}
        </p>
      )}

      {claim.response_note && (
        <div
          className={`mt-3 rounded-xl p-3 text-sm ${
            claim.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
          }`}
        >
          <p className="mb-1 text-xs font-bold uppercase tracking-wide opacity-70">
            {claim.status === 'approved' ? 'Pickup details' : 'Reply'}
          </p>
          {claim.response_note}
        </div>
      )}

      {role === 'owner' && claim.status === 'pending' && (
        <div className="mt-4">
          {!mode ? (
            <div className="flex flex-wrap gap-2">
              <button className="btn-found" onClick={() => setMode('approved')}>
                <Icon name="check" className="h-4 w-4" /> Approve
              </button>
              <button className="btn-danger" onClick={() => setMode('rejected')}>
                <Icon name="x" className="h-4 w-4" /> Reject
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="label" htmlFor={`note-${claim.id}`}>
                {mode === 'approved'
                  ? 'Pickup details (where/when to collect, your contact)'
                  : 'Reason for rejecting (optional)'}
              </label>
              <textarea
                id={`note-${claim.id}`}
                rows={2}
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  mode === 'approved'
                    ? 'e.g. Collect from the security office, Gate 1, 10am–4pm. Call 98xxxxxx.'
                    : 'e.g. The details you gave do not match the item.'
                }
              />
              <ErrorBox message={error} />
              <div className="flex flex-wrap gap-2">
                <button className={mode === 'approved' ? 'btn-found' : 'btn-lost'} onClick={submit} disabled={busy}>
                  {busy ? 'Saving…' : mode === 'approved' ? 'Confirm approval' : 'Confirm rejection'}
                </button>
                <button className="btn-secondary" onClick={() => setMode(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
