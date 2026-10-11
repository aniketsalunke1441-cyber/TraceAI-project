// Unit tests for the AI matching engine. Run with:  npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, scoreMatch, findMatchesFor, matchLabel, MIN_MATCH_SCORE } from '../src/lib/matching.js'

const lostPhone = {
  id: 'l1', user_id: 'u1', type: 'lost', status: 'open',
  title: 'Black iPhone 13 with blue silicone case',
  description: 'Lost my black iPhone in a blue case. Small crack at the bottom.',
  category: 'Electronics', color: 'Black', brand: 'Apple',
  location: 'Central Library, 2nd floor', date: '2026-10-01',
}
const foundPhone = {
  id: 'f1', user_id: 'u2', type: 'found', status: 'open',
  title: 'Black Apple smartphone in blue cover',
  description: 'Found a black mobile with a blue cover under a desk in the library.',
  category: 'Electronics', color: 'Black', brand: 'Apple',
  location: 'Library 2nd floor', date: '2026-10-02',
}
const foundBottle = {
  id: 'f2', user_id: 'u3', type: 'found', status: 'open',
  title: 'Blue steel water bottle', description: 'Milton bottle with stickers left in the gym.',
  category: 'Water Bottles', color: 'Blue', brand: 'Milton', location: 'Gym', date: '2026-10-02',
}

test('tokenize lower-cases, drops stop-words and maps synonyms', () => {
  const t = tokenize('Lost my iPhone and a Mobile near the Cafeteria!')
  assert.ok(t.includes('phone'), 'iphone/mobile -> phone')
  assert.ok(t.includes('canteen'), 'cafeteria -> canteen')
  assert.ok(!t.includes('the') && !t.includes('my'), 'stop-words removed')
})

test('same phone described differently gets a strong score with reasons', () => {
  const { score, reasons, breakdown } = scoreMatch(lostPhone, foundPhone)
  assert.ok(score >= 75, `expected strong match, got ${score}`)
  assert.equal(matchLabel(score).label, 'Strong match')
  assert.ok(reasons.some((r) => r.startsWith('Same category')))
  assert.ok(reasons.some((r) => r.startsWith('Same colour')))
  assert.ok(reasons.some((r) => r.startsWith('Same brand')))
  assert.equal(breakdown.length, 6)
})

test('unrelated items score below the match threshold', () => {
  const { score } = scoreMatch(lostPhone, foundBottle)
  assert.ok(score < MIN_MATCH_SCORE, `expected < ${MIN_MATCH_SCORE}, got ${score}`)
})

test('score is symmetric and stays within 0-99', () => {
  const a = scoreMatch(lostPhone, foundPhone).score
  const b = scoreMatch(foundPhone, lostPhone).score
  assert.equal(a, b)
  assert.ok(a >= 0 && a <= 99)
})

test('item "found" long before it was lost scores lower than one found right after', () => {
  const early = { ...foundPhone, date: '2026-09-01' }
  assert.ok(scoreMatch(lostPhone, early).score < scoreMatch(lostPhone, foundPhone).score)
})

test('findMatchesFor only returns open, opposite-type reports from other users, best first', () => {
  const sameUser = { ...foundPhone, id: 'f3', user_id: 'u1' }
  const resolved = { ...foundPhone, id: 'f4', status: 'resolved' }
  const otherLost = { ...lostPhone, id: 'l2', user_id: 'u9' }
  const results = findMatchesFor(lostPhone, [lostPhone, foundPhone, foundBottle, sameUser, resolved, otherLost])
  assert.deepEqual(results.map((m) => m.item.id), ['f1'])
})
