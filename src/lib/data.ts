// Lectura/escritura de entradas y viajes en Firestore.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { useEffect, useState } from 'react'
import { db, storage } from './firebase'
import type { Entry, Trip } from './model'

const entriesCol = (uid: string) => collection(db, 'users', uid, 'entries')
const tripsCol = (uid: string) => collection(db, 'users', uid, 'trips')
// "city:123" es un id de documento válido; se codifica por si algún id trae "/".
const docId = (key: string) => encodeURIComponent(key)

export interface UserData {
  entries: Entry[]
  trips: Trip[]
  loading: boolean
  error: string | null
}

/** Suscripción en vivo a las entradas y viajes de un usuario (propio o compartido). */
export function useUserData(uid: string | null): UserData {
  const [state, setState] = useState<UserData>({ entries: [], trips: [], loading: true, error: null })

  useEffect(() => {
    if (!uid) {
      setState({ entries: [], trips: [], loading: false, error: null })
      return
    }
    const onError = (e: Error) => setState((s) => ({ ...s, loading: false, error: e.message }))
    const unsubEntries = onSnapshot(
      entriesCol(uid),
      (snap) => setState((s) => ({ ...s, entries: snap.docs.map((d) => d.data() as Entry), loading: false })),
      onError,
    )
    const unsubTrips = onSnapshot(
      tripsCol(uid),
      (snap) => setState((s) => ({ ...s, trips: snap.docs.map((d) => ({ ...(d.data() as Trip), id: d.id })) })),
      onError,
    )
    return () => {
      unsubEntries()
      unsubTrips()
    }
  }, [uid])

  return state
}

// Las escrituras no se esperan: con la caché offline se aplican localmente al instante
// y se sincronizan cuando hay conexión.
export function saveEntry(uid: string, entry: Entry) {
  return setDoc(doc(entriesCol(uid), docId(entry.key)), { ...entry, updatedAt: Date.now() })
}

export function deleteEntry(uid: string, key: string) {
  return deleteDoc(doc(entriesCol(uid), docId(key)))
}

export function saveTrip(uid: string, trip: Trip) {
  return setDoc(doc(tripsCol(uid), trip.id), { ...trip, updatedAt: Date.now() })
}

export function deleteTrip(uid: string, id: string) {
  return deleteDoc(doc(tripsCol(uid), id))
}

export async function ensureProfile(uid: string, email: string | null) {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref).catch(() => null)
  if (!snap?.exists()) await setDoc(ref, { email, createdAt: serverTimestamp(), sharing: { enabled: false, token: null } }, { merge: true })
}

// --- Fotos ---

/** Reduce la imagen a máx. 2000px y la convierte a WebP antes de subirla. */
async function compress(file: File, maxSide = 2000): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.82 })
}

export async function uploadPhoto(uid: string, file: File): Promise<string> {
  const blob = await compress(file)
  const path = `users/${uid}/photos/${crypto.randomUUID()}.webp`
  await uploadBytes(ref(storage, path), blob, { contentType: 'image/webp' })
  return path
}

export function removePhoto(path: string) {
  return deleteObject(ref(storage, path)).catch(() => undefined)
}

const urlCache = new Map<string, Promise<string>>()
export function photoUrl(path: string) {
  if (!urlCache.has(path)) urlCache.set(path, getDownloadURL(ref(storage, path)))
  return urlCache.get(path)!
}
