/**
 * FindBack data layer
 * -------------------
 * Every page talks to the database ONLY through the functions in this file.
 *
 *  LIVE MODE  (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env)
 *    Supabase Auth (bcrypt passwords), PostgreSQL tables protected by Row Level
 *    Security, Supabase Storage for photos, and two database functions:
 *    save_matches() and decide_claim(). See supabase/schema.sql.
 *
 *  DEMO MODE  (no .env)
 *    Clearly labelled sample data kept in THIS browser's localStorage only.
 *    It mirrors the same rules in JavaScript so the app behaves identically,
 *    but nothing is sent to Supabase and the UI says so.
 */
import { supabase, isSupabaseConfigured, IMAGE_BUCKET } from './supabase'
import { auth as fbAuth, isFirebaseConfigured } from './firebase'
import * as fbApi from './firebaseApi'
import { buildDemoItems, buildDemoClaims, DEMO_USERS } from './demoData'
import { findMatchesFor } from './matching'
import { hashPassword, makeSalt, safeEqual } from './password'
import { blobToDataUrl } from './images'
import { shortName } from './utils'

export const activeBackend = isFirebaseConfigured
  ? 'firebase'
  : (isSupabaseConfigured ? 'supabase' : 'demo')

export const isDemoMode = activeBackend === 'demo'
export const backendName =
  activeBackend === 'firebase'
    ? 'Firebase'
    : (activeBackend === 'supabase' ? 'Supabase' : 'Demo mode (browser storage)')


const MATCH_NOTIFY_SCORE = 60 // same threshold as the database trigger
const MATCHES_TO_STORE = 20

/* ------------------------------------------------------------------ */
/*  Errors                                                             */
/* ------------------------------------------------------------------ */
// Friendly text for the CHECK constraints defined in supabase/schema.sql
const CONSTRAINT_MESSAGES = {
  items_title_check: 'The item name must be 3–120 characters.',
  items_description_check: 'The description is too long (max 1000 characters).',
  items_category_check: 'Please choose a category from the list.',
  items_location_check: 'The location must be 2–200 characters.',
  items_color_check: 'The colour is too long.',
  items_brand_check: 'The brand is too long (max 60 characters).',
  items_image_url_check: 'The photo link is invalid.',
  claims_message_check: 'Please describe your proof in 10–2000 characters.',
  claims_claimant_contact_check: 'Please give a phone number or email (5–200 characters).',
  claims_response_note_check: 'The reply is too long (max 1000 characters).',
}

/** Turn Supabase / PostgreSQL errors into short messages a user understands. */
function appError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return new Error(fallback)
  const msg = error.message || String(error)
  const code = error.code || ''
  let text = fallback
  if (/fetch|network|Load failed/i.test(msg)) text = 'Cannot reach the database. Check your internet connection and try again.'
  else if (code === '42501' || /row-level security|permission denied/i.test(msg))
    text = /claim|decide|respond/i.test(msg) ? msg : 'You are not allowed to do that.'
  else if (code === '23505') text = 'This already exists.'
  else if (code === '23514' && /constraint "(\w+)"/.test(msg))
    text = CONSTRAINT_MESSAGES[msg.match(/constraint "(\w+)"/)[1]] || 'Some details are invalid. Please check the form.'
  else if (code === '23514' || code === '22023' || code === '55000' || code === 'P0002') text = msg.replace(/^.*?:\s(?=[A-Z])/, '')
  else if (code === 'PGRST202' || code === '42P01' || code === '42883')
    text = 'The database is not set up yet. Run supabase/schema.sql in the Supabase SQL Editor.'
  else if (/Invalid login credentials/i.test(msg)) text = 'Invalid email or password.'
  else if (/already registered|already exists/i.test(msg)) text = 'An account with this email already exists.'
  else if (/Email not confirmed/i.test(msg)) text = 'Please confirm your email first (check your inbox), then log in.'
  else if (/Password should be/i.test(msg)) text = msg
  else if (/mime type|Payload too large|exceeded the maximum/i.test(msg)) text = 'Photo rejected: use a JPG, PNG or WEBP under 2 MB.'
  else if (msg) text = msg
  const err = new Error(text)
  err.code = code
  err.cause = error
  return err
}

