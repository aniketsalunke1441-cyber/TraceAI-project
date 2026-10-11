// Security-related unit tests. Run with:  npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { sha256, hashPassword, makeSalt, safeEqual } from '../src/lib/password.js'
import { validateImageFile, MAX_ORIGINAL_BYTES } from '../src/lib/images.js'
import { DEMO_USERS, DEMO_PASSWORD } from '../src/lib/demoData.js'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const walk = (dir) =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  )

test('sha256 matches Node crypto', () => {
  for (const s of ['', 'abc', 'FindBack 🔑', 'x'.repeat(5000)])
    assert.equal(sha256(s), createHash('sha256').update(s).digest('hex'))
})

test('demo passwords are stored only as salted hashes', () => {
  for (const u of DEMO_USERS) {
    assert.equal(u.password, undefined, `${u.email} has a plain-text password`)
    assert.ok(safeEqual(hashPassword(DEMO_PASSWORD, u.salt), u.passwordHash), `${u.email} hash does not verify`)
    assert.ok(!safeEqual(hashPassword('wrong', u.salt), u.passwordHash))
  }
  const a = makeSalt()
  const b = makeSalt()
  assert.notEqual(a, b)
  assert.notEqual(hashPassword('same', a), hashPassword('same', b), 'salt must change the hash')
})

test('photo validation accepts JPG/PNG/WEBP and rejects other types and huge files', () => {
  assert.equal(validateImageFile({ type: 'image/jpeg', size: 1000 }), '')
  assert.equal(validateImageFile({ type: 'image/webp', size: 1000 }), '')
  assert.match(validateImageFile({ type: 'image/gif', size: 1000 }), /JPG, PNG or WEBP/)
  assert.match(validateImageFile({ type: 'application/pdf', size: 1000 }), /JPG, PNG or WEBP/)
  assert.match(validateImageFile({ type: 'image/png', size: MAX_ORIGINAL_BYTES + 1 }), /10 MB/)
  assert.match(validateImageFile({ type: 'image/png', size: 0 }), /empty/)
  assert.match(validateImageFile(null), /No file/)
})

test('no secret keys in frontend code or committed config', () => {
  const files = [...walk('src'), 'index.html', 'vite.config.js', '.env.example', 'package.json']
  for (const f of files) {
    const text = read(f)
    assert.ok(!/sb_secret_[A-Za-z0-9]/.test(text), `${f} contains a Supabase secret key`)
    assert.ok(!/SERVICE_ROLE_KEY\s*=\s*\S/.test(text), `${f} assigns a service-role key`)
    for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g) || []) {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
      assert.notEqual(payload.role, 'service_role', `${f} contains a service_role JWT`)
    }
  }
  assert.ok(/^\.env$/m.test(read('.gitignore')), '.env must be git-ignored')
})

test('schema.sql enables Row Level Security and has policies on every table', () => {
  const sql = read('supabase/schema.sql')
  const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])
  assert.deepEqual(tables.sort(), ['claims', 'items', 'matches', 'notifications'])
  for (const t of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${t}\\s+enable row level security`), `${t}: RLS not enabled`)
    assert.match(sql, new RegExp(`create policy "[^"]+"\\s+on public\\.${t} for select`), `${t}: no select policy`)
  }
  // storage bucket is size- and type-limited, uploads restricted to own folder
  assert.match(sql, /'item-images', 'item-images', true, 2097152, array\['image\/jpeg', 'image\/png', 'image\/webp'\]/)
  assert.match(sql, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/)
})
