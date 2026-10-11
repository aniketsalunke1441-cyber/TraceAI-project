/**
 * FindBack AI-assisted matching engine
 * ------------------------------------
 * Compares a LOST report with FOUND reports (or the other way round) and
 * returns a match score from 0–100 plus human-readable reasons.
 *
 * How it works (lightweight NLP, runs fully in the browser, no API key):
 *  1. Text is normalised: lower-cased, punctuation removed, stop-words dropped,
 *     simple stemming, and synonyms mapped to one word (e.g. "mobile",
 *     "iphone", "smartphone" -> "phone").
 *  2. Title + description + brand become word-frequency vectors and are
 *     compared with cosine similarity (the same idea used in search engines).
 *  3. Structured signals are added: category, colour, brand, location
 *     overlap and how close the dates are.
 *  4. Each signal has a weight; the weighted sum is the final score.
 */

const STOP_WORDS = new Set(
  `a an and are as at be been but by for from has have i in is it its my of on or our that the this to was were with
  lost found near item please contact me if any someone left behind around inside outside very some one my we
  there here it's got get had did not no yes`.split(/\s+/),
)

// Words in the same group are treated as the same concept.
const SYNONYM_GROUPS = [
  ['phone', 'mobile', 'smartphone', 'iphone', 'cellphone', 'cell', 'android', 'handset'],
  ['wallet', 'purse', 'billfold', 'cardholder'],
  ['bag', 'backpack', 'rucksack', 'satchel', 'schoolbag', 'knapsack', 'tote', 'handbag'],
  ['earbud', 'earbuds', 'airpod', 'airpods', 'earphone', 'earphones', 'headphone', 'headphones', 'buds', 'tws'],
  ['key', 'keys', 'keychain', 'keyring', 'fob'],
  ['laptop', 'macbook', 'chromebook', 'thinkpad'],
  ['charger', 'adapter', 'adaptor', 'cable', 'charging'],
  ['id', 'idcard', 'identity', 'icard', 'badge'],
  ['card', 'cards'],
  ['bottle', 'flask', 'sipper', 'tumbler'],
  ['watch', 'smartwatch', 'wristwatch'],
  ['glasses', 'spectacles', 'specs', 'sunglasses', 'eyeglasses', 'shades'],
  ['jacket', 'hoodie', 'sweatshirt', 'coat', 'sweater', 'jumper'],
  ['umbrella', 'brolly'],
  ['notebook', 'diary', 'journal', 'register'],
  ['book', 'textbook', 'novel'],
  ['calculator', 'calc'],
  ['ring', 'band'],
  ['chain', 'necklace', 'pendant'],
  ['cover', 'case', 'pouch', 'sleeve'],
  ['library', 'lib'],
  ['canteen', 'cafeteria', 'cafe', 'mess', 'foodcourt'],
  ['auditorium', 'hall', 'theatre', 'theater'],
  ['lab', 'laboratory'],
  ['gate', 'entrance'],
  ['parking', 'carpark', 'lot'],
  ['gym', 'sports', 'fitness'],
]

const SYNONYMS = new Map()
for (const group of SYNONYM_GROUPS) for (const word of group) SYNONYMS.set(word, group[0])

const COLOR_FAMILIES = {
  black: 'dark',
  gray: 'neutral',
  grey: 'neutral',
  silver: 'neutral',
  white: 'light',
  blue: 'blue',
  navy: 'blue',
  red: 'red',
  maroon: 'red',
  pink: 'red',
  green: 'green',
  yellow: 'yellow',
  gold: 'yellow',
  orange: 'yellow',
  purple: 'purple',
  brown: 'brown',
  beige: 'brown',
}

function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.length > 4 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

export function tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map((w) => SYNONYMS.get(w) || SYNONYMS.get(stem(w)) || stem(w))
}

function vectorize(tokens) {
  const vec = new Map()
  for (const t of tokens) vec.set(t, (vec.get(t) || 0) + 1)
  return vec
}