/* ------------------------------------------------------------------ */
/*  Demo storage helpers (localStorage)                                */
/* ------------------------------------------------------------------ */
// Bump the version suffix whenever demo data changes so browsers reseed automatically.
const KEYS = {
  items: 'fb_items_v4',
  claims: 'fb_claims_v4',
  users: 'fb_users_v4',
  session: 'fb_session_v4',
  matches: 'fb_matches_v4',
  notifications: 'fb_notifications_v4',
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback()
  } catch {
    return fallback()
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    throw new Error('Browser storage is full. Try a smaller photo or reset demo data.', { cause: err })
  }
}

function demoDb() {
  const items = load(KEYS.items, () => {
    const seeded = buildDemoItems()
    save(KEYS.items, seeded)
    return seeded
  })
  const claims = load(KEYS.claims, () => {
    const seeded = buildDemoClaims()
    save(KEYS.claims, seeded)
    seedClaimNotifications(seeded, items)
    return seeded
  })
  const users = load(KEYS.users, () => {
    save(KEYS.users, DEMO_USERS)
    return DEMO_USERS
  })
  let matches = load(KEYS.matches, () => null)
  if (!matches) {
    // first run: calculate and store matches for all sample reports
    save(KEYS.matches, [])
    for (const item of items) if (item.status === 'open') demoSaveMatches(item, items)
    matches = load(KEYS.matches, () => [])
  }
  return { items, claims, users, matches }
}

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms)) // feels like a real network call
const publicUser = (u) => (u ? { id: u.id, email: u.email, name: u.name } : null)

export function resetDemoData() {
  Object.values(KEYS).forEach((k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  })
}

/** Demo version of the notification triggers in schema.sql (deduplicated the same way). */
function demoNotify(list) {
  const all = load(KEYS.notifications, () => [])
  for (const n of list) {
    if (!n.user_id) continue
    if (all.some((x) => x.user_id === n.user_id && x.kind === n.kind && x.ref_id === n.ref_id)) continue
    all.unshift({ id: uid('notif'), read_at: null, created_at: new Date().toISOString(), body: '', link: '', ...n })
  }
  save(KEYS.notifications, all)
}

function seedClaimNotifications(claims, items) {
  const title = (id) => items.find((i) => i.id === id)?.title || 'an item'
  demoNotify(
    claims.flatMap((c) => {
      const out = [
        {
          user_id: c.owner_id,
          kind: 'claim_received',
          title: 'New ownership claim',
          body: `${c.claimant_name} submitted a claim for "${title(c.item_id)}". Review it to approve or reject.`,
          link: `/items/${c.item_id}`,
          ref_id: c.id,
          created_at: c.created_at,
        },
      ]
      if (c.status !== 'pending')
        out.push({
          user_id: c.claimant_id,
          kind: c.status === 'approved' ? 'claim_approved' : 'claim_rejected',
          title: c.status === 'approved' ? 'Claim approved' : 'Claim not approved',
          body: `Your claim for "${title(c.item_id)}" was ${c.status}.`,
          link: '/claims',
          ref_id: c.id,
        })
      return out
    }),
  )
}

/* ------------------------------------------------------------------ */
/*  CONNECTION CHECK                                                    */
/* ------------------------------------------------------------------ */
/** Live mode: verifies the database really exists and is reachable. */
export async function checkConnection() {
  if (isDemoMode) return { ok: true, mode: 'demo' }
  if (activeBackend === 'firebase') return fbApi.checkFirebaseConnection()
  try {
    const items = await supabase.from('items').select('id').limit(1)
    if (items.error) throw items.error
    const matches = await supabase.from('matches').select('id').limit(1)
    if (matches.error) throw matches.error
    return { ok: true, mode: 'supabase' }
  } catch (error) {
    return { ok: false, mode: 'supabase', message: appError(error, 'Could not connect to Supabase.').message }
  }
}

/* ------------------------------------------------------------------ */
/*  AUTH                                                               */
/* ------------------------------------------------------------------ */
function mapSupabaseUser(u) {
  if (!u) return null
  return { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.email.split('@')[0] }
}

export async function getCurrentUser() {
  if (isDemoMode) {
    const session = load(KEYS.session, () => null)
    if (!session) return null
    return publicUser(demoDb().users.find((u) => u.id === session.userId))
  }
  if (activeBackend === 'firebase') {
    return fbApi.getCurrentFirebaseUser()
  }
  const { data, error } = await supabase.auth.getSession()
  if (error) throw appError(error)
  return mapSupabaseUser(data.session?.user)
}

