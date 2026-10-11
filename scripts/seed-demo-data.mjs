#!/usr/bin/env node
/**
 * FindBack — load demo data into your REAL Supabase project
 *   npm run seed              create (or complete) the demo data
 *   npm run seed -- --reset   delete the demo data first, then create it again
 *
 * Everything is done exactly like a real user would, using only the PUBLIC
 * publishable/anon key from .env and the demo accounts' own logins, so all
 * Row Level Security rules, triggers and functions in supabase/schema.sql apply:
 *   - 4 demo accounts are created through Supabase Auth (passwords hashed by Supabase)
 *   - 15 lost/found reports with every field filled in, each with a photo uploaded to
 *     the Storage bucket "item-images" (from public/demo-photos/)
 *   - ownership claims (2 pending, 1 approved through decide_claim -> item "Returned")
 *   - suggested matches saved through save_matches() (scores from src/lib/matching.js)
 *   - notifications created automatically by the database triggers
 * Safe to run more than once: existing rows are reused, nothing is duplicated.
 *
 * Needs "Confirm email" OFF (Authentication -> Sign In / Providers -> Email).
 * Options: --password=<pw>  (default FindBack@2026, or SEED_PASSWORD)
 *          --domain=<domain> (email domain for the demo accounts, default findback.app)
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildDemoItems, buildDemoClaims, DEMO_USERS } from '../src/lib/demoData.js'
import { findMatchesFor } from '../src/lib/matching.js'
import { shortName } from '../src/lib/utils.js'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))
const BUCKET = 'item-images'

function readEnv() {
  const env = { ...process.env }
  for (const file of ['.env', '.env.local']) {
    const p = path.join(root, file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !line.trim().startsWith('#') && !process.env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return env
}

const env = readEnv()
const URL_ = (env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth|storage)\/v1$/, '')
const KEY = (env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
const PASSWORD = String(args.password || env.SEED_PASSWORD || 'FindBack@2026')
const DOMAIN = String(args.domain || env.SEED_EMAIL_DOMAIN || 'findback.app')

function fail(msg) {
  console.error(`\n❌ ${msg}\n`)
  process.exit(1)
}
if (!URL_ || !KEY) fail('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env (run npm run setup:supabase first).')
if (KEY.startsWith('sb_secret_') || /service_role/.test(Buffer.from(KEY.split('.')[1] || '', 'base64').toString()))
  fail('The key in .env is a SECRET key. Use the publishable / anon key only.')

async function call(p, { method = 'GET', token, body, headers = {}, raw = false } = {}) {
  const h = { apikey: KEY, ...headers }
  if (token) h.Authorization = `Bearer ${token}`
  else if (KEY.startsWith('eyJ')) h.Authorization = `Bearer ${KEY}`
  if (body !== undefined && !raw) h['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(URL_ + p, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) })
  } catch (e) {
    fail(`Cannot reach ${URL_}: ${e.cause?.code || e.message}`)
  }
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, ok: res.ok, data }
}
const msg = (r) => (r.data && (r.data.message || r.data.msg || r.data.error_description || r.data.error)) || JSON.stringify(r.data)
const must = (r, what) => {
  if (!r.ok) fail(`${what} failed (${r.status}): ${msg(r)}`)
  return r.data
}
const q = (params) => new URLSearchParams(params).toString()

// ---------------------------------------------------------------- accounts
const settings = await call('/auth/v1/settings')
const autoconfirm = settings.ok && settings.data?.mailer_autoconfirm === true

async function account(demo) {
  const email = demo.email.replace(/@.*/, `@${DOMAIN}`)
  let r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: PASSWORD } })
  let created = false
  if (!r.ok) {
    if (!autoconfirm)
      fail('"Confirm email" is ON in Supabase, so demo accounts cannot log in. Turn it OFF in Authentication -> Sign In / Providers -> Email, then run this again.')
    r = await call('/auth/v1/signup', { method: 'POST', body: { email, password: PASSWORD, data: { full_name: demo.name } } })
    if (!r.ok || !r.data?.access_token) fail(`Could not create ${email} (${r.status}): ${msg(r)}`)
    created = true
  }
  return { ...demo, email, token: r.data.access_token, id: r.data.user.id, created }
}

console.log(`\nFindBack demo data → ${URL_}\n`)
const users = {}
for (const demo of DEMO_USERS) {
  users[demo.id] = await account(demo)
  console.log(`  ${users[demo.id].created ? 'created ' : 'existing'} account  ${users[demo.id].email}`)
}

const demoItems = buildDemoItems()
const demoClaims = buildDemoClaims()

