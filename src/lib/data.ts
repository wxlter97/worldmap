// Lectura/escritura de entradas y viajes en Firestore.
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
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

/** Borra el viaje y quita su referencia de las fechas que lo usaban (las fechas se conservan). */
export function deleteTrip(uid: string, id: string, entries: Entry[]) {
  const batch = writeBatch(db)
  for (const e of entries) {
    if (!e.dates.some((d) => d.tripId === id)) continue
    const dates = e.dates.map((d) => (d.tripId === id ? { ...d, tripId: null } : d))
    batch.set(doc(entriesCol(uid), docId(e.key)), { ...e, dates, updatedAt: Date.now() })
  }
  batch.delete(doc(tripsCol(uid), id))
  return batch.commit()
}

export function newTrip(name: string): Trip {
  const now = Date.now()
  return { id: crypto.randomUUID(), name, description: '', createdAt: now, updatedAt: now }
}

// --- Perfil y links compartidos ---
// users/{uid} es legible por cualquiera cuando sharing.enabled = true: no guardar ahí datos privados.

export interface Profile {
  displayName: string
  sharing: { enabled: boolean; token: string | null }
}

const DEFAULT_PROFILE: Profile = { displayName: '', sharing: { enabled: false, token: null } }

export async function ensureProfile(uid: string) {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref).catch(() => null)
  if (snap && !snap.exists()) await setDoc(ref, { ...DEFAULT_PROFILE, createdAt: serverTimestamp() }, { merge: true })
}

export function useProfile(uid: string | null): Profile {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)
  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => setProfile({ ...DEFAULT_PROFILE, ...(snap.data() as Partial<Profile> | undefined) }),
      () => setProfile(DEFAULT_PROFILE),
    )
  }, [uid])
  return profile
}

export function saveDisplayName(uid: string, displayName: string, current: Profile) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'users', uid), { displayName }, { merge: true })
  if (current.sharing.enabled && current.sharing.token) batch.set(doc(db, 'shares', current.sharing.token), { displayName }, { merge: true })
  return batch.commit()
}

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Activa el link (o lo regenera: el anterior deja de funcionar). */
export async function enableSharing(uid: string, current: Profile) {
  const token = randomToken()
  const batch = writeBatch(db)
  if (current.sharing.token) batch.delete(doc(db, 'shares', current.sharing.token))
  batch.set(doc(db, 'shares', token), { uid, displayName: current.displayName, createdAt: serverTimestamp() })
  // email: perfiles creados antes de v0.2 lo guardaban; se elimina antes de hacerlo público.
  batch.set(doc(db, 'users', uid), { sharing: { enabled: true, token }, email: deleteField() }, { merge: true })
  await batch.commit()
  return token
}

export async function disableSharing(uid: string, current: Profile) {
  const batch = writeBatch(db)
  if (current.sharing.token) batch.delete(doc(db, 'shares', current.sharing.token))
  batch.set(doc(db, 'users', uid), { sharing: { enabled: false, token: null } }, { merge: true })
  await batch.commit()
}

/** Resuelve un token de link compartido al uid del dueño. */
export async function resolveShare(token: string): Promise<{ uid: string; displayName: string } | null> {
  const snap = await getDoc(doc(db, 'shares', token))
  return snap.exists() ? (snap.data() as { uid: string; displayName: string }) : null
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
