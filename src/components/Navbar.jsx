import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { initials } from '../lib/utils'
import { listClaimsForUser } from '../lib/api'
import NotificationBell from './NotificationBell'

export function Logo({ light = false }) {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="FindBack home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
        <Icon name="search" className="h-5 w-5" strokeWidth={2.6} />
      </span>
      <span className={`text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>
        Find<span className="text-indigo-600">Back</span>
      </span>
    </Link>
  )
}

const navClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pendingClaims, setPendingClaims] = useState(0)
  const { pathname } = useLocation()

  // Refresh the "claims waiting for you" badge whenever the page changes.
  useEffect(() => {
    if (!user) return
    let active = true
    listClaimsForUser(user.id)
      .then(({ incoming }) => active && setPendingClaims(incoming.filter((c) => c.status === 'pending').length))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [user, pathname])
  const badge = user ? pendingClaims : 0

  const links = user
    ? [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/browse', label: 'Browse' },
        { to: '/my-reports', label: 'My Reports' },
        { to: '/claims', label: 'Claims' },
      ]
    : [{ to: '/browse', label: 'Browse' }]

  async function handleLogout() {
    await signOut()
    setOpen(false)
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={navClass}>
              {l.label}
              {l.to === '/claims' && badge > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1">
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <Link to="/report/lost" className="btn-lost px-3 py-2">
                <Icon name="plus" className="h-4 w-4" /> Lost
              </Link>
              <Link to="/report/found" className="btn-found px-3 py-2">
                <Icon name="plus" className="h-4 w-4" /> Found
              </Link>
              <div className="ml-2 flex items-center gap-2 border-l border-slate-200 pl-3">
                <span
                  className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white"
                  title={user.email}
                >
                  {initials(user.name)}
                </span>
                <button onClick={handleLogout} className="btn-ghost px-2 py-2" title="Log out" aria-label="Log out">
                  <Icon name="logout" className="h-5 w-5" />
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">
                Log in
              </Link>
              <Link to="/signup" className="btn-primary">
                Get started
              </Link>
            </>
          )}
        </div>

        {user && <NotificationBell user={user} />}
        <button
          className="btn-ghost relative px-2 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <Icon name={open ? 'close' : 'menu'} className="h-6 w-6" />
          {badge > 0 && !open && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" />}
        </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {user && (
              <div className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  {initials(user.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
            )}
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navClass} onClick={() => setOpen(false)}>
                {l.label}
                {l.to === '/claims' && badge > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
                )}
              </NavLink>
            ))}
            {user ? (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Link to="/report/lost" className="btn-lost" onClick={() => setOpen(false)}>
                    Report Lost
                  </Link>
                  <Link to="/report/found" className="btn-found" onClick={() => setOpen(false)}>
                    Report Found
                  </Link>
                </div>
                <button onClick={handleLogout} className="btn-secondary mt-2">
                  <Icon name="logout" className="h-4 w-4" /> Log out
                </button>
              </>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link to="/login" className="btn-secondary" onClick={() => setOpen(false)}>
                  Log in
                </Link>
                <Link to="/signup" className="btn-primary" onClick={() => setOpen(false)}>
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
