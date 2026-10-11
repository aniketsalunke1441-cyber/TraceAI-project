import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ErrorBox } from '../components/ui'
import { Logo } from '../components/Navbar'
import { DEMO_USERS, DEMO_PASSWORD } from '../lib/demoData'

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">{footer}</p>
      </div>
    </div>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Login() {
  const { signIn, user, isDemo } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/dashboard'
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={redirectTo} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    if (!EMAIL_RE.test(form.email)) return setError('Please enter a valid email address.')
    if (!form.password) return setError('Please enter your password.')
    setBusy(true)
    setError('')
    try {
      await signIn(form)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed.')
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to report items, see matches and manage claims."
      footer={
        <>
          New to FindBack?{' '}
          <Link to="/signup" className="font-bold text-indigo-600 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input"
            placeholder="you@college.edu"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="input"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <ErrorBox message={error} />
        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      {isDemo && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Demo accounts (password: {DEMO_PASSWORD})</p>
          <div className="mt-3 grid gap-2">
            {DEMO_USERS.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setForm({ email: u.email, password: DEMO_PASSWORD })}
                className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm ring-1 ring-amber-200 hover:ring-amber-400"
              >
                <span className="font-semibold text-slate-800">{u.name}</span>
                <span className="text-xs text-slate-500">{u.email}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-amber-800">Click one to fill the form, then press Log in.</p>
        </div>
      )}
    </AuthShell>
  )
}

export function Signup() {
  const { signUp, user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.name.trim().length < 2) return setError('Please enter your full name.')
    if (!EMAIL_RE.test(form.email)) return setError('Please enter a valid email address.')
    if (form.password.length < 6) return setError('Password must be at least 6 characters.')
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    setBusy(true)
    setError('')
    try {
      const result = await signUp(form)
      if (result.needsConfirmation) {
        setInfo('Account created! Check your email to confirm your address, then log in.')
        setBusy(false)
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      setError(err.message || 'Sign up failed.')
      setBusy(false)
    }
  }

  const field = (name, label, type = 'text', placeholder = '', autoComplete) => (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        type={type}
        className="input"
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={form[name]}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
      />
    </div>
  )

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join FindBack to report and recover items."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-indigo-600 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {info ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {field('name', 'Full name', 'text', 'e.g. Harsh Varsani', 'name')}
          {field('email', 'Email', 'email', 'you@college.edu', 'email')}
          {field('password', 'Password', 'password', 'At least 6 characters', 'new-password')}
          {field('confirm', 'Confirm password', 'password', 'Repeat password', 'new-password')}
          <ErrorBox message={error} />
          <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
            {busy ? 'Creating account…' : 'Sign up'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
