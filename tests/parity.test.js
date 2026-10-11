// The browser engine (src/lib/matching.js) and the Python engine (backend/app/matching.py)
// must agree. Both are checked against the same fixture; this file checks the JavaScript side.
// Regenerate the fixture only after an intentional algorithm change:  npm run gen:parity
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { tokenize, scoreMatch, findMatchesFor } from '../src/lib/matching.js'

const fixture = JSON.parse(fs.readFileSync(new URL('../backend/tests/fixtures/matching_parity.json', import.meta.url), 'utf8'))
const items = Object.fromEntries(fixture.items.map((i) => [i.id, i]))

test('JS tokenize matches the shared fixture', () => {
  for (const c of fixture.tokenize) assert.deepEqual(tokenize(c.text), c.tokens, c.text)
})

test(`JS scores for all ${fixture.pairs.length} lost/found pairs match the shared fixture`, () => {
  for (const p of fixture.pairs) {
    const r = scoreMatch(items[p.a], items[p.b])
    assert.deepEqual({ score: r.score, reasons: r.reasons, breakdown: r.breakdown }, { score: p.score, reasons: p.reasons, breakdown: p.breakdown }, `${p.a} vs ${p.b}`)
  }
})

test('JS ranked match lists match the shared fixture', () => {
  for (const m of fixture.find_matches)
    assert.deepEqual(findMatchesFor(items[m.item], fixture.items, 20).map((x) => ({ id: x.item.id, score: x.score })), m.results, m.item)
})
