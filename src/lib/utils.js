// Small helper functions shared across the app.

export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function timeAgo(value) {
  if (!value) return ''
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [name, size] of units) {
    const n = Math.floor(seconds / size)
    if (n >= 1) return `${n} ${name}${n > 1 ? 's' : ''} ago`
  }
  return 'just now'
}

export function todayISO() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export function daysAgoISO(n) {
  const d = new Date(Date.now() - n * 86400000)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export function resolveDisplayName(name = '', email = '') {
  const clean = (name || '').trim()
  if (clean) return clean
  if (email && typeof email === 'string' && email.includes('@')) {
    const localPart = email.split('@')[0].trim()
    if (localPart) return localPart
  }
  return 'User'
}

export function firstInitial(name = '', email = '') {
  const displayName = resolveDisplayName(name, email)
  const trimmed = displayName.trim()
  return (trimmed[0] || 'U').toUpperCase()
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?'
}

/** Shorten "Priya Sharma" -> "Priya S." to protect privacy on public pages. */
export function shortName(name = '') {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return parts[0] || 'Anonymous'
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

/** Search / filter / sort a list of items (used by Browse page). */
export function filterItems(items, { q = '', type = 'all', category = 'all', status = 'open', sort = 'newest' } = {}) {
  const query = q.trim().toLowerCase()
  let result = items.filter((item) => {
    if (type !== 'all' && item.type !== type) return false
    if (category !== 'all' && item.category !== category) return false
    if (status !== 'all' && item.status !== status) return false
    if (query) {
      const haystack = [item.title, item.description, item.location, item.brand, item.color, item.category]
        .join(' ')
        .toLowerCase()
      return query.split(/\s+/).every((word) => haystack.includes(word))
    }
    return true
  })
  result = [...result].sort((a, b) => {
    const diff = new Date(b.created_at) - new Date(a.created_at)
    return sort === 'oldest' ? -diff : diff
  })
  return result
}
