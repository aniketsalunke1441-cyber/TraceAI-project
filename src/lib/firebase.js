/**
 * Firebase Client Configuration & Initialization
 * -----------------------------------------------
 * Initializes Firebase App, Authentication, Cloud Firestore, and Cloud Storage.
 *
 * If Firebase environment variables are not set in .env, isFirebaseConfigured is false,
 * allowing FindBack to run cleanly in demo mode without errors.
 */
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId &&
  !firebaseConfig.apiKey.includes('YOUR_') &&
  !firebaseConfig.projectId.includes('YOUR_')
)

export const app = isFirebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null

export const auth = isFirebaseConfigured ? getAuth(app) : null
export const db = isFirebaseConfigured ? getFirestore(app) : null
export const storage = isFirebaseConfigured ? getStorage(app) : null
export const IMAGE_FOLDER = 'item-images'
