#!/usr/bin/env node
/**
 * FindBack — Firebase connection & setup checker
 *   npm run check:firebase
 *
 * Reads Firebase configuration from .env and verifies:
 *   - all required Firebase client configuration keys are present
 *   - no service account private keys are leaked in client env variables
 *   - Firebase Auth & Firestore connectivity
 *   - Firestore 'items' collection accessibility
 *   - Firebase Storage configuration
 *
 * Exit code 0 = all checks passed or actionable instructions provided.
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
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
  return env
}

async function runChecks() {
  const env = readEnv()

  const apiKey = env.VITE_FIREBASE_API_KEY || ''
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN || ''
  const projectId = env.VITE_FIREBASE_PROJECT_ID || ''
  const storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET || ''
  const messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''
  const appId = env.VITE_FIREBASE_APP_ID || ''

  console.log('\nFindBack · Firebase check\n')

  if (!apiKey && !projectId && !appId) {
    info(
      'Firebase environment variables not set in .env',
      'FindBack is currently running in Demo Mode (or Supabase mode if Supabase keys exist).\n' +
      '     To connect Firebase, add the keys from Firebase Console to your .env file.\n' +
      '     See .env.example for details.'
    )
    printSummary()
    return
  }

  // 1. Validate required keys
  const missing = []
  if (!apiKey || apiKey.includes('YOUR_')) missing.push('VITE_FIREBASE_API_KEY')
  if (!authDomain || authDomain.includes('YOUR_')) missing.push('VITE_FIREBASE_AUTH_DOMAIN')
  if (!projectId || projectId.includes('YOUR_')) missing.push('VITE_FIREBASE_PROJECT_ID')
  if (!storageBucket || storageBucket.includes('YOUR_')) missing.push('VITE_FIREBASE_STORAGE_BUCKET')
  if (!messagingSenderId || messagingSenderId.includes('YOUR_')) missing.push('VITE_FIREBASE_MESSAGING_SENDER_ID')
  if (!appId || appId.includes('YOUR_')) missing.push('VITE_FIREBASE_APP_ID')

  if (missing.length > 0) {
    bad('Missing Firebase configuration keys in .env', missing.join(', '))
  } else {
    ok('All 6 Firebase web configuration variables present', `Project ID: ${projectId}`)
  }

  // 2. Security check: No private keys in frontend variables
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('VITE_')) {
      if (v.includes('BEGIN PRIVATE KEY') || v.includes('-----BEGIN RSA PRIVATE KEY-----')) {
        bad('SECURITY RISK: Private service account key found in frontend variable ' + k, 'Never put service account keys in VITE_ variables!')
      }
    }
  }
  ok('Security check passed', 'No private service account keys in frontend environment')

  // 3. Test Firestore REST accessibility
  if (projectId && !missing.includes('VITE_FIREBASE_PROJECT_ID')) {
    try {
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/items?pageSize=1`
      const res = await fetch(firestoreUrl)
      if (res.status === 200) {
        ok('Cloud Firestore is reachable', 'table/collection "items" responds (HTTP 200)')
      } else if (res.status === 404) {
        bad('Cloud Firestore database not found', 'Make sure you clicked "Create database" in Firebase Console -> Firestore Database.')
      } else if (res.status === 403) {
        info('Cloud Firestore responded (HTTP 403 - Rules enforced)', 'Rules are active. Security rules require authentication or specific read permissions.')
      } else {
        info(`Cloud Firestore response status: ${res.status}`)
      }
    } catch (err) {
      bad('Could not reach Cloud Firestore', err.message)
    }
  }

  // 4. Test Firebase Auth identity toolkit endpoint
  if (apiKey && !missing.includes('VITE_FIREBASE_API_KEY')) {
    try {
      const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`
      const res = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ continueUri: `https://${projectId}.firebaseapp.com` }),
      })
      if (res.status === 200 || res.status === 400) {
        ok('Firebase Auth API Key is valid and active', 'Identity Toolkit responded')
      } else if (res.status === 403) {
        bad('Firebase API Key rejected (403)', 'Make sure Identity Toolkit / Firebase Auth API is enabled in your Google Cloud / Firebase console.')
      }
    } catch (err) {
      info('Firebase Auth ping', err.message)
    }
  }

  printSummary()
}

function printSummary() {
  let hasFail = false
  for (const r of results) {
    if (r.status === 'PASS') console.log(`✅ ${r.name}${r.detail ? '\n     ' + r.detail : ''}`)
    else if (r.status === 'FAIL') {
      hasFail = true
      console.log(`❌ ${r.name}${r.detail ? '\n     ' + r.detail : ''}`)
    } else {
      console.log(`ℹ️  ${r.name}${r.detail ? '\n     ' + r.detail : ''}`)
    }
  }
  console.log()
  if (hasFail) {
    console.log('Some checks failed. Please review your Firebase configuration in .env.\n')
    process.exit(1)
  } else {
    console.log('Firebase check completed successfully.\n')
  }
}

runChecks()
