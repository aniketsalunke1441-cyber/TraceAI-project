/**
 * Firebase Data Layer Implementation for FindBack
 * -----------------------------------------------
 * Handles Firebase Authentication, Cloud Firestore, and Firebase Cloud Storage.
 * Fully mirrors FindBack's data model and security rules:
 *   - items (lost & found reports)
 *   - matches (suggested matches with scores and explanations)
 *   - claims (ownership claims with proof and finder approval)
 *   - notifications (in-app notifications for claims and matches)
 *   - item-images (compressed JPG photographs stored in Cloud Storage)
 */
import {
  auth,
  db,
  storage,
  isFirebaseConfigured,
  IMAGE_FOLDER,
} from './firebase'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  writeBatch,
} from 'firebase/firestore'
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { findMatchesFor } from './matching'
import { resolveDisplayName, shortName } from './utils'

const MATCH_NOTIFY_SCORE = 60
const MATCHES_TO_STORE = 20

/* ------------------------------------------------------------------ */
/*  Helper & Error formatting                                          */
/* ------------------------------------------------------------------ */
export function formatFirebaseError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return new Error(fallback)
  const code = err.code || ''
  const msg = err.message || String(err)
  let text = fallback

  if (code === 'auth/email-already-in-use') text = 'An account with this email already exists.'
  else if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password')
    text = 'Invalid email or password.'
  else if (code === 'auth/weak-password') text = 'Password should be at least 6 characters.'
  else if (code === 'auth/invalid-email') text = 'Please enter a valid email address.'
  else if (code === 'permission-denied') text = 'You are not allowed to do that.'
  else if (code === 'unavailable' || /network|failed to fetch/i.test(msg))
    text = 'Cannot reach Firebase database. Check your internet connection and try again.'
  else if (code === 'storage/unauthorized') text = 'You are not authorized to upload or delete this photo.'
  else if (code === 'storage/quota-exceeded') text = 'Storage quota exceeded.'
  else if (msg) text = msg

  const errorObj = new Error(text)
  errorObj.code = code
  errorObj.cause = err
  return errorObj
}

export async function getFirebaseUserProfile(uid) {
  if (!db || !uid) return null
  try {
    const userDoc = await getDoc(doc(db, 'users', uid))
    if (userDoc.exists()) {
      return userDoc.data()
    }
  } catch (err) {
    console.warn('Could not read user profile from Firestore:', err?.message)
  }
  return null
}

export function mapFirebaseUser(u, profileData = null) {
  if (!u) return null
  const profileName = profileData?.name || profileData?.displayName || profileData?.full_name
  const name = resolveDisplayName(u.displayName || profileName, u.email)
  return {
    id: u.uid,
    email: u.email || '',
    name,
  }
}

/* ------------------------------------------------------------------ */
/*  Connection Check                                                   */
/* ------------------------------------------------------------------ */
export async function checkFirebaseConnection() {
  if (!isFirebaseConfigured || !db) {
    return { ok: false, mode: 'firebase', message: 'Firebase configuration is incomplete in .env.' }
  }
  try {
    const q = query(collection(db, 'items'), firestoreLimit(1))
    await getDocs(q)
    return { ok: true, mode: 'firebase' }
  } catch (error) {
    return { ok: false, mode: 'firebase', message: formatFirebaseError(error, 'Could not connect to Firebase.').message }
  }
}

/* ------------------------------------------------------------------ */
/*  Authentication                                                     */
/* ------------------------------------------------------------------ */
export async function getCurrentFirebaseUser() {
  if (!auth) return null
  let fbUser = auth.currentUser
  if (!fbUser) {
    fbUser = await new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          unsubscribe()
          resolve(user)
        },
        () => resolve(null)
      )
    })
  }
  if (!fbUser) return null
  let profile = null
  if (!fbUser.displayName) {
    profile = await getFirebaseUserProfile(fbUser.uid).catch(() => null)
  }
  return mapFirebaseUser(fbUser, profile)
}

export function onFirebaseAuthStateChange(callback) {
  if (!auth) return () => {}
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null)
      return
    }
    let profile = null
    if (!user.displayName) {
      profile = await getFirebaseUserProfile(user.uid).catch(() => null)
    }
    callback(mapFirebaseUser(user, profile))
  })
}

