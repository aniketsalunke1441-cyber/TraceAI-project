// Unit tests for search / filter / helper functions. Run with:  npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterItems, shortName, initials, resolveDisplayName, firstInitial } from '../src/lib/utils.js'

const items = [
  { id: 1, type: 'lost', status: 'open', category: 'Wallets & Purses', title: 'Brown leather wallet', description: 'cash and ID', location: 'Canteen', created_at: '2026-10-01T10:00:00Z' },
  { id: 2, type: 'found', status: 'open', category: 'Wallets & Purses', title: 'Wallet with metro card', description: '', location: 'Canteen counter', created_at: '2026-10-03T10:00:00Z' },
  { id: 3, type: 'found', status: 'resolved', category: 'Keys', title: 'Keys with red keychain', description: '', location: 'Parking', created_at: '2026-10-02T10:00:00Z' },
]

test('default filter shows only open items, newest first', () => {
  assert.deepEqual(filterItems(items).map((i) => i.id), [2, 1])
})
test('keyword search matches title/description/location (all words must match)', () => {
  assert.deepEqual(filterItems(items, { q: 'wallet' }).map((i) => i.id), [2, 1])
  assert.deepEqual(filterItems(items, { q: 'wallet metro' }).map((i) => i.id), [2])
  assert.deepEqual(filterItems(items, { q: 'canteen' }).length, 2)
})
test('type, category and status filters combine', () => {
  assert.deepEqual(filterItems(items, { type: 'found', q: 'wallet' }).map((i) => i.id), [2])
  assert.deepEqual(filterItems(items, { status: 'resolved' }).map((i) => i.id), [3])
  assert.deepEqual(filterItems(items, { status: 'all', category: 'Keys' }).map((i) => i.id), [3])
})
test('oldest-first sort', () => {
  assert.deepEqual(filterItems(items, { status: 'all', sort: 'oldest' }).map((i) => i.id), [1, 3, 2])
})
test('privacy helper shortens full names', () => {
  assert.equal(shortName('Priya Sharma'), 'Priya S.')
  assert.equal(shortName('Neha'), 'Neha')
  assert.equal(initials('Arjun Mehta'), 'AM')
})

test('user display name and first initial resolution', () => {
  assert.equal(resolveDisplayName('Bharat Prajapat', 'bharat@college.edu'), 'Bharat Prajapat')
  assert.equal(firstInitial('Bharat Prajapat', 'bharat@college.edu'), 'B')
  assert.equal(resolveDisplayName('', 'bharat@college.edu'), 'bharat')
  assert.equal(firstInitial('', 'bharat@college.edu'), 'B')
  assert.equal(resolveDisplayName('', ''), 'User')
  assert.equal(firstInitial('', ''), 'U')
})
