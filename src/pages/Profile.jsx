import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { firstInitial } from '../lib/utils'
import { backendName, listClaimsForUser, listItems } from '../lib/api'
import Icon from '../components/Icon'
import { ErrorBox, Spinner } from '../components/ui'

export default function Profile() {
  const { user, updateProfile, signOut } = useAuth()
  const { pushToast } = useToast()
  const navigate = useNavigate()

  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({ lost: 0, found: 0, claims: 0, loading: true })

  useEffect(() => {
    if (user?.name) setName(user.name)
  }, [user?.name])

  useEffect(() => {
    if (!user) return
    let active = true

    Promise.all([listItems(), listClaimsForUser(user.id)])
      .then(([items, claimsData]) => {
        if (!active) return
        const mine = items.filter((i) => i.user_id === user.id)
        const lost = mine.filter((i) => i.type === 'lost').length
        const found = mine.filter((i) => i.type === 'found').length
        const totalClaims = (claimsData?.outgoing?.length || 0) + (claimsData?.incoming?.length || 0)
        setStats({ lost, found, claims: totalClaims, loading: false })
      })
      .catch(() => {
        if (active) setStats((s) => ({ ...s, loading: false }))
      })

    return () => {
      active = false
    }
  }, [user])

  async function handleUpdateName(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name cannot be empty.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateProfile({ name: trimmed })
      pushToast('Profile name updated successfully!', 'success')
    } catch (err) {
      setError(err.message || 'Could not update profile name.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await signOut()
    navigate('/')
  }

  if (!user) {
    return <Spinner label="Loading profile..." />
  }

  return (
    <div className="container-page py-8 sm:py-12">
      {/* Page Title & Breadcrumb */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-indigo-600">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-slate-800">User Profile</span>
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          My Profile
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your FindBack account details, display name, and activity.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Card */}
        <div className="card p-6 sm:p-8 lg:col-span-2 space-y-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-slate-900 text-3xl font-extrabold text-white shadow-md ring-4 ring-indigo-500/10">
              {firstInitial(user.name, user.email)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold text-slate-900 sm:text-2xl truncate">
                  {user.name}
                </h2>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                  {backendName}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500 truncate">{user.email}</p>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Edit Display Name Form */}
          <form onSubmit={handleUpdateName} className="space-y-4">
            <div>
              <label htmlFor="display-name" className="label">
                Display Name
              </label>
              <input
                id="display-name"
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bharat Prajapat"
                maxLength={80}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                This name is displayed in the navigation bar, on your lost &amp; found reports, and on claims.
              </p>
            </div>

            <ErrorBox message={error} />

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                className="btn-primary py-2.5 px-5"
                disabled={saving || name.trim() === user.name}
              >
                {saving ? 'Saving changes…' : 'Save changes'}
              </button>
              {name.trim() !== user.name && (
                <button
                  type="button"
                  onClick={() => {
                    setName(user.name)
                    setError('')
                  }}
                  className="btn-ghost py-2.5 px-4 text-xs"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <hr className="border-slate-100" />

          {/* Account Details */}
          <div>
            <h3 className="text-sm font-bold text-slate-900">Account Details</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3.5">
                <p className="text-xs font-medium text-slate-500">Registered Email</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 truncate">{user.email}</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3.5">
                <p className="text-xs font-medium text-slate-500">Account ID</p>
                <p className="mt-0.5 text-xs font-mono text-slate-700 truncate">{user.id}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar / Stats Card */}
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-base font-bold text-slate-900">Your Activity</h3>
            <p className="mt-1 text-xs text-slate-500">Summary of items reported and claims.</p>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-2xl font-extrabold text-rose-600">{stats.lost}</p>
                <p className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider">Lost</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-2xl font-extrabold text-emerald-600">{stats.found}</p>
                <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Found</p>
              </div>
              <div className="rounded-xl bg-indigo-50 p-3">
                <p className="text-2xl font-extrabold text-indigo-600">{stats.claims}</p>
                <p className="text-[11px] font-semibold text-indigo-800 uppercase tracking-wider">Claims</p>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <Link to="/my-reports" className="btn-secondary w-full justify-center">
                <Icon name="tag" className="h-4 w-4" /> View My Reports
              </Link>
              <Link to="/claims" className="btn-secondary w-full justify-center">
                <Icon name="shield" className="h-4 w-4" /> View Claims
              </Link>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-bold text-slate-900">Session</h3>
            <p className="mt-1 text-xs text-slate-500">
              Sign out from this device to protect your account.
            </p>
            <button
              onClick={handleLogout}
              className="btn-danger mt-4 w-full justify-center"
            >
              <Icon name="logout" className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
