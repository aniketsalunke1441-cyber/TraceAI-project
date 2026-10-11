import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { listNotifications, markNotificationsRead } from '../lib/api'
import { timeAgo } from '../lib/utils'
import Icon from './Icon'

/** Bell icon with unread count. Notifications are created by the database (claims, decisions, strong matches). */
export default function NotificationBell({ user }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const { pathname } = useLocation()
  const box = useRef(null)

  useEffect(() => {
    let active = true
    listNotifications(user)
      .then((list) => {
        if (active) {
          setItems(list)
          setError('')
        }
      })
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [user, pathname])

  useEffect(() => setOpen(false), [pathname])

  // close when clicking outside
  useEffect(() => {
    if (!open) return
    const onClick = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const unread = items.filter((n) => !n.read_at).length

  async function markAll() {
    try {
      await markNotificationsRead(user)
      setItems((list) => list.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="relative" ref={box}>
      <button
        className="btn-ghost relative px-2 py-2"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
      >
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-4 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-semibold text-indigo-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {error && <p className="px-4 py-3 text-sm text-rose-600">{error}</p>}
          {!error && items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</p>}
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  to={n.link || '/dashboard'}
                  onClick={() => !n.read_at && markNotificationsRead(user, [n.id]).catch(() => {})}
                  className={`flex gap-3 px-4 py-3 text-sm hover:bg-slate-50 ${n.read_at ? '' : 'bg-indigo-50/50'}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-indigo-600'}`} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">{n.title}</span>
                    <span className="block text-slate-600">{n.body}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">{timeAgo(n.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