function cosine(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  for (const [k, v] of a) {
    na += v * v
    if (b.has(k)) dot += v * b.get(k)
  }
  for (const v of b.values()) nb += v * v
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function itemText(item) {
  // Title is repeated so it counts twice as much as the description.
  return `${item.title} ${item.title} ${item.description || ''} ${item.brand || ''}`
}

function colorScore(a, b) {
  const x = (a || '').toLowerCase().trim()
  const y = (b || '').toLowerCase().trim()
  if (!x || !y) return { score: 0.5, note: null }
  if (x === y) return { score: 1, note: `Same colour (${a})` }
  if (x === 'multicolor' || y === 'multicolor') return { score: 0.5, note: null }
  if (COLOR_FAMILIES[x] && COLOR_FAMILIES[x] === COLOR_FAMILIES[y])
    return { score: 0.6, note: `Similar colour (${a} / ${b})` }
  return { score: 0, note: null }
}

function locationScore(a, b) {
  const ta = new Set(tokenize(a))
  const tb = new Set(tokenize(b))
  if (!ta.size || !tb.size) return { score: 0.3, shared: [] }
  const shared = [...ta].filter((t) => tb.has(t))
  const score = shared.length / Math.min(ta.size, tb.size)
  return { score: Math.min(1, score), shared }
}

function dateScore(lost, found) {
  if (!lost.date || !found.date) return { score: 0.5, note: null }
  const days = Math.round((new Date(found.date) - new Date(lost.date)) / 86400000)
  if (days < -2) return { score: 0.05, note: null } // found before it was lost -> unlikely
  const gap = Math.max(0, days)
  const score = Math.max(0, 1 - gap / 30)
  let note = null
  if (gap === 0) note = 'Lost and found on the same day'
  else if (gap <= 7) note = `Found ${gap} day${gap > 1 ? 's' : ''} after it was lost`
  return { score, note }
}

const WEIGHTS = { text: 0.35, category: 0.2, color: 0.12, location: 0.15, date: 0.13, brand: 0.05 }

/** Score how likely two reports describe the same physical item. */
export function scoreMatch(a, b) {
  const lost = a.type === 'lost' ? a : b
  const found = a.type === 'lost' ? b : a
  const reasons = []

  const tokensA = tokenize(itemText(a))
  const tokensB = tokenize(itemText(b))
  const text = cosine(vectorize(tokensA), vectorize(tokensB))
  const sharedWords = [...new Set(tokensA.filter((t) => tokensB.includes(t)))].slice(0, 4)
  if (sharedWords.length) reasons.push(`Similar description: ${sharedWords.join(', ')}`)

  const category = a.category && a.category === b.category ? 1 : 0
  if (category) reasons.push(`Same category: ${a.category}`)

  const color = colorScore(a.color, b.color)
  if (color.note) reasons.push(color.note)

  const brand = a.brand && b.brand && a.brand.trim().toLowerCase() === b.brand.trim().toLowerCase() ? 1 : 0
  if (brand) reasons.push(`Same brand: ${a.brand}`)

  const location = locationScore(a.location, b.location)
  if (location.shared.length) reasons.push(`Nearby location: ${location.shared.join(', ')}`)

  const date = dateScore(lost, found)
  if (date.note) reasons.push(date.note)

  const raw =
    text * WEIGHTS.text +
    category * WEIGHTS.category +
    color.score * WEIGHTS.color +
    location.score * WEIGHTS.location +
    date.score * WEIGHTS.date +
    brand * WEIGHTS.brand

  // Text similarity rarely reaches 1.0 even for the same object, so we stretch
  // the scale slightly; then clamp to 0–100.
  const score = Math.max(0, Math.min(99, Math.round(raw * 115)))
  // Per-signal scores (0–100) so the UI can explain the result.
  const pct = (v) => Math.round(v * 100)
  const breakdown = [
    { key: 'text', label: 'Description', weight: WEIGHTS.text, value: pct(text) },
    { key: 'category', label: 'Category', weight: WEIGHTS.category, value: pct(category) },
    { key: 'location', label: 'Location', weight: WEIGHTS.location, value: pct(location.score) },
    { key: 'date', label: 'Date', weight: WEIGHTS.date, value: pct(date.score) },
    { key: 'color', label: 'Colour', weight: WEIGHTS.color, value: pct(color.score) },
    { key: 'brand', label: 'Brand', weight: WEIGHTS.brand, value: pct(brand) },
  ]
  return { score, reasons, breakdown }
}

export function matchLabel(score) {
  if (score >= 75) return { label: 'Strong match', tone: 'emerald' }
  if (score >= 55) return { label: 'Good match', tone: 'indigo' }
  return { label: 'Possible match', tone: 'amber' }
}

export const MIN_MATCH_SCORE = 35

/** Find the best candidates for `item` among `allItems`. */
export function findMatchesFor(item, allItems, limit = 6) {
  return allItems
    .filter(
      (other) =>
        other.id !== item.id &&
        other.type !== item.type &&
        other.status === 'open' &&
        other.user_id !== item.user_id,
    )
    .map((other) => ({ item: other, ...scoreMatch(item, other) }))
    .filter((m) => m.score >= MIN_MATCH_SCORE)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
}
