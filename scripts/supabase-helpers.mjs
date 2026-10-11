#!/usr/bin/env node
/**
 * Small helpers used by scripts/setup-supabase.sh (reads JSON from the Supabase CLI on stdin).
 *
 *   project-ref <name>   print the reference id of the project with this name
 *   write-env  <ref>     write .env with the project URL and the PUBLISHABLE/anon key only
 *   auth-settings        print "autoconfirm=on|off" for the project in .env
 *
 * Secret / service_role keys are never printed or written anywhere.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const [cmd, arg] = process.argv.slice(2)

function stdinJson() {
  const text = fs.readFileSync(0, 'utf8').trim()
  const start = text.search(/[[{]/) // the CLI may print a notice before the JSON
  return JSON.parse(start >= 0 ? text.slice(start) : text)
}

function isSecret(k) {
  const v = String(k.api_key || k.key || '')
  if (v.startsWith('sb_secret_') || /secret|service_role/i.test(`${k.type || ''} ${k.name || ''}`)) return true
  try {
    return JSON.parse(Buffer.from(v.split('.')[1] || '', 'base64url').toString()).role === 'service_role'
  } catch {
    return false
  }
}

export function pickPublicKey(keys) {
  const list = (Array.isArray(keys) ? keys : keys.keys || []).filter((k) => !isSecret(k))
  const val = (k) => String(k.api_key || k.key || '')
  const publishable = list.find((k) => k.type === 'publishable' || val(k).startsWith('sb_publishable_'))
  const anon = list.find((k) => k.name === 'anon' && val(k).startsWith('eyJ'))
  const chosen = publishable || anon
  return chosen ? val(chosen) : ''
}

export function mergeEnv(existing, values) {
  const lines = existing ? existing.replace(/\s+$/, '').split(/\r?\n/) : []
  const seen = new Set()
  const out = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/)
    if (m && m[1] in values) {
      seen.add(m[1])
      return `${m[1]}=${values[m[1]]}`
    }
    return line
  })
  for (const [k, v] of Object.entries(values)) if (!seen.has(k)) out.push(`${k}=${v}`)
  return out.join('\n').replace(/\n*$/, '\n')
}

if (cmd === 'project-ref') {
  const projects = stdinJson()
  const name = (arg || 'FindBack').toLowerCase()
  const hits = projects.filter((p) => String(p.name || '').toLowerCase() === name)
  if (hits.length !== 1) {
    console.error(hits.length ? `More than one project is called "${arg}".` : `No project called "${arg}". Your projects: ${projects.map((p) => p.name).join(', ') || '(none)'}`)
    console.error('Run again with SUPABASE_PROJECT_REF=<ref> (Project Settings → General → Reference ID).')
    process.exit(2)
  }
  console.log(hits[0].ref || hits[0].id)
} else if (cmd === 'write-env') {
  if (!/^[a-z0-9]{10,40}$/.test(arg || '')) {
    console.error('Invalid project reference.')
    process.exit(2)
  }
  const key = pickPublicKey(stdinJson())
  if (!key) {
    console.error('Could not find a publishable or anon key for this project (Project Settings → API Keys).')
    process.exit(3)
  }
  const file = path.join(root, '.env')
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fs.readFileSync(path.join(root, '.env.example'), 'utf8')
  fs.writeFileSync(file, mergeEnv(before, { VITE_SUPABASE_URL: `https://${arg}.supabase.co`, VITE_SUPABASE_ANON_KEY: key }), { mode: 0o600 })
  console.log(`Wrote .env: VITE_SUPABASE_URL=https://${arg}.supabase.co and a ${key.startsWith('sb_publishable_') ? 'publishable' : 'anon'} key (${key.length} characters, not shown). No secret key was written.`)
} else if (cmd === 'auth-settings') {
  const env = Object.fromEntries(
    fs
      .readFileSync(path.join(root, '.env'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  )
  const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } })
  const data = await res.json()
  console.log(`autoconfirm=${data.mailer_autoconfirm ? 'on' : 'off'}`)
} else if (cmd) {
  console.error(`Unknown command ${cmd}`)
  process.exit(1)
}
