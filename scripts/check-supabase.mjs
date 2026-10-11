#!/usr/bin/env node
/**
 * FindBack — Supabase connection & setup checker
 *   npm run check:db
 *
 * Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env and talks to your
 * real Supabase project using ONLY the public anon key. It verifies that:
 *   - the key is a public anon/publishable key (never a secret service key)
 *   - the tables from supabase/schema.sql exist and are reachable
 *   - private tables (claims, notifications) are NOT readable by the public
 *   - the database functions exist and are not callable by logged-out users
 *   - the "item-images" storage bucket exists
 *   - whether "Confirm email" is on
 * It never writes anything. Exit code 0 = all required checks passed.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const results = []
const ok = (name, detail = '') => results.push({ status: 'PASS', name, detail })
const bad = (name, detail = '') => results.push({ status: 'FAIL', name, detail })
const info = (name, detail = '') => results.push({ status: 'INFO', name, detail })

function readEnv() {
  const env = { ...process.env }
  for (const file of ['.env', '.env.local']) {
    const p = path.join(root, file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return env
}

function keyRole(key) {
  if (key.startsWith('sb_secret_')) return 'secret'
  if (key.startsWith('sb_publishable_')) return 'publishable'
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'))
    return payload.role || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function call(url, key, pathname, opts = {}) {
  try {
    const res = await fetch(url + pathname, {
      ...opts,
      // New sb_publishable_ keys go ONLY in the apikey header; legacy anon JWTs also as Bearer.
      headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', ...(opts.headers || {}) },
    })
    let body = null
    const text = await res.text()
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { status: res.status, body }
  } catch (err) {
    return { status: 0, body: { message: err.cause?.code || err.message } }
  }
}

const codeOf = (r) => (r.body && typeof r.body === 'object' ? r.body.code || r.body.error || '' : '')
const msgOf = (r) => (r.body && typeof r.body === 'object' ? r.body.message || r.body.msg || JSON.stringify(r.body) : String(r.body)).slice(0, 160)
// A logged-out request that is refused looks like 401/403 + "permission denied" (code 42501)
const missing = (r) => r.status === 404 || ['PGRST205', '42P01', 'PGRST202', '42883'].includes(codeOf(r))
const denied = (r) => [401, 403].includes(r.status) && (codeOf(r) === '42501' || /permission denied/i.test(msgOf(r)))

async function main() {
  const env = readEnv()
  const url = (env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth|storage)\/v1$/, '')
  const key = (env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()

  console.log('\nFindBack · Supabase check\n')
  if (!url || !key) {
    bad('.env has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY', 'Copy .env.example to .env and fill both values (Supabase → Project Settings → API).')
    return finish()
  }
  if (!/^https?:\/\//.test(url)) bad('Project URL format', `"${url}" should look like https://abcd1234.supabase.co`)
  else if (/supabase\.com\/dashboard/.test(url)) bad('Project URL format', 'This is the dashboard address. Use the Project URL, e.g. https://abcd1234.supabase.co')
  else ok('Project URL format', url)

  const role = keyRole(key)
  if (role === 'service_role' || role === 'secret')
    bad('Key is safe for the browser', 'This is a SECRET service key! Replace it with the anon / publishable key and rotate the secret key in Supabase.')
  else if (role === 'anon' || role === 'publishable') ok('Key is safe for the browser', `${role} key`)
  else info('Key type', 'Could not recognise the key format; make sure it is the anon / publishable key.')

  const items = await call(url, key, '/rest/v1/items?select=id&limit=1')
  if (items.status === 0) {
    bad('Can reach Supabase', `Network error: ${msgOf(items)}. Check the URL and your internet connection.`)
    return finish()
  }
  if (items.status === 401 && /api key|apikey|JWT/i.test(msgOf(items))) {
    bad('API key accepted', msgOf(items))
    return finish()
  }
  if (items.status === 200) ok('Connected to the database; table "items" readable by the public', `${items.body.length ? 'has data' : 'empty'}`)
  else if (missing(items)) bad('Table "items" exists', 'Not found — run supabase/schema.sql in the Supabase SQL Editor.')
  else bad('Table "items" readable', `${items.status} ${msgOf(items)}`)

  const matches = await call(url, key, '/rest/v1/matches?select=id&limit=1')
  if (matches.status === 200) ok('Table "matches" exists (potential matches are public)')
  else bad('Table "matches" exists', `${matches.status} ${msgOf(matches)} — run supabase/schema.sql`)

  for (const table of ['claims', 'notifications']) {
    const r = await call(url, key, `/rest/v1/${table}?select=id&limit=1`)
    if (denied(r)) ok(`Table "${table}" exists and is private (logged-out read blocked)`)
    else if (r.status === 200) bad(`Table "${table}" is private`, 'Logged-out users can read it! Re-run supabase/schema.sql.')
    else if (missing(r)) bad(`Table "${table}" exists`, 'Not found — run supabase/schema.sql.')
    else bad(`Table "${table}"`, `${r.status} ${msgOf(r)}`)
  }

  const fns = [
    ['save_matches', { p_item_id: '00000000-0000-0000-0000-000000000000', p_matches: [] }],
    ['decide_claim', { p_claim_id: '00000000-0000-0000-0000-000000000000', p_decision: 'rejected', p_note: '' }],
  ]
  for (const [fn, args] of fns) {
    const r = await call(url, key, `/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
    if (denied(r)) ok(`Function ${fn}() exists and logged-out users cannot call it`)
    else if (missing(r)) bad(`Function ${fn}() exists`, 'Not found — run supabase/schema.sql.')
    else bad(`Function ${fn}() is protected`, `${r.status} ${msgOf(r)}`)
  }

  const obj = await call(url, key, '/storage/v1/object/public/item-images/__findback_check__.jpg')
  if (/bucket not found/i.test(msgOf(obj))) bad('Storage bucket "item-images" exists', 'Not found — run supabase/schema.sql (section 9).')
  else if (obj.status === 400 || obj.status === 404) ok('Storage bucket "item-images" exists')
  else info('Storage bucket check', `${obj.status} ${msgOf(obj)}`)

  const settings = await call(url, key, '/auth/v1/settings')
  if (settings.status === 200 && typeof settings.body === 'object') {
    if (settings.body.external && settings.body.external.email === false) bad('Email sign-in enabled', 'Turn on Authentication → Providers → Email.')
    else ok('Email/password sign-in available')
    info('Confirm email', settings.body.mailer_autoconfirm ? 'OFF — new users can log in immediately.' : 'ON — new users must click the link in their email before logging in.')
  }
  return finish()
}

function finish() {
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : 'ℹ️ '
    console.log(`${icon} ${r.name}${r.detail ? `\n     ${r.detail}` : ''}`)
  }
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log(failed ? `\n${failed} check(s) failed.\n` : '\nAll checks passed — FindBack is connected to Supabase.\n')
  process.exitCode = failed ? 1 : 0
}

main()
