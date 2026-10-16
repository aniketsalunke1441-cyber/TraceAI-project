import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { firstInitial } from '../lib/utils'
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
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const [pendingClaims, setPendingClaims] = useState(0)
  const { pathname } = useLocation()
  const dropdownRef = useRef(null)

  // Automatically close menus on page navigation
  useEffect(() => {
    setOpen(false)
    setProfileDropdownOpen(false)
  }, [pathname])

  // Close profile dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setProfileDropdownOpen(false)
      }
    }
    if (profileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [profileDropdownOpen])

  // Refresh the "claims waiting for you" badge whenever the page changes.
  useEffect(() => {
    if (!user?.id) return
    let active = true
    listClaimsForUser(user.id)
      .then((res) => {
        if (!active) return
        const incoming = Array.isArray(res?.incoming) ? res.incoming : []
        setPendingClaims(incoming.filter((c) => c.status === 'pending').length)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [user?.id, pathname])
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
    setProfileDropdownOpen(false)
    setOpen(false)
    try {
      navigate('/', { replace: true })
      await signOut()
    } catch (err) {
      console.warn('Logout notice:', err?.message)
    }
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

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <>
                <Link to="/report/lost" className="btn-lost px-3 py-2">
                  <Icon name="plus" className="h-4 w-4" /> Lost
                </Link>
                <Link to="/report/found" className="btn-found px-3 py-2">
                  <Icon name="plus" className="h-4 w-4" /> Found
                </Link>

                {/* Profile menu dropdown container */}
                <div className="relative ml-1 border-l border-slate-200 pl-3" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setProfileDropdownOpen((v) => !v)}
                    aria-expanded={profileDropdownOpen}
                    aria-haspopup="true"
                    id="profile-dropdown-btn"
                    className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2.5 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                    title={`Logged in as ${user.name}`}
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white shadow-sm ring-2 ring-indigo-500/20"
                      aria-hidden="true"
                    >
                      {firstInitial(user.name, user.email)}
                    </span>
                    <span className="max-w-[130px] truncate text-sm font-semibold text-slate-800 lg:max-w-[170px]">
                      {user.name}
                    </span>
                    <Icon
                      name="chevronDown"
                      className={`h-4 w-4 text-slate-400 transition-transform duration-150 ${
                        profileDropdownOpen ? 'rotate-180 text-slate-600' : ''
                      }`}
                    />
                  </button>

                  {/* Profile Dropdown Menu */}
                  {profileDropdownOpen && (
                    <div
                      role="menu"
                      aria-orientation="vertical"
                      aria-labelledby="profile-dropdown-btn"
                      className="absolute right-0 mt-2 w-64 origin-top-right rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xl shadow-slate-900/10 z-50 animate-in fade-in"
                    >
                      {/* User details header */}
                      <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white shadow-sm">
                          {firstInitial(user.name, user.email)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900" title={user.name}>
                            {user.name}
                          </p>
                          <p className="truncate text-xs text-slate-500" title={user.email}>
                            {user.email}
                          </p>
                        </div>
                      </div>

                      <div className="my-1.5 border-t border-slate-100" />

                      {/* Dropdown links */}
                      <div className="space-y-0.5">
                        <Link
                          to="/profile"
                          onClick={() => setProfileDropdownOpen(false)}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                          role="menuitem"
                        >
                          <Icon name="user" className="h-4 w-4 text-slate-500" />
                          <span>My Profile</span>
                        </Link>
                        <Link
                          to="/my-reports"
                          onClick={() => setProfileDropdownOpen(false)}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                          role="menuitem"
                        >
                          <Icon name="tag" className="h-4 w-4 text-slate-500" />
                          <span>My Reports</span>
                        </Link>
                        <Link
                          to="/claims"
                          onClick={() => setProfileDropdownOpen(false)}
                          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                          role="menuitem"
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon name="shield" className="h-4 w-4 text-slate-500" />
                            <span>Claims</span>
                          </div>
                          {badge > 0 && (
                            <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {badge}
                            </span>
                          )}
                        </Link>
                      </div>

                      <div className="my-1.5 border-t border-slate-100" />

                      {/* Logout button */}
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                        role="menuitem"
                      >
                        <Icon name="logout" className="h-4 w-4 text-rose-500" />
                        <span>Logout</span>
                      </button>
                    </div>
                  )}
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
            type="button"
            className="btn-ghost relative px-2 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            <Icon name={open ? 'close' : 'menu'} className="h-6 w-6" />
            {badge > 0 && !open && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {user && (
              <Link
                to="/profile"
                onClick={() => setOpen(false)}
                className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  {firstInitial(user.name, user.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
                <span className="text-xs font-semibold text-indigo-600">Profile &rarr;</span>
              </Link>
            )}
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navClass} onClick={() => setOpen(false)}>
                {l.label}
                {l.to === '/claims' && badge > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
                )}
              </NavLink>
            ))}
            {user && (
              <NavLink to="/profile" className={navClass} onClick={() => setOpen(false)}>
                My Profile
              </NavLink>
            )}
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
                <button type="button" onClick={handleLogout} className="btn-secondary mt-2">
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
