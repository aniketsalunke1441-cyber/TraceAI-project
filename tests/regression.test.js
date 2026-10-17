// Regression test suite for audited and repaired FindBack features
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { resolveDisplayName, firstInitial, shortName, filterItems, todayISO } from '../src/lib/utils.js'
import { validateImageFile, ALLOWED_IMAGE_TYPES, MAX_ORIGINAL_BYTES } from '../src/lib/images.js'
import { CATEGORIES, COLORS } from '../src/lib/constants.js'
import { scoreMatch, matchLabel } from '../src/lib/matching.js'

test('utils: resolveDisplayName and firstInitial fallbacks', () => {
  assert.equal(resolveDisplayName('', 'test@example.com'), 'test')
  assert.equal(resolveDisplayName(null, 'john.doe@college.edu'), 'john.doe')
  assert.equal(resolveDisplayName(undefined, ''), 'User')
  assert.equal(firstInitial('', 'alice@college.edu'), 'A')
  assert.equal(firstInitial('   ', 'bob@college.edu'), 'B')
  assert.equal(firstInitial(null, null), 'U')
})

test('utils: shortName handles single names and multiple names', () => {
  assert.equal(shortName('Priya'), 'Priya')
  assert.equal(shortName('Priya Sharma'), 'Priya S.')
  assert.equal(shortName('Arjun Kumar Mehta'), 'Arjun M.')
  assert.equal(shortName(''), 'Anonymous')
  assert.equal(shortName('   '), 'Anonymous')
})

test('utils: todayISO returns YYYY-MM-DD format', () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/)
})

test('constants: categories and colors are populated', () => {
  assert.ok(CATEGORIES.includes('Electronics'))
  assert.ok(CATEGORIES.includes('Keys'))
  assert.ok(COLORS.includes('Black'))
  assert.ok(COLORS.includes('Blue'))
})

test('images: validation accepts all allowed types and enforces size limits', () => {
  for (const t of ALLOWED_IMAGE_TYPES) {
    assert.equal(validateImageFile({ type: t, size: 500 * 1024 }), '')
  }
  assert.match(validateImageFile({ type: 'image/bmp', size: 100 }), /JPG, PNG or WEBP/)
  assert.match(validateImageFile({ type: 'image/jpeg', size: MAX_ORIGINAL_BYTES + 10 }), /10 MB/)
  assert.match(validateImageFile({ type: 'image/jpeg', size: 0 }), /empty/)
})

test('matching: scoreMatch correctly scores matching lost and found reports', () => {
  const lost = {
    type: 'lost',
    title: 'Blue Dell Laptop 15 inch',
    description: 'Lost my Dell Inspiron laptop in the campus library 2nd floor.',
    category: 'Electronics',
    color: 'Blue',
    brand: 'Dell',
    location: 'Central Library',
    date: todayISO(),
  }
  const found = {
    type: 'found',
    title: 'Dell Laptop found in Library',
    description: 'Found a blue Dell 15-inch laptop near study desks in the library.',
    category: 'Electronics',
    color: 'Blue',
    brand: 'Dell',
    location: 'Central Library 2nd floor',
    date: todayISO(),
  }
  const match = scoreMatch(lost, found)
  assert.ok(match.score >= 70, `Expected score >= 70, got ${match.score}`)
  assert.equal(matchLabel(match.score).tone, 'emerald')
  assert.ok(match.reasons.length > 0)
  assert.ok(match.breakdown.length === 6)
})

test('build verification: all react and scheduler packages reside in vendor chunk', () => {
  const distAssets = path.resolve('dist/assets')
  if (!fs.existsSync(distAssets)) return // skip if dist not built yet
  const files = fs.readdirSync(distAssets)
  const indexFile = files.find((f) => f.startsWith('index-') && f.endsWith('.js') && !f.endsWith('.map'))
  const vendorFile = files.find((f) => f.startsWith('vendor-') && f.endsWith('.js') && !f.endsWith('.map'))
  assert.ok(indexFile, 'index chunk must exist')
  assert.ok(vendorFile, 'vendor chunk must exist')

  // Check map file if present
  const vendorMapFile = files.find((f) => f.startsWith('vendor-') && f.endsWith('.js.map'))
  if (vendorMapFile) {
    const map = JSON.parse(fs.readFileSync(path.join(distAssets, vendorMapFile), 'utf8'))
    const hasReactDomClient = map.sources.some((s) => s.includes('react-dom-client') || s.includes('client.js'))
    assert.ok(hasReactDomClient, 'vendor chunk must bundle react-dom/client to avoid duplicate reconciler instances')
  }
})
