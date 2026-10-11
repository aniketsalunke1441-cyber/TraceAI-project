import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listItems } from '../lib/api'
import Icon from '../components/Icon'
import { MatchRing } from '../components/ui'

const STEPS = [
  {
    icon: 'plus',
    title: 'Report in 60 seconds',
    text: 'Post a lost or found item with a photo, category, colour, place and date.',
  },
  {
    icon: 'sparkles',
    title: 'AI finds matches',
    text: 'Our matching engine compares descriptions, colours, places and dates and gives every pair a score.',
  },
  {
    icon: 'shield',
    title: 'Verified hand-over',
    text: 'Owners submit a claim with proof. The finder approves it and shares pickup details.',
  },
]

const FEATURES = [
  { icon: 'search', title: 'Smart search & filters', text: 'Search by keyword, category, type and status in real time.' },
  { icon: 'sparkles', title: 'Explainable match score', text: 'See why two reports match: shared words, colour, place, timing.' },
  { icon: 'shield', title: 'Ownership claims', text: 'Proof-based claims keep items out of the wrong hands.' },
  { icon: 'grid', title: 'Personal dashboard', text: 'Track your reports, matches and claims in one place.' },
  { icon: 'image', title: 'Photo uploads', text: 'Images are compressed in your browser before upload.' },
  { icon: 'list', title: 'Works on any device', text: 'Fully responsive — report something right from your phone.' },
]

export default function Landing() {
  const { user } = useAuth()
  const [stats, setStats] = useState({ lost: 0, found: 0, resolved: 0 })

  useEffect(() => {
    listItems()
      .then((items) =>
        setStats({
          lost: items.filter((i) => i.type === 'lost').length,
          found: items.filter((i) => i.type === 'found').length,
          resolved: items.filter((i) => i.status === 'resolved').length,
        }),
      )
      .catch(() => {})
  }, [])

  return (
    <div>
      {/* ---------- HERO ---------- */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-indigo-600/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 right-0 h-[26rem] w-[26rem] rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="container-page relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
          <div>
            <span className="chip bg-white/10 px-3 py-1 text-indigo-200 ring-1 ring-white/15">
              <Icon name="sparkles" className="h-3.5 w-3.5" /> AI-assisted Lost & Found
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Lost it? <br />
              <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
                FindBack it.
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-slate-300">
              Report lost and found items on campus. Our matching engine connects owners with finders automatically — with a
              match score you can trust.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={user ? '/report/lost' : '/signup'} className="btn-lost px-5 py-3 text-base">
                I lost something
              </Link>
              <Link to={user ? '/report/found' : '/signup'} className="btn-found px-5 py-3 text-base">
                I found something
              </Link>
              <Link to="/browse" className="btn px-5 py-3 text-base text-white ring-1 ring-white/25 hover:bg-white/10">
                Browse reports <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
              {[
                ['Lost reports', stats.lost],
                ['Found reports', stats.found],
                ['Returned', stats.resolved],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-400">{label}</dt>
                  <dd className="text-2xl font-extrabold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Illustration: an example match */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur">
              <div className="rounded-2xl bg-white p-4 text-slate-800 shadow-2xl">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-rose-100 text-2xl">📱</span>
                  <div className="min-w-0">
                    <span className="chip bg-rose-100 text-rose-700">Lost</span>
                    <p className="truncate font-bold">Black iPhone 13, blue case</p>
                    <p className="text-xs text-slate-500">Central Library · 3 days ago</p>
                  </div>
                </div>
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <MatchRing score={91} size={64} />
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-100 text-2xl">📱</span>
                  <div className="min-w-0">
                    <span className="chip bg-emerald-100 text-emerald-700">Found</span>
                    <p className="truncate font-bold">Black Apple phone in blue cover</p>
                    <p className="text-xs text-slate-500">Library, 2nd floor · 2 days ago</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {['Same category', 'Same colour', 'Shared words: phone, case', 'Found 1 day later'].map((r) => (
                    <span key={r} className="chip bg-slate-100 font-medium text-slate-600">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">Example of a match card</p>
          </div>
        </div>
      </section>

      {/* ---------- HOW IT WORKS ---------- */}
      <section className="container-page py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">How it works</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">From lost to returned in 3 steps</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card relative p-6">
              <span className="absolute right-5 top-4 text-5xl font-extrabold text-slate-100">{i + 1}</span>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white">
                <Icon name={s.icon} />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-slate-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- FEATURES ---------- */}
      <section className="border-y border-slate-200 bg-white py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Features</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Everything a campus lost & found desk needs
            </h2>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Icon name={f.icon} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{f.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="container-page py-16 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl bg-indigo-600 px-6 py-12 text-center text-white sm:px-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10" />
          <h2 className="relative text-3xl font-extrabold tracking-tight">Help someone get their things back today</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-indigo-100">
            Every report makes the matching smarter for everyone on campus.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link to={user ? '/dashboard' : '/signup'} className="btn bg-white px-6 py-3 text-indigo-700 hover:bg-indigo-50">
              {user ? 'Go to dashboard' : 'Create free account'}
            </Link>
            <Link to="/browse" className="btn px-6 py-3 text-white ring-1 ring-white/40 hover:bg-white/10">
              Browse reports
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
