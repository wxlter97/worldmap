import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

const env = import.meta.env
export const usingEmulators = env.VITE_USE_EMULATORS === 'true'

const config = usingEmulators
  ? { apiKey: 'demo-key', projectId: 'demo-worldmap', authDomain: 'localhost', storageBucket: 'demo-worldmap.appspot.com', appId: 'demo' }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      appId: env.VITE_FIREBASE_APP_ID,
    }

export const firebaseConfigured = usingEmulators || Boolean(config.apiKey && config.projectId)

export const app = initializeApp(firebaseConfigured ? config : { apiKey: 'missing', projectId: 'missing', appId: 'missing' })
export const auth = getAuth(app)
// Caché persistente en IndexedDB: la app funciona offline y sincroniza al reconectar.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
})
export const storage = getStorage(app)

if (usingEmulators) {
  const host = location.hostname
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  connectStorageEmulator(storage, host, 9199)
}