export async function firebaseSignUp({ name, email, password }) {
  email = email.trim().toLowerCase()
  const trimmedName = (name || '').trim()
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (trimmedName) {
      await updateProfile(cred.user, { displayName: trimmedName }).catch(() => {})
    }
    if (db) {
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: trimmedName || (email.split('@')[0] || 'User'),
        email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { merge: true }).catch(() => {})
    }
    return { user: mapFirebaseUser(cred.user, { name: trimmedName }), needsConfirmation: false }
  } catch (err) {
    throw formatFirebaseError(err)
  }
}

export async function firebaseSignIn({ email, password }) {
  email = email.trim().toLowerCase()
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    let profile = null
    if (!cred.user.displayName) {
      profile = await getFirebaseUserProfile(cred.user.uid).catch(() => null)
    }
    return mapFirebaseUser(cred.user, profile)
  } catch (err) {
    throw formatFirebaseError(err)
  }
}

export async function updateFirebaseUserProfile({ name }) {
  if (!auth?.currentUser) throw new Error('Not logged in.')
  const trimmedName = (name || '').trim()
  try {
    if (trimmedName) {
      await updateProfile(auth.currentUser, { displayName: trimmedName })
    }
    if (db) {
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        name: trimmedName,
        email: auth.currentUser.email || '',
        updated_at: new Date().toISOString(),
      }, { merge: true }).catch(() => {})
    }
    return mapFirebaseUser(auth.currentUser, { name: trimmedName })
  } catch (err) {
    throw formatFirebaseError(err, 'Failed to update user profile.')
  }
}

export async function firebaseSignOut() {
  if (!auth) return
  try {
    await fbSignOut(auth)
  } catch (err) {
    throw formatFirebaseError(err)
  }
}

