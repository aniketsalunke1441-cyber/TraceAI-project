#!/usr/bin/env node
/**
 * Generates backend/tests/fixtures/matching_parity.json from the JavaScript
 * matching engine (src/lib/matching.js). The Python engine (backend/app/matching.py)
 * must reproduce every score, reason and breakdown in this file exactly.
 *
 *   npm run gen:parity     (only needed after deliberately changing the algorithm)
 */
import fs from 'node:fs'
import path from 'node:path'
import { tokenize, scoreMatch, findMatchesFor } from '../src/lib/matching.js'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(root, 'backend/tests/fixtures/matching_parity.json')

const base = { status: 'open', description: '', color: '', brand: '', location: '' }
const it = (id, type, user_id, fields) => ({ ...base, id, type, user_id, ...fields })

// Fixed dates so the fixture never changes by itself.
export const ITEMS = [
  it('L1', 'lost', 'u1', { title: 'Black iPhone 13 with blue silicone case', description: 'Lost my black iPhone 13 in a blue silicone case. Lock screen wallpaper is a mountain photo. Small crack at the bottom left corner.', category: 'Electronics', color: 'Black', brand: 'Apple', location: 'Central Library, 2nd floor reading area', date: '2026-10-06' }),
  it('L2', 'lost', 'u3', { title: 'Brown leather wallet', description: 'Brown leather bi-fold wallet with my college ID, a metro card and some cash. Initials "AM" on the inside.', category: 'Wallets & Purses', color: 'Brown', brand: 'Woodland', location: 'Main canteen', date: '2026-10-04' }),
  it('L3', 'lost', 'u4', { title: 'Blue Jansport backpack', description: 'Blue backpack with two notebooks, a pencil pouch and a black umbrella. Has a small keychain of a panda.', category: 'Bags', color: 'Blue', brand: 'Jansport', location: 'Bus stop near main gate', date: '2026-10-07' }),
  it('L4', 'lost', 'u3', { title: 'HP laptop charger', description: 'Black 65W HP laptop charger with round pin. Name tag "Arjun" stuck on the brick.', category: 'Electronics', color: 'Black', brand: 'HP', location: 'Computer Lab 204', date: '2026-10-02' }),
  it('L5', 'lost', 'u2', { title: 'Student ID card', description: 'College ID card in a red lanyard.', category: 'ID & Cards', color: 'Red', location: 'Sports complex', date: '2026-10-08' }),
  it('L6', 'lost', 'u1', { title: 'White AirPods Pro case', description: 'White AirPods Pro charging case with both earbuds inside. Has a small scratch on the lid.', category: 'Electronics', color: 'White', brand: 'Apple', location: 'Main Auditorium', date: '2026-09-30' }),
  it('L7', 'lost', 'u5', { title: 'Grey Casio calculator!!', description: 'fx-991EX, scientific; name scratched on back…', category: 'Books & Stationery', color: 'Silver', brand: ' casio ', location: 'Physics Lab', date: '2026-10-01' }),
  it('L8', 'lost', 'u6', { title: 'Keys', description: '', category: 'Keys', color: '', brand: '', location: '', date: null }),
  it('L9', 'lost', 'u7', { title: 'Navy rucksack', description: 'Navy blue rucksack, laptop sleeve inside', category: 'Bags', color: 'Navy', location: 'Main gate bus stop', date: '2026-10-09' }),
  it('L10', 'lost', 'u8', { title: 'Multicolour umbrella', description: 'Folding umbrella, rainbow pattern', category: 'Accessories', color: 'Multicolor', location: 'Library entrance', date: '2026-10-01' }),
  it('F1', 'found', 'u2', { title: 'Black Apple smartphone in blue case', description: 'Found a black iPhone with a blue cover under a desk on the second floor of the library. Screen has a small crack.', category: 'Electronics', color: 'Black', brand: 'Apple', location: 'Central Library, 2nd floor', date: '2026-10-07' }),
  it('F2', 'found', 'u4', { title: 'Leather wallet with metro card', description: 'Brown wallet found near the canteen counter. Contains a metro card and an ID.', category: 'Wallets & Purses', color: 'Brown', location: 'Canteen counter', date: '2026-10-05' }),
  it('F3', 'found', 'u3', { title: 'Set of keys with red keychain', description: 'Three keys on a red rubber keychain, one looks like a bike key.', category: 'Keys', color: 'Red', location: 'Parking lot B', date: '2026-10-08' }),
  it('F4', 'found', 'u4', { title: 'White wireless earbuds case', description: 'White earbuds charging case found on a seat in row F of the auditorium after the seminar.', category: 'Electronics', color: 'White', location: 'Auditorium, row F', date: '2026-10-01' }),
  it('F5', 'found', 'u2', { title: 'Blue steel water bottle', description: 'Blue Milton steel bottle with stickers, left on the bench in the gym.', category: 'Water Bottles', color: 'Blue', brand: 'Milton', location: 'Gym, ground floor', date: '2026-10-06' }),
  it('F6', 'found', 'u3', { title: 'Navy blue backpack with notebooks', description: 'Navy backpack found on the bench at the main gate bus stop. Contains notebooks, a pencil pouch and an umbrella.', category: 'Bags', color: 'Blue', location: 'Main gate bus stop', date: '2026-10-08' }),
  it('F7', 'found', 'u2', { title: 'Casio scientific calculator', description: 'Grey Casio fx-991EX calculator left in the lab after the practical exam.', category: 'Books & Stationery', color: 'Gray', brand: 'Casio', location: 'Physics Lab 101', date: '2026-10-03' }),
  it('F8', 'found', 'u1', { title: 'Grey hoodie', description: 'Grey zip hoodie, size M, left on a chair in the seminar hall.', category: 'Clothing', color: 'Gray', location: 'Seminar Hall 3', date: '2026-10-07' }),
  it('F9', 'found', 'u9', { title: 'Phone found weeks before', description: 'Old black phone', category: 'Electronics', color: 'Black', brand: 'Apple', location: 'Library', date: '2026-09-01' }),
  it('F10', 'found', 'u9', { title: 'Keys found', description: 'keys', category: 'Keys', color: 'Silver', location: 'Gate', date: '2026-11-15' }),
  it('F11', 'found', 'u8', { title: 'Umbrella', description: 'Black folding umbrella', category: 'Accessories', color: 'Black', location: 'Library entrance stand', date: '2026-10-01', status: 'resolved' }),
  it('F12', 'found', 'u1', { title: 'Black iPhone (same owner as L1)', description: 'Black iPhone blue case', category: 'Electronics', color: 'Black', brand: 'Apple', location: 'Central Library', date: '2026-10-06' }),
]