/** Subscribe to login/logout/token-refresh changes. Returns an unsubscribe fn. */
export function onAuthChange(callback) {
  if (isDemoMode) return () => {}
  if (activeBackend === 'firebase') {
    return fbApi.onFirebaseAuthStateChange(callback)
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(mapSupabaseUser(session?.user)))
  return () => data.subscription.unsubscribe()
}

export async function signUp({ name, email, password }) {
  email = email.trim().toLowerCase()
  if (isDemoMode) {
    await wait()
    const { users } = demoDb()
    if (users.some((u) => u.email === email)) throw new Error('An account with this email already exists.')
    const salt = makeSalt()
    const newUser = { id: uid('user'), name: name.trim(), email, salt, passwordHash: hashPassword(password, salt) }
    save(KEYS.users, [...users, newUser])
    save(KEYS.session, { userId: newUser.id })
    return { user: publicUser(newUser), needsConfirmation: false }
  }
  if (activeBackend === 'firebase') {
    return fbApi.firebaseSignUp({ name, email, password })
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name.trim() } },
  })
  if (error) throw appError(error)
  return { user: mapSupabaseUser(data.session?.user), needsConfirmation: !data.session }
}

export async function signIn({ email, password }) {
  email = email.trim().toLowerCase()
  if (isDemoMode) {
    await wait()
    const found = demoDb().users.find((u) => u.email === email)
    if (!found || !safeEqual(hashPassword(password, found.salt), found.passwordHash))
      throw new Error('Invalid email or password.')
    save(KEYS.session, { userId: found.id })
    return publicUser(found)
  }
  if (activeBackend === 'firebase') {
    return fbApi.firebaseSignIn({ email, password })
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw appError(error)
  return mapSupabaseUser(data.user)
}

export async function signOut() {
  if (isDemoMode) {
    try {
      localStorage.removeItem(KEYS.session)
    } catch {}
    return
  }
  if (activeBackend === 'firebase') {
    return fbApi.firebaseSignOut()
  }
  const { error } = await supabase.auth.signOut()
  if (error) throw appError(error)
}


/* ------------------------------------------------------------------ */
/*  PHOTOS (Supabase Storage / Firebase Cloud Storage)                 */
/* ------------------------------------------------------------------ */
async function uploadImage(blob, user) {
  if (isDemoMode) return { image_url: await blobToDataUrl(blob), image_path: '' }
  if (activeBackend === 'firebase') return fbApi.uploadFirebaseImage(blob, user)
  // Path must start with the user's id: the storage policy only allows that folder.
  const path = `${user.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.jpg`
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  if (error) throw appError(error, 'Photo upload failed.')
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path)
  return { image_url: data.publicUrl, image_path: path }
}

/** Best effort: a leftover file is harmless, so failures are only logged. */
async function removeImage(path) {
  if (isDemoMode || !path) return
  if (activeBackend === 'firebase') return fbApi.removeFirebaseImage(path)
  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path])
  if (error) console.warn('Could not delete old photo', path, error.message)
}

/* ------------------------------------------------------------------ */
/*  ITEMS (lost & found reports)                                       */
/* ------------------------------------------------------------------ */
export async function listItems() {
  if (isDemoMode) {
    await wait()
    return demoDb().items
  }
  if (activeBackend === 'firebase') return fbApi.listFirebaseItems()
  const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) throw appError(error, 'Could not load reports.')
  return data
}

