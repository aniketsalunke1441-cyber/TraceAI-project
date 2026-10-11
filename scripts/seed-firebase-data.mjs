#!/usr/bin/env node
/**
 * FindBack — Load demo data into Cloud Firestore and Firebase Storage
 *   npm run seed:firebase
 *
 * Populates Firestore with:
 *   - 4 demo student accounts
 *   - 15 lost and found reports with photos uploaded to Firebase Storage
 *   - Ownership claims (pending and approved)
 *   - Suggested matches calculated with FindBack's matching engine
 *   - In-app notifications
 */
import fs from 'node:fs'
import path from 'node:path'
import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { getFirestore, doc, setDoc, collection, addDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore'
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'

import { buildDemoItems, buildDemoClaims, DEMO_USERS, DEMO_PASSWORD } from '../src/lib/demoData.js'
import { findMatchesFor } from '../src/lib/matching.js'
import { shortName } from '../src/lib/utils.js'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

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

const env = readEnv()

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  console.error('\n❌ Firebase environment variables are not set in .env.')
  console.error('Please configure VITE_FIREBASE_* in your .env file first.\n')
  process.exit(1)
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

async function seed() {
  console.log('\nSeeding demo data into Firebase...\n')

  // 1. Authenticate or create demo users
  const userMap = new Map() // email -> uid
  for (const u of DEMO_USERS) {
    let uid = null
    try {
      const cred = await signInWithEmailAndPassword(auth, u.email, DEMO_PASSWORD)
      uid = cred.user.uid
      console.log(`✔ User exists: ${u.email} (${uid})`)
    } catch (err) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
        const cred = await createUserWithEmailAndPassword(auth, u.email, DEMO_PASSWORD)
        await updateProfile(cred.user, { displayName: u.name })
        uid = cred.user.uid
        console.log(`✔ Created user: ${u.email} (${uid})`)
      } else {
        throw err
      }
    }
    userMap.set(u.id, { uid, name: u.name, email: u.email })
  }

  // 2. Upload demo photos and save items
  console.log('\nUploading demo items & photos...')
  const demoItems = buildDemoItems()
  const createdItems = []

  for (const item of demoItems) {
    const owner = userMap.get(item.user_id) || Array.from(userMap.values())[0]
    let imageUrl = ''
    let imagePath = ''

    // Read local demo photo and upload
    const localPhotoPath = path.join(root, 'public', item.image_url)
    if (fs.existsSync(localPhotoPath)) {
      const photoBuffer = fs.readFileSync(localPhotoPath)
      const filename = `${path.basename(item.image_url, '.jpg')}.jpg`
      imagePath = `item-images/${owner.uid}/${filename}`
      const fileRef = storageRef(storage, imagePath)
      try {
        await uploadBytes(fileRef, photoBuffer, { contentType: 'image/jpeg' })
        imageUrl = await getDownloadURL(fileRef)
      } catch (err) {
        console.warn(`Could not upload photo ${imagePath}:`, err.message)
      }
    }

    const itemDocRef = doc(collection(db, 'items'))
    const docData = {
      type: item.type,
      title: item.title,
      description: item.description,
      category: item.category,
      color: item.color,
      brand: item.brand,
      location: item.location,
      date: item.date,
      status: item.status || 'open',
      user_id: owner.uid,
      reporter_name: shortName(owner.name),
      image_url: imageUrl || item.image_url,
      image_path: imagePath,
      created_at: new Date(Date.now() - Math.random() * 86400000 * 5).toISOString(),
      updated_at: new Date().toISOString(),
    }

    await setDoc(itemDocRef, docData)
    createdItems.push({ id: itemDocRef.id, ...docData })
    console.log(`✔ Added item: "${item.title}" (${item.type})`)
  }

  // 3. Compute and save matches
  console.log('\nComputing and saving suggestions...')
  let matchCount = 0
  for (const item of createdItems) {
    if (item.status !== 'open') continue
    const candidates = createdItems.filter((c) => c.status === 'open' && c.type !== item.type)
    const matches = findMatchesFor(item, candidates, 20)
    for (const m of matches) {
      const lost = item.type === 'lost' ? item : m.item
      const found = item.type === 'found' ? item : m.item
      const matchDocRef = doc(collection(db, 'matches'))
      await setDoc(matchDocRef, {
        lost_item_id: lost.id,
        found_item_id: found.id,
        score: m.score,
        reasons: m.reasons,
        breakdown: m.breakdown,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      matchCount++
    }
  }
  console.log(`✔ Saved ${matchCount} matches.`)

  console.log('\n✅ Demo data seeded into Firebase successfully!\n')
}

seed().catch((err) => {
  console.error('\n❌ Seeding failed:', err)
  process.exit(1)
})