const TOKENIZE_CASES = [
  '',
  'Lost my iPhone and a Mobile near the Cafeteria!',
  'Keys, keychain & key-fob (red)',
  'The   batteries   are in the laboratories',
  'Wallet’s “cash”—and IDs',
  'glasses classes boxes buses',
  'ﾠunicode spaces\ttabs\nnewlines',
]

const lost = ITEMS.filter((i) => i.type === 'lost')
const found = ITEMS.filter((i) => i.type === 'found')
const pairs = []
for (const a of lost) for (const b of found) pairs.push({ a: a.id, b: b.id, ...scoreMatch(a, b), reverse_score: scoreMatch(b, a).score })

const matches = ITEMS.map((item) => ({
  item: item.id,
  results: findMatchesFor(item, ITEMS, 20).map((m) => ({ id: m.item.id, score: m.score })),
}))

const fixture = {
  generated_by: 'scripts/generate-parity-fixtures.mjs from src/lib/matching.js',
  items: ITEMS,
  tokenize: TOKENIZE_CASES.map((text) => ({ text, tokens: tokenize(text) })),
  pairs,
  find_matches: matches,
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n')
console.log(`wrote ${path.relative(root, out)}: ${pairs.length} pairs, ${matches.length} match lists, ${TOKENIZE_CASES.length} tokenize cases`)
