import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Navbar, { Logo } from './Navbar'
import { useAuth } from '../context/AuthContext'
import { checkConnection, checkMatchingService, resetDemoData } from '../lib/api'
import Icon from './Icon'
import { Spinner } from './ui'

export function DemoBanner() {
  const { isDemo } = useAuth()
  if (!isDemo) return null

  function handleReset() {
    if (window.confirm('Reset all demo data to the original sample reports? You will be logged out.')) {
      resetDemoData()
      window.location.href = '/'
    }
  }

  return (
    <div className="bg-amber-100 text-amber-900">
      <div className="container-page flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-xs font-medium sm:text-sm">
        <span>
          <strong>DEMO MODE</strong> — sample data stored in this browser only. Add Firebase credentials in <code>.env</code> to go live.
        </span>
        <button onClick={handleReset} className="font-bold underline underline-offset-2 hover:text-amber-700">
          Reset demo data
        </button>
      </div>
    </div>
  )
}

/** Live mode only: shown when the app cannot reach the database. */
function ConnectionErrorBanner({ status }) {
  if (!status || status.ok || status.mode === 'demo') return null
  const backendLabel = status.mode === 'firebase' ? 'Firebase' : 'Supabase'
  return (
    <div className="bg-rose-600 text-white" role="alert">
      <div className="container-page flex items-start justify-center gap-2 py-2 text-center text-xs font-medium sm:text-sm">
        <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>{backendLabel} database problem:</strong> {status.message}
        </span>
      </div>
    </div>
  )
}

/** Says which backend is in use. "Connected" is shown only after a real query succeeded. */
function BackendStatus({ status }) {
  let text = 'Checking database…'
  let dot = 'bg-slate-300'
  if (status?.mode === 'demo') {
    text = 'Demo mode · data saved in this browser only'
    dot = 'bg-amber-500'
  } else if (status?.mode === 'firebase') {
    if (status.ok) {
      text = 'Live database · Firebase connected'
      dot = 'bg-emerald-500'
    } else {
      text = 'Firebase configured · not reachable'
      dot = 'bg-rose-500'
    }
  } else if (status?.ok) {
    text = 'Live database · Supabase connected'
    dot = 'bg-emerald-500'
  } else if (status) {
    text = 'Database configured · not reachable'
    dot = 'bg-rose-500'
  }
  return (
    <p className="flex items-center gap-2 text-xs font-semibold text-slate-500" data-testid="backend-status">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <Icon name="database" className="h-3.5 w-3.5" /> {text}
    </p>
  )
}


/** Which engine computes matches: the Python FastAPI service (if configured and online) or the browser. */
function MatchingStatus({ service }) {
  if (!service) return null
  let text = 'Matching: in-browser engine'
  let dot = 'bg-slate-400'
  if (service.configured && service.ok) {
    text = `Matching: Python API ${service.version || ''} online`
    dot = 'bg-emerald-500'
  } else if (service.configured) {
    text = 'Matching: Python API offline · using in-browser engine'
    dot = 'bg-amber-500'
  }
  return (
    <p className="flex items-center gap-2 text-xs font-semibold text-slate-500" data-testid="matching-status">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <Icon name="sparkles" className="h-3.5 w-3.5" /> {text}
    </p>
  )
}

export function Footer({ status, service }) {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white">
      <div className="container-page flex flex-col items-center justify-between gap-4 py-8 text-sm text-slate-500 sm:flex-row">
        <Logo />
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <BackendStatus status={status} />
          <MatchingStatus service={service} />
        </div>
        <p>© {new Date().getFullYear()} FindBack · Reuniting people with their belongings.</p>
      </div>
    </footer>
  )
}

export default function Layout() {
  const [status, setStatus] = useState(null)
  const [service, setService] = useState(null)
  useEffect(() => {
    checkConnection().then(setStatus)
    checkMatchingService().then(setService)
  }, [])
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <ConnectionErrorBanner status={status} />
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer status={status} service={service} />
    </div>
  )
}

/** Wrap pages that need a logged-in user. */
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}