// ---------------------------------------------------------------- reset (optional)
if (args.reset) {
  console.log('\n  --reset: removing previous demo data (only rows owned by the demo accounts)')
  for (const u of Object.values(users)) {
    const titles = demoItems.filter((i) => i.user_id === u.id || users[i.user_id]?.id === u.id).map((i) => i.title)
    const mine = must(await call(`/rest/v1/items?${q({ user_id: `eq.${u.id}`, select: 'id,title,image_path' })}`, { token: u.token }), 'list reports')
    for (const row of mine.filter((r) => titles.includes(r.title))) {
      must(await call(`/rest/v1/items?${q({ id: `eq.${row.id}` })}`, { method: 'DELETE', token: u.token }), 'delete report')
      if (row.image_path) await call(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', token: u.token, body: { prefixes: [row.image_path] } })
    }
    await call(`/rest/v1/notifications?${q({ user_id: `eq.${u.id}` })}`, { method: 'DELETE', token: u.token })
  }
}

// ---------------------------------------------------------------- photos + reports
async function uploadPhoto(owner, imageUrl) {
  if (!imageUrl) return { image_url: '', image_path: '' }
  const file = path.join(root, 'public', imageUrl.replace(/^\//, ''))
  const objectPath = `${owner.id}/seed-${path.basename(file)}`
  const r = await call(`/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    token: owner.token,
    raw: true,
    body: fs.readFileSync(file),
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
  })
  if (!r.ok && !/exist|duplicate/i.test(msg(r))) fail(`Photo upload failed for ${objectPath} (${r.status}): ${msg(r)}`)
  return { image_url: `${URL_}/storage/v1/object/public/${BUCKET}/${objectPath}`, image_path: objectPath }
}

const idMap = {} // demo item id -> real uuid
let createdItems = 0
for (const it of demoItems) {
  const owner = users[it.user_id]
  const existing = must(await call(`/rest/v1/items?${q({ user_id: `eq.${owner.id}`, title: `eq.${it.title}`, select: 'id' })}`, { token: owner.token }), 'look up report')
  if (existing.length) {
    idMap[it.id] = existing[0].id
    continue
  }
  const photo = await uploadPhoto(owner, it.image_url)
  const row = {
    user_id: owner.id,
    reporter_name: shortName(owner.name),
    type: it.type,
    title: it.title,
    description: it.description,
    category: it.category,
    color: it.color || '',
    brand: it.brand || '',
    location: it.location,
    date: it.date,
    ...photo,
  }
  const res = must(await call('/rest/v1/items', { method: 'POST', token: owner.token, body: row, headers: { Prefer: 'return=representation' } }), `create report "${it.title}"`)
  idMap[it.id] = res[0].id
  createdItems++
}
console.log(`\n  reports: ${createdItems} created, ${demoItems.length - createdItems} already present (all with photos in Storage)`)

// ---------------------------------------------------------------- claims
let createdClaims = 0
for (const c of demoClaims) {
  const claimant = users[c.claimant_id]
  const owner = users[c.owner_id]
  const itemId = idMap[c.item_id]
  const found = must(await call(`/rest/v1/claims?${q({ item_id: `eq.${itemId}`, claimant_id: `eq.${claimant.id}`, select: 'id,status' })}`, { token: claimant.token }), 'look up claim')
  let claim = found[0]
  if (!claim) {
    const item = must(await call(`/rest/v1/items?${q({ id: `eq.${itemId}`, select: 'status' })}`), 'read report')[0]
    if (item.status !== 'open') continue // already returned through another claim
    claim = must(
      await call('/rest/v1/claims', {
        method: 'POST',
        token: claimant.token,
        headers: { Prefer: 'return=representation' },
        body: { item_id: itemId, owner_id: owner.id, claimant_id: claimant.id, claimant_name: claimant.name, claimant_contact: claimant.email, message: c.message },
      }),
      'create claim',
    )[0]
    createdClaims++
  }
  if (c.status !== 'pending' && claim.status === 'pending')
    must(await call('/rest/v1/rpc/decide_claim', { method: 'POST', token: owner.token, body: { p_claim_id: claim.id, p_decision: c.status, p_note: c.response_note } }), 'decide claim')
}
console.log(`  claims:  ${createdClaims} created (2 pending + 1 approved through decide_claim → item marked Returned)`)

// ---------------------------------------------------------------- suggested matches
const all = must(await call(`/rest/v1/items?${q({ select: '*', order: 'created_at.desc', limit: '500' })}`), 'list reports')
let saved = 0
for (const [demoId, realId] of Object.entries(idMap)) {
  const item = all.find((i) => i.id === realId)
  if (!item || item.status !== 'open') continue
  const owner = users[demoItems.find((d) => d.id === demoId).user_id]
  const payload = findMatchesFor(item, all, 20).map((m) => ({ item_id: m.item.id, score: m.score, reasons: m.reasons, breakdown: m.breakdown }))
  must(await call('/rest/v1/rpc/save_matches', { method: 'POST', token: owner.token, body: { p_item_id: item.id, p_matches: payload } }), 'save matches')
  saved += payload.length
}
const ids = Object.values(idMap)
const matchRows = must(await call(`/rest/v1/matches?${q({ select: 'id,lost_item_id,found_item_id', lost_item_id: `in.(${ids.join(',')})` })}`), 'count matches')
console.log(`  matches: ${matchRows.length} suggested matches stored (no duplicates; computed by the FindBack engine)`)

// ---------------------------------------------------------------- summary
let notes = 0
for (const u of Object.values(users)) notes += must(await call(`/rest/v1/notifications?${q({ select: 'id', user_id: `eq.${u.id}` })}`, { token: u.token }), 'count notifications').length
console.log(`  notifications: ${notes} (created by database triggers)`)
console.log('\n✅ Demo data ready. Log in with any of these accounts:')
for (const u of Object.values(users)) console.log(`     ${u.email.padEnd(26)} password: ${PASSWORD}   (${u.name})`)
console.log('   Change or delete these accounts in Supabase → Authentication → Users when you no longer need them.\n')