export async function getItem(id) {
  if (isDemoMode) {
    await wait()
    return demoDb().items.find((i) => i.id === id) || null
  }
  if (activeBackend === 'firebase') return fbApi.getFirebaseItem(id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null // not a valid id -> "not found" instead of a DB error
  const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle()
  if (error) throw appError(error, 'Could not load this report.')
  return data
}

export async function listMyItems(userId) {
  if (isDemoMode) {
    await wait()
    return demoDb().items.filter((i) => i.user_id === userId)
  }
  if (activeBackend === 'firebase') return fbApi.listMyFirebaseItems(userId)
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw appError(error, 'Could not load your reports.')
  return data
}

const ITEM_FIELDS = ['type', 'title', 'description', 'category', 'color', 'brand', 'location', 'date']

function cleanItemInput(input) {
  const out = {}
  for (const f of ITEM_FIELDS) if (input[f] !== undefined) out[f] = typeof input[f] === 'string' ? input[f].trim() : input[f]
  return out
}

/**
 * Create a report. `imageBlob` (optional) is the compressed JPEG from prepareImage().
 * Matches are calculated and saved right after.
 */
export async function createItem(input, user, { imageBlob } = {}) {
  const fields = cleanItemInput(input)
  if (isDemoMode) {
    await wait()
    const image = imageBlob ? await uploadImage(imageBlob, user) : { image_url: '', image_path: '' }
    const { items } = demoDb()
    const newItem = {
      ...fields,
      ...image,
      id: uid('item'),
      user_id: user.id,
      reporter_name: shortName(user.name),
      status: 'open',
      created_at: new Date().toISOString(),
    }
    save(KEYS.items, [newItem, ...items])
    await refreshMatches(newItem, user)
    return newItem
  }
  if (activeBackend === 'firebase') {
    const newItem = await fbApi.createFirebaseItem(fields, user, { imageBlob })
    await refreshMatches(newItem, user).catch((e) => console.warn('Match calculation failed', e))
    return newItem
  }
  const image = imageBlob ? await uploadImage(imageBlob, user) : { image_url: '', image_path: '' }
  const { data, error } = await supabase
    .from('items')
    .insert({ ...fields, ...image, user_id: user.id, reporter_name: shortName(user.name) })
    .select()
    .single()
  if (error) {
    await removeImage(image.image_path) // don't leave an orphan photo behind
    throw appError(error, 'Could not save your report.')
  }
  await refreshMatches(data, user).catch((e) => console.warn('Match calculation failed', e))
  return data
}

/** Throws unless `user` reported this item (demo-mode mirror of the database RLS rules). */
function assertDemoOwner(item, user) {
  if (!item) throw new Error('Report not found.')
  if (!user || item.user_id !== user.id) throw new Error('Only the person who posted this report can change it.')
}

/** Supabase returns 0 rows (not an error) when RLS blocks an update/delete, so we check. */
function assertChanged(data, action = 'change') {
  if (!data || data.length === 0) throw new Error(`You are not allowed to ${action} this report.`)
}

/**
 * Update a report. Image options:
 *   imageBlob   – new compressed photo to upload (replaces the old one)
 *   removeImage – true to delete the current photo
 *   previous    – the item as loaded before editing (to clean up its old photo)
 */
export async function updateItem(id, input, user, { imageBlob, removeImage: dropImage = false, previous = null } = {}) {
  const fields = cleanItemInput(input)
  delete fields.type // a lost report cannot become a found report
  if (isDemoMode) {
    await wait()
    const { items } = demoDb()
    assertDemoOwner(items.find((i) => i.id === id), user)
    if (imageBlob) Object.assign(fields, await uploadImage(imageBlob, user))
    else if (dropImage) Object.assign(fields, { image_url: '', image_path: '' })
    const updated = items.map((i) => (i.id === id ? { ...i, ...fields } : i))
    save(KEYS.items, updated)
    const item = updated.find((i) => i.id === id)
    await refreshMatches(item, user)
    return item
  }
  if (activeBackend === 'firebase') {
    const item = await fbApi.updateFirebaseItem(id, fields, user, { imageBlob, removeImage: dropImage, previous })
    await refreshMatches(item, user).catch((e) => console.warn('Match calculation failed', e))
    return item
  }
  let uploaded = null
  if (imageBlob) {
    uploaded = await uploadImage(imageBlob, user)
    Object.assign(fields, uploaded)
  } else if (dropImage) Object.assign(fields, { image_url: '', image_path: '' })

  const { data, error } = await supabase.from('items').update(fields).eq('id', id).select()
  if (error || !data?.length) {
    if (uploaded) await removeImage(uploaded.image_path)
    if (error) throw appError(error, 'Could not save your changes.')
    assertChanged(data, 'edit')
  }
  if ((uploaded || dropImage) && previous?.image_path && previous.image_path !== fields.image_path)
    await removeImage(previous.image_path)
  const item = data[0]
  await refreshMatches(item, user).catch((e) => console.warn('Match calculation failed', e))
  return item
}

export async function updateItemStatus(id, status, user) {
  if (isDemoMode) {
    await wait()
    const { items } = demoDb()
    assertDemoOwner(items.find((i) => i.id === id), user)
    const updated = items.map((i) => (i.id === id ? { ...i, status } : i))
    save(KEYS.items, updated)
    await refreshMatches(updated.find((i) => i.id === id), user)
    return
  }
  if (activeBackend === 'firebase') {
    await fbApi.updateFirebaseItemStatus(id, status)
    if (status === 'open') {
      const item = await fbApi.getFirebaseItem(id)
      if (item) await refreshMatches(item, user).catch((e) => console.warn('Match calculation failed', e))
    }
    return
  }
  const { data, error } = await supabase.from('items').update({ status }).eq('id', id).select()
  if (error) throw appError(error, 'Could not update the status.')
  assertChanged(data, 'update')
  // resolving removes matches (database trigger); re-opening recalculates them
  if (status === 'open') await refreshMatches(data[0], user).catch((e) => console.warn('Match calculation failed', e))
}

export async function deleteItem(id, user, item = null) {
  if (isDemoMode) {
    await wait()
    const { items, claims, matches } = demoDb()
    assertDemoOwner(items.find((i) => i.id === id), user)
    save(KEYS.items, items.filter((i) => i.id !== id))
    save(KEYS.claims, claims.filter((c) => c.item_id !== id))
    save(KEYS.matches, matches.filter((m) => m.lost_item_id !== id && m.found_item_id !== id))
    return
  }
  if (activeBackend === 'firebase') {
    return fbApi.deleteFirebaseItem(id, user, item)
  }
  const { data, error } = await supabase.from('items').delete().eq('id', id).select('id, image_path')
  if (error) throw appError(error, 'Could not delete the report.')
  assertChanged(data, 'delete')
  await removeImage(data[0].image_path || item?.image_path) // claims & matches are removed by ON DELETE CASCADE
}


/* ------------------------------------------------------------------ */
/*  AI MATCHING — potential matches are computed by src/lib/matching.js */
/*  and SAVED in the database (table "matches").                       */
/*  A match is only a suggestion: ownership is verified by a claim.    */
/* ------------------------------------------------------------------ */
const toPayload = (m) => ({ item_id: m.item.id, score: m.score, reasons: m.reasons, breakdown: m.breakdown })

/* ---------------- Optional Python matching service (backend/) ---------------- */
// Set VITE_MATCHING_API_URL (e.g. http://localhost:8000) to let the FastAPI service compute
// matches. If it is not set or not reachable, the identical in-browser engine is used.
const MATCHING_API_URL = (import.meta.env.VITE_MATCHING_API_URL || '').trim().replace(/\/+$/, '')
let lastMatchEngine = 'browser'

/** Which engine produced the most recent matches: 'python' | 'browser' | 'browser-fallback'. */
export function getLastMatchEngine() {
  return lastMatchEngine
}

export function describeMatchEngine(engine = lastMatchEngine) {
  if (engine === 'python') return 'Python matching service'
  if (engine === 'browser-fallback') return 'in-browser engine (Python service unavailable)'
  return 'in-browser engine'
}

async function callMatchingApi(path, { method = 'GET', body, token, timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(MATCHING_API_URL + path, {
      method,
      signal: controller.signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(typeof data.detail === 'string' ? data.detail : `Matching service error ${res.status}`)
      err.status = res.status
      throw err
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

/** Status of the Python matching service, for the footer. */
export async function checkMatchingService() {
  if (!MATCHING_API_URL) return { configured: false }
  try {
    const h = await callMatchingApi('/api/health', { timeoutMs: 3000 })
    return { configured: true, ok: true, version: h.version, engine: h.engine }
  } catch (e) {
    return { configured: true, ok: false, message: e.message }
  }
}

const REPORT_FIELDS = ['id', 'type', 'title', 'description', 'category', 'color', 'brand', 'location', 'date', 'status', 'user_id']
const toReport = (i) => Object.fromEntries(REPORT_FIELDS.map((f) => [f, i[f] ?? (f === 'date' || f === 'user_id' ? null : '')]))

/** Demo mode + Python: score with POST /api/match (stateless, no database). */
async function pythonCandidates(item, allItems) {
  const pool = allItems.filter((o) => o.id !== item.id && o.type !== item.type && o.status === 'open')
  const res = await callMatchingApi('/api/match', {
    method: 'POST',
    body: { item: toReport(item), candidates: pool.map(toReport), limit: MATCHES_TO_STORE },
  })
  return res.matches.map((m) => ({ item: pool.find((o) => o.id === m.item_id), score: m.score, reasons: m.reasons, breakdown: m.breakdown }))
}

/** Demo equivalent of the save_matches() database function. */
function demoSaveMatches(item, allItems, precomputed = null) {
  const stored = load(KEYS.matches, () => [])
  const candidates = item.status !== 'open' ? [] : precomputed || findMatchesFor(item, allItems, MATCHES_TO_STORE)
  const isPair = (m) => m.lost_item_id === item.id || m.found_item_id === item.id
  const keep = stored.filter((m) => !isPair(m))
  const notes = []
  for (const c of candidates) {
    const lost = item.type === 'lost' ? item : c.item
    const found = item.type === 'found' ? item : c.item
    const existing = stored.find((m) => m.lost_item_id === lost.id && m.found_item_id === found.id)
    keep.push({
      id: existing?.id || uid('match'),
      lost_item_id: lost.id,
      found_item_id: found.id,
      score: c.score,
      reasons: c.reasons,
      breakdown: c.breakdown,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (!existing && c.score >= MATCH_NOTIFY_SCORE)
      notes.push(
        {
          user_id: lost.user_id,
          kind: 'match_found',
          title: 'Potential match for your lost item',
          body: `"${found.title}" looks like your "${lost.title}" (${c.score}% match). Not verified yet — open it to check.`,
          link: `/items/${found.id}`,
          ref_id: found.id,
        },
        {
          user_id: found.user_id,
          kind: 'match_found',
          title: 'Potential owner for an item you found',
          body: `"${lost.title}" may be the item you found (${c.score}% match).`,
          link: `/items/${lost.id}`,
          ref_id: lost.id,
        },
      )
  }
  save(KEYS.matches, keep)
  demoNotify(notes)
  return candidates.length
}

/** Recalculate and store the potential matches for one of the user's own reports. */
export async function refreshMatches(item, user) {
  if (!item || !user || item.user_id !== user.id) return 0
  lastMatchEngine = 'browser'
  if (isDemoMode) {
    const all = load(KEYS.items, () => [])
    if (MATCHING_API_URL && item.status === 'open') {
      try {
        const scored = await pythonCandidates(item, all)
        lastMatchEngine = 'python'
        return demoSaveMatches(item, all, scored)
      } catch (e) {
        console.warn('Python matching service unavailable, using the in-browser engine:', e.message)
        lastMatchEngine = 'browser-fallback'
      }
    }
    return demoSaveMatches(item, all)
  }
  if (activeBackend === 'firebase') {
    if (MATCHING_API_URL) {
      try {
        const token = await fbAuth?.currentUser?.getIdToken()
        if (token) {
          const res = await callMatchingApi(`/api/items/${item.id}/refresh-matches`, { method: 'POST', token })
          lastMatchEngine = 'python'
          return res.saved_count
        }
      } catch (e) {
        if (e.status && e.status < 500) throw new Error(e.message)
        console.warn('Python matching service unavailable, using the in-browser engine:', e.message)
        lastMatchEngine = 'browser-fallback'
      }
    }
    let candidates = []
    if (item.status === 'open') {
      const all = await fbApi.listFirebaseItems()
      candidates = findMatchesFor(item, all, MATCHES_TO_STORE)
    }
    return fbApi.saveFirebaseMatches(item, candidates)
  }
  if (MATCHING_API_URL) {
    // Python recalculates AND saves, acting as this user (their token), so RLS still applies.
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    try {
      const res = await callMatchingApi(`/api/items/${item.id}/refresh-matches`, { method: 'POST', token })
      lastMatchEngine = 'python'
      return res.saved_count
    } catch (e) {
      if (e.status && e.status < 500) throw new Error(e.message) // e.g. not your report: do not retry
      console.warn('Python matching service unavailable, using the in-browser engine:', e.message)
      lastMatchEngine = 'browser-fallback'
    }
  }
  let payload = []
  if (item.status === 'open') {
    const all = await listItems()
    payload = findMatchesFor(item, all, MATCHES_TO_STORE).map(toPayload)
  }
  const { data, error } = await supabase.rpc('save_matches', { p_item_id: item.id, p_matches: payload })
  if (error) throw appError(error, 'Could not save matches.')
  return data
}

/** Turn stored match rows into [{ item: otherItem, score, reasons, breakdown }] for each of `items`. */
function attachMatches(rows, items, others) {
  const byItem = new Map(items.map((i) => [i.id, []]))
  for (const r of rows) {
    for (const mine of items) {
      const otherId = r.lost_item_id === mine.id ? r.found_item_id : r.found_item_id === mine.id ? r.lost_item_id : null
      if (!otherId) continue
      const other = others.find((o) => o.id === otherId)
      if (!other || other.status !== 'open') continue
      byItem.get(mine.id).push({
        id: r.id,
        item: other,
        score: r.score,
        reasons: r.reasons || [],
        breakdown: r.breakdown || [],
        updated_at: r.updated_at,
      })
    }
  }
  for (const list of byItem.values()) list.sort((a, b) => b.score - a.score)
  return byItem
}

/** Saved potential matches for several reports at once. Returns Map(itemId -> matches[]). */
export async function getMatchesForItems(items, limitEach = 6) {
  if (!items.length) return new Map()
  if (activeBackend === 'firebase') {
    return fbApi.getFirebaseMatchesForItems(items, limitEach)
  }
  const ids = items.map((i) => i.id)
  let rows
  let others
  if (isDemoMode) {
    await wait()
    const db = demoDb()
    rows = db.matches.filter((m) => ids.includes(m.lost_item_id) || ids.includes(m.found_item_id))
    others = db.items
  } else {
    const [a, b] = await Promise.all([
      supabase.from('matches').select('*').in('lost_item_id', ids),
      supabase.from('matches').select('*').in('found_item_id', ids),
    ])
    if (a.error || b.error) throw appError(a.error || b.error, 'Could not load matches.')
    const seen = new Set()
    rows = [...a.data, ...b.data].filter((r) => (seen.has(r.id) ? false : seen.add(r.id)))
    const otherIds = [...new Set(rows.flatMap((r) => [r.lost_item_id, r.found_item_id]))].filter((id) => !ids.includes(id))
    others = []
    if (otherIds.length) {
      const res = await supabase.from('items').select('*').in('id', otherIds)
      if (res.error) throw appError(res.error, 'Could not load matches.')
      others = res.data
    }
  }
  const map = attachMatches(rows, items, others)
  for (const [k, v] of map) map.set(k, v.slice(0, limitEach))
  return map
}

export async function getMatches(item, limit = 6) {
  const map = await getMatchesForItems([item], limit)
  return map.get(item.id) || []
}

/* ------------------------------------------------------------------ */
/*  OWNERSHIP CLAIMS                                                   */
/* ------------------------------------------------------------------ */
export async function createClaim({ item, user, message, contact }) {
  const record = {
    item_id: item.id,
    owner_id: item.user_id,
    claimant_id: user.id,
    claimant_name: user.name,
    claimant_contact: contact.trim(),
    message: message.trim(),
  }
  if (isDemoMode) {
    await wait()
    const { claims, items } = demoDb()
    const current = items.find((i) => i.id === item.id)
    if (!current || current.status !== 'open') throw new Error('This report is no longer open for claims.')
    if (current.user_id === user.id) throw new Error('You cannot claim your own report.')
    if (claims.some((c) => c.item_id === item.id && c.claimant_id === user.id && c.status !== 'rejected'))
      throw new Error('You already have an active claim on this item.')
    const claim = { ...record, id: uid('claim'), status: 'pending', response_note: '', created_at: new Date().toISOString() }
    save(KEYS.claims, [claim, ...claims])
    demoNotify([
      {
        user_id: item.user_id,
        kind: 'claim_received',
        title: 'New ownership claim',
        body: `${user.name} submitted a claim for "${current.title}". Review it to approve or reject.`,
        link: `/items/${item.id}`,
        ref_id: claim.id,
      },
    ])
    return claim
  }
  if (activeBackend === 'firebase') {
    return fbApi.createFirebaseClaim({ item, user, message, contact })
  }
  const { data, error } = await supabase.from('claims').insert(record).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('You already have an active claim on this item.')
    if (error.code === '42501') throw new Error('This report is not open for claims, or it is your own report.')
    throw appError(error, 'Could not submit your claim.')
  }
  return data
}

/** Claims where the user is the claimant (outgoing) or the item owner (incoming). */
export async function listClaimsForUser(userId) {
  let claims
  let items
  if (isDemoMode) {
    await wait()
    const db = demoDb()
    claims = db.claims.filter((c) => c.owner_id === userId || c.claimant_id === userId)
    items = db.items
  } else if (activeBackend === 'firebase') {
    return fbApi.listFirebaseClaimsForUser(userId)
  } else {
    // RLS only returns claims where this user is the claimant or the item owner.
    const { data, error } = await supabase.from('claims').select('*').order('created_at', { ascending: false })
    if (error) throw appError(error, 'Could not load claims.')
    claims = data
    const ids = [...new Set(claims.map((c) => c.item_id))]
    if (ids.length) {
      const res = await supabase.from('items').select('*').in('id', ids)
      if (res.error) throw appError(res.error, 'Could not load claims.')
      items = res.data
    } else items = []
  }
  const withItem = claims
    .map((c) => ({ ...c, item: items.find((i) => i.id === c.item_id) || null }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return {
    incoming: withItem.filter((c) => c.owner_id === userId),
    outgoing: withItem.filter((c) => c.claimant_id === userId),
  }
}

/** Claims on one item that `user` may see: all of them for the owner, only their own for anyone else. */
export async function listClaimsForItem(itemId, user) {
  if (!user) return []
  if (isDemoMode) {
    await wait()
    return demoDb()
      .claims.filter((c) => c.item_id === itemId && (c.owner_id === user.id || c.claimant_id === user.id))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }
  if (activeBackend === 'firebase') {
    return fbApi.listFirebaseClaimsForItem(itemId, user)
  }
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
  if (error) throw appError(error, 'Could not load claims.')
  return data
}

/**
 * Item owner approves or rejects a claim (database function decide_claim, atomic).
 * Approving marks the item as returned and rejects the other pending claims.
 */
export async function respondToClaim(claim, status, responseNote = '', user) {
  const note = responseNote.trim()
  if (!['approved', 'rejected'].includes(status)) throw new Error('Invalid claim status.')
  if (isDemoMode) {
    await wait()
    const { claims, items, matches } = demoDb()
    const current = claims.find((c) => c.id === claim.id)
    if (!current || !user || current.owner_id !== user.id)
      throw new Error('Only the person who posted this report can respond to claims.')
    if (current.status !== 'pending') throw new Error('This claim has already been answered.')
    if (status === 'approved' && note.length < 5) throw new Error('Add pickup details (at least 5 characters).')
    const title = items.find((i) => i.id === claim.item_id)?.title || 'an item'
    const notes = []
    save(
      KEYS.claims,
      claims.map((c) => {
        let next = c
        if (c.id === claim.id) next = { ...c, status, response_note: note }
        else if (status === 'approved' && c.item_id === claim.item_id && c.status === 'pending')
          next = { ...c, status: 'rejected', response_note: 'Another claim was approved for this item.' }
        if (next !== c)
          notes.push({
            user_id: c.claimant_id,
            kind: next.status === 'approved' ? 'claim_approved' : 'claim_rejected',
            title: next.status === 'approved' ? 'Claim approved' : 'Claim not approved',
            body: `Your claim for "${title}" was ${next.status}.`,
            link: '/claims',
            ref_id: c.id,
          })
        return next
      }),
    )
    if (status === 'approved') {
      save(KEYS.items, items.map((i) => (i.id === claim.item_id ? { ...i, status: 'resolved' } : i)))
      save(KEYS.matches, matches.filter((m) => m.lost_item_id !== claim.item_id && m.found_item_id !== claim.item_id))
    }
    demoNotify(notes)
    return
  }
  if (activeBackend === 'firebase') {
    return fbApi.respondToFirebaseClaim(claim, status, responseNote, user)
  }
  const { error } = await supabase.rpc('decide_claim', { p_claim_id: claim.id, p_decision: status, p_note: note })
  if (error) throw appError(error, 'Could not save your decision.')
}

/* ------------------------------------------------------------------ */
/*  NOTIFICATIONS                                                      */
/* ------------------------------------------------------------------ */
export async function listNotifications(user, limit = 30) {
  if (!user) return []
  if (isDemoMode) {
    demoDb()
    return load(KEYS.notifications, () => [])
      .filter((n) => n.user_id === user.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit)
  }
  if (activeBackend === 'firebase') {
    return fbApi.listFirebaseNotifications(user, limit)
  }
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw appError(error, 'Could not load notifications.')
  return data
}

export async function markNotificationsRead(user, ids = null) {
  if (!user) return
  const now = new Date().toISOString()
  if (isDemoMode) {
    save(
      KEYS.notifications,
      load(KEYS.notifications, () => []).map((n) =>
        n.user_id === user.id && !n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: now } : n,
      ),
    )
    return
  }
  if (activeBackend === 'firebase') {
    return fbApi.markFirebaseNotificationsRead(user, ids)
  }
  let query = supabase.from('notifications').update({ read_at: now }).eq('user_id', user.id).is('read_at', null)
  if (ids) query = query.in('id', ids)
  const { error } = await query
  if (error) throw appError(error, 'Could not update notifications.')
}

