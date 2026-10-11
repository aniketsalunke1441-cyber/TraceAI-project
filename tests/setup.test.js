// Tests for the Supabase setup helpers. Run with:  npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { pickPublicKey, mergeEnv } from '../scripts/supabase-helpers.mjs'

const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`

test('picks the publishable key and never a secret / service_role key', () => {
  const keys = [
    { name: 'service_role', api_key: jwt('service_role') },
    { name: 'default', type: 'secret', api_key: 'sb_secret_x' },
    { name: 'anon', api_key: jwt('anon') },
    { name: 'default', type: 'publishable', api_key: 'sb_publishable_abc' },
  ]
  assert.equal(pickPublicKey(keys), 'sb_publishable_abc')
  assert.equal(pickPublicKey(keys.filter((k) => k.type !== 'publishable')), jwt('anon'))
  assert.equal(pickPublicKey([{ name: 'service_role', api_key: jwt('service_role') }, { name: 'x', api_key: 'sb_secret_y' }]), '')
  assert.equal(pickPublicKey([{ name: 'anon', api_key: jwt('service_role') }]), '', 'a mislabelled service_role JWT must be refused')
})

test('.env merge keeps other settings and replaces only the Supabase values', () => {
  const out = mergeEnv('# comment\nVITE_MATCHING_API_URL=http://localhost:8000\nVITE_SUPABASE_URL=old\n', {
    VITE_SUPABASE_URL: 'https://abc.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_k',
  })
  assert.equal(out, '# comment\nVITE_MATCHING_API_URL=http://localhost:8000\nVITE_SUPABASE_URL=https://abc.supabase.co\nVITE_SUPABASE_ANON_KEY=sb_publishable_k\n')
})

test('the Supabase CLI migration is identical to supabase/schema.sql', () => {
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))
  assert.equal(files.length, 1)
  const migration = fs.readFileSync(new URL(files[0], dir), 'utf8')
  const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  assert.ok(migration.endsWith(schema), 'run: copy supabase/schema.sql into the migration file')
})

test('every demo report has a photo file that exists and is a small JPEG', async () => {
  const { buildDemoItems } = await import('../src/lib/demoData.js')
  for (const item of buildDemoItems()) {
    assert.match(item.image_url, /^\/demo-photos\/[a-z-]+\.jpg$/, item.title)
    const file = new URL(`../public${item.image_url}`, import.meta.url)
    const bytes = fs.readFileSync(file)
    assert.ok(bytes[0] === 0xff && bytes[1] === 0xd8, `${item.image_url} is not a JPEG`)
    assert.ok(bytes.length < 2 * 1024 * 1024, `${item.image_url} exceeds the 2 MB bucket limit`)
  }
})