/* ------------------------------------------------------------------ */
/*  Photos (Cloud Storage)                                             */
/* ------------------------------------------------------------------ */
export async function uploadFirebaseImage(blob, user) {
  if (!storage) throw new Error('Firebase Storage is not configured.')
  const filename = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.jpg`
  const path = `${IMAGE_FOLDER}/${user.id}/${filename}`
  const fileRef = storageRef(storage, path)
  try {
    await uploadBytes(fileRef, blob, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    })
    const url = await getDownloadURL(fileRef)
    return { image_url: url, image_path: path }
  } catch (err) {
    throw formatFirebaseError(err, 'Photo upload failed.')
  }
}

export async function removeFirebaseImage(path) {
  if (!storage || !path) return
  try {
    const fileRef = storageRef(storage, path)
    await deleteObject(fileRef)
  } catch (err) {
    console.warn('Could not delete old photo from Firebase Storage', path, err.message)
  }
}

/* ------------------------------------------------------------------ */
/*  Items (Lost & Found Reports)                                       */
/* ------------------------------------------------------------------ */
export async function listFirebaseItems() {
  try {
    const q = query(collection(db, 'items'), orderBy('created_at', 'desc'), firestoreLimit(500))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    // Fallback if orderBy index is not yet built
    try {
      const snap = await getDocs(collection(db, 'items'))
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      return list
    } catch (e2) {
      throw formatFirebaseError(err, 'Could not load reports.')
    }
  }
}

export async function getFirebaseItem(id) {
  if (!id) return null
  try {
    const snap = await getDoc(doc(db, 'items', id))
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() }
  } catch (err) {
    throw formatFirebaseError(err, 'Could not load this report.')
  }
}

export async function listMyFirebaseItems(userId) {
  try {
    const q = query(collection(db, 'items'), where('user_id', '==', userId))
    const snap = await getDocs(q)
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    return list
  } catch (err) {
    throw formatFirebaseError(err, 'Could not load your reports.')
  }
}

export async function createFirebaseItem(fields, user, { imageBlob } = {}) {
  const image = imageBlob ? await uploadFirebaseImage(imageBlob, user) : { image_url: '', image_path: '' }
  const now = new Date().toISOString()
  const itemData = {
    ...fields,
    ...image,
    user_id: user.id,
    reporter_name: shortName(user.name),
    status: 'open',
    created_at: now,
    updated_at: now,
  }
  let docRef
  try {
    docRef = await addDoc(collection(db, 'items'), itemData)
  } catch (err) {
    if (image.image_path) await removeFirebaseImage(image.image_path)
    throw formatFirebaseError(err, 'Could not save your report.')
  }
  return { id: docRef.id, ...itemData }
}

export async function updateFirebaseItem(id, fields, user, { imageBlob, removeImage: dropImage = false, previous = null } = {}) {
  let uploaded = null
  if (imageBlob) {
    uploaded = await uploadFirebaseImage(imageBlob, user)
    Object.assign(fields, uploaded)
  } else if (dropImage) {
    Object.assign(fields, { image_url: '', image_path: '' })
  }
  fields.updated_at = new Date().toISOString()
  const itemRef = doc(db, 'items', id)
  try {
    await updateDoc(itemRef, fields)
  } catch (err) {
    if (uploaded) await removeFirebaseImage(uploaded.image_path)
    throw formatFirebaseError(err, 'Could not save your changes.')
  }
  if ((uploaded || dropImage) && previous?.image_path && previous.image_path !== fields.image_path) {
    await removeFirebaseImage(previous.image_path)
  }
  const snap = await getDoc(itemRef)
  return { id: snap.id, ...snap.data() }
}

export async function updateFirebaseItemStatus(id, status) {
  const now = new Date().toISOString()
  const itemRef = doc(db, 'items', id)
  try {
    await updateDoc(itemRef, { status, updated_at: now })
  } catch (err) {
    throw formatFirebaseError(err, 'Could not update status.')
  }
}

export async function deleteFirebaseItem(id, user, item = null) {
  const itemRef = doc(db, 'items', id)
  try {
    await deleteDoc(itemRef)
  } catch (err) {
    throw formatFirebaseError(err, 'Could not delete report.')
  }
  if (item?.image_path) await removeFirebaseImage(item.image_path)

  // Cascade delete associated matches and claims
  try {
    const q1 = query(collection(db, 'matches'), where('lost_item_id', '==', id))
    const q2 = query(collection(db, 'matches'), where('found_item_id', '==', id))
    const q3 = query(collection(db, 'claims'), where('item_id', '==', id))
    const [s1, s2, s3] = await Promise.all([getDocs(q1), getDocs(q2), getDocs(q3)])
    const batch = writeBatch(db)
    s1.docs.forEach((d) => batch.delete(d.ref))
    s2.docs.forEach((d) => batch.delete(d.ref))
    s3.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit().catch(() => {})
  } catch {
    /* ignore cascade cleanup error */
  }
}

/* ------------------------------------------------------------------ */
/*  Matches (Suggested Matches)                                        */
/* ------------------------------------------------------------------ */
export async function saveFirebaseMatches(item, candidates) {
  const q1 = query(collection(db, 'matches'), where('lost_item_id', '==', item.id))
  const q2 = query(collection(db, 'matches'), where('found_item_id', '==', item.id))
  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)])

  const existingMap = new Map()
  const oldDocRefs = new Set()
  for (const d of [...snap1.docs, ...snap2.docs]) {
    const data = d.data()
    oldDocRefs.add(d.ref)
    existingMap.set(`${data.lost_item_id}:${data.found_item_id}`, { id: d.id, ...data })
  }

  const batch = writeBatch(db)
  for (const ref of oldDocRefs) batch.delete(ref)

  const now = new Date().toISOString()
  const notes = []

  for (const c of candidates) {
    const lost = item.type === 'lost' ? item : c.item
    const found = item.type === 'found' ? item : c.item
    const key = `${lost.id}:${found.id}`
    const existing = existingMap.get(key)
    const matchRef = doc(collection(db, 'matches'))

    batch.set(matchRef, {
      lost_item_id: lost.id,
      found_item_id: found.id,
      score: c.score,
      reasons: c.reasons,
      breakdown: c.breakdown,
      created_at: existing?.created_at || now,
      updated_at: now,
    })

    if (!existing && c.score >= MATCH_NOTIFY_SCORE) {
      notes.push(
        {
          user_id: lost.user_id,
          kind: 'match_found',
          title: 'Potential match for your lost item',
          body: `"${found.title}" looks like your "${lost.title}" (${c.score}% match). Not verified yet — open it to check.`,
          link: `/items/${found.id}`,
          ref_id: found.id,
          created_at: now,
          read_at: null,
        },
        {
          user_id: found.user_id,
          kind: 'match_found',
          title: 'Potential owner for an item you found',
          body: `"${lost.title}" may be the item you found (${c.score}% match).`,
          link: `/items/${lost.id}`,
          ref_id: lost.id,
          created_at: now,
          read_at: null,
        }
      )
    }
  }

  for (const n of notes) {
    const nRef = doc(collection(db, 'notifications'))
    batch.set(nRef, n)
  }

  await batch.commit()
  return candidates.length
}

export async function getFirebaseMatchesForItems(items, limitEach = 6) {
  if (!items.length) return new Map()
  const ids = items.map((i) => i.id)

  const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))
  const idChunks = chunk(ids, 30)

  const matchRows = []
  for (const ch of idChunks) {
    const q1 = query(collection(db, 'matches'), where('lost_item_id', 'in', ch))
    const q2 = query(collection(db, 'matches'), where('found_item_id', 'in', ch))
    const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)])
    for (const d of [...s1.docs, ...s2.docs]) matchRows.push({ id: d.id, ...d.data() })
  }

  const seen = new Set()
  const uniqueRows = matchRows.filter((r) => seen.has(r.id) ? false : (seen.add(r.id), true))

  const otherIds = [...new Set(uniqueRows.flatMap((r) => [r.lost_item_id, r.found_item_id]))].filter((id) => !ids.includes(id))
  let others = []
  if (otherIds.length) {
    const otherChunks = chunk(otherIds, 30)
    for (const ch of otherChunks) {
      const q = query(collection(db, 'items'), where('__name__', 'in', ch))
      const snap = await getDocs(q)
      for (const d of snap.docs) others.push({ id: d.id, ...d.data() })
    }
  }

  // Group matches by item
  const byItem = new Map(items.map((i) => [i.id, []]))
  for (const r of uniqueRows) {
    for (const mine of items) {
      const otherId = r.lost_item_id === mine.id ? r.found_item_id : r.found_item_id === mine.id ? r.lost_item_id : null
      if (!otherId) continue
      const other = others.find((o) => o.id === otherId)
      if (!other || other.status !== 'open') continue
      byItem.get(mine.id).push({
        id: r.id,
        item: other,
        score: r.score,
        reasons: r.reasons || [],
        breakdown: r.breakdown || [],
        updated_at: r.updated_at,
      })
    }
  }
  for (const list of byItem.values()) {
    list.sort((a, b) => b.score - a.score)
  }
  for (const [k, v] of byItem) byItem.set(k, v.slice(0, limitEach))
  return byItem
}

/* ------------------------------------------------------------------ */
/*  Claims (Ownership Claims & Decisions)                              */
/* ------------------------------------------------------------------ */
export async function createFirebaseClaim({ item, user, message, contact }) {
  if (item.status !== 'open') throw new Error('This report is no longer open for claims.')
  if (item.user_id === user.id) throw new Error('You cannot claim your own report.')

  const q = query(collection(db, 'claims'), where('item_id', '==', item.id), where('claimant_id', '==', user.id))
  const existingSnap = await getDocs(q)
  if (existingSnap.docs.some((d) => d.data().status !== 'rejected' && d.data().status !== 'cancelled')) {
    throw new Error('You already have an active claim on this item.')
  }

  const now = new Date().toISOString()
  const claimData = {
    item_id: item.id,
    owner_id: item.user_id,
    claimant_id: user.id,
    claimant_name: user.name,
    claimant_contact: contact.trim(),
    message: message.trim(),
    status: 'pending',
    response_note: '',
    created_at: now,
    updated_at: now,
  }

  const batch = writeBatch(db)
  const claimRef = doc(collection(db, 'claims'))
  batch.set(claimRef, claimData)

  const noteRef = doc(collection(db, 'notifications'))
  batch.set(noteRef, {
    user_id: item.user_id,
    kind: 'claim_received',
    title: 'New ownership claim',
    body: `${user.name} submitted a claim for "${item.title}". Review it to approve or reject.`,
    link: `/items/${item.id}`,
    ref_id: claimRef.id,
    created_at: now,
    read_at: null,
  })

  await batch.commit()
  return { id: claimRef.id, ...claimData }
}

export async function listFirebaseClaimsForUser(userId) {
  const q1 = query(collection(db, 'claims'), where('owner_id', '==', userId))
  const q2 = query(collection(db, 'claims'), where('claimant_id', '==', userId))
  const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)])

  const seen = new Set()
  const allClaims = []
  for (const d of [...s1.docs, ...s2.docs]) {
    if (!seen.has(d.id)) {
      seen.add(d.id)
      allClaims.push({ id: d.id, ...d.data() })
    }
  }

  const itemIds = [...new Set(allClaims.map((c) => c.item_id))]
  let items = []
  if (itemIds.length) {
    const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))
    for (const ch of chunk(itemIds, 30)) {
      const sq = query(collection(db, 'items'), where('__name__', 'in', ch))
      const snap = await getDocs(sq)
      for (const d of snap.docs) items.push({ id: d.id, ...d.data() })
    }
  }

  const withItem = allClaims
    .map((c) => ({ ...c, item: items.find((i) => i.id === c.item_id) || null }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return {
    incoming: withItem.filter((c) => c.owner_id === userId),
    outgoing: withItem.filter((c) => c.claimant_id === userId),
  }
}

export async function listFirebaseClaimsForItem(itemId, user) {
  if (!user) return []
  const q = query(collection(db, 'claims'), where('item_id', '==', itemId))
  const snap = await getDocs(q)
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return docs
    .filter((c) => c.owner_id === user.id || c.claimant_id === user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function respondToFirebaseClaim(claim, status, responseNote = '', user) {
  const note = responseNote.trim()
  if (!['approved', 'rejected'].includes(status)) throw new Error('Invalid claim status.')
  if (status === 'approved' && note.length < 5) throw new Error('Add pickup details (at least 5 characters).')

  const now = new Date().toISOString()
  const itemSnap = await getDoc(doc(db, 'items', claim.item_id))
  const itemTitle = itemSnap.exists() ? itemSnap.data().title : 'an item'

  const q = query(collection(db, 'claims'), where('item_id', '==', claim.item_id))
  const claimsSnap = await getDocs(q)
  const batch = writeBatch(db)

  // Update target claim
  batch.update(doc(db, 'claims', claim.id), { status, response_note: note, updated_at: now })

  // Notify claimant
  const noteRef1 = doc(collection(db, 'notifications'))
  batch.set(noteRef1, {
    user_id: claim.claimant_id,
    kind: status === 'approved' ? 'claim_approved' : 'claim_rejected',
    title: status === 'approved' ? 'Claim approved' : 'Claim not approved',
    body: `Your claim for "${itemTitle}" was ${status}.`,
    link: '/claims',
    ref_id: claim.id,
    created_at: now,
    read_at: null,
  })

  if (status === 'approved') {
    // Reject other pending claims
    for (const cd of claimsSnap.docs) {
      if (cd.id !== claim.id && cd.data().status === 'pending') {
        batch.update(cd.ref, { status: 'rejected', response_note: 'Another claim was approved for this item.', updated_at: now })
        const rNoteRef = doc(collection(db, 'notifications'))
        batch.set(rNoteRef, {
          user_id: cd.data().claimant_id,
          kind: 'claim_rejected',
          title: 'Claim not approved',
          body: `Your claim for "${itemTitle}" was rejected.`,
          link: '/claims',
          ref_id: cd.id,
          created_at: now,
          read_at: null,
        })
      }
    }
    // Mark item resolved
    batch.update(doc(db, 'items', claim.item_id), { status: 'resolved', updated_at: now })

    // Clean up matches for this item
    const mq1 = query(collection(db, 'matches'), where('lost_item_id', '==', claim.item_id))
    const mq2 = query(collection(db, 'matches'), where('found_item_id', '==', claim.item_id))
    const [ms1, ms2] = await Promise.all([getDocs(mq1), getDocs(mq2)])
    for (const md of [...ms1.docs, ...ms2.docs]) batch.delete(md.ref)
  }

  await batch.commit()
}

/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/* ------------------------------------------------------------------ */
export async function listFirebaseNotifications(user, limitCount = 30) {
  if (!user) return []
  try {
    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', user.id),
      orderBy('created_at', 'desc'),
      firestoreLimit(limitCount)
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    try {
      const q = query(collection(db, 'notifications'), where('user_id', '==', user.id))
      const snap = await getDocs(q)
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      return list.slice(0, limitCount)
    } catch {
      return []
    }
  }
}

export async function markFirebaseNotificationsRead(user, ids = null) {
  if (!user) return
  const now = new Date().toISOString()
  try {
    const q = query(collection(db, 'notifications'), where('user_id', '==', user.id))
    const snap = await getDocs(q)
    const batch = writeBatch(db)
    let count = 0
    for (const d of snap.docs) {
      if (!d.data().read_at && (!ids || ids.includes(d.id))) {
        batch.update(d.ref, { read_at: now })
        count++
      }
    }
    if (count > 0) await batch.commit()
  } catch (err) {
    console.warn('Could not mark notifications read', err.message)
  }
}
