// Lectura/escritura de entradas y viajes en Firestore.
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { useEffect, useMemo, useState } from 'react'
import { db, storage } from './firebase'
import type { Entry, Trip } from './model'
import { isBarePlanned, stopKey, type TripPlan } from './plan'

const entriesCol = (uid: string) => collection(db, 'users', uid, 'entries')
const notesCol = (uid: string) => collection(db, 'users', uid, 'notes')
const tripsCol = (uid: string) => collection(db, 'users', uid, 'trips')
// Planes de viaje: privados (reservas, presupuesto), solo los lee el dueño.
const plansCol = (uid: string) => collection(db, 'users', uid, 'plans')
// "city:123" es un id de documento válido; se codifica por si algún id trae "/".
export const docId = (key: string) => encodeURIComponent(key)

// Descripción y personas viven aparte (users/{uid}/notes/{key}): las reglas las ocultan en los links
// compartidos salvo que el dueño active «Mostrar notas».
interface Note {
  description: string
  people: string
}

export interface UserData {
  entries: Entry[]
  trips: Trip[]
  plans: Map<string, TripPlan> // tripId → plan (vacío en links compartidos)
  loading: boolean
  error: string | null
  pendingWrites: boolean // cambios guardados en el dispositivo que aún no llegan al servidor
}

/**
 * Suscripción en vivo a las entradas y viajes de un usuario.
 * - Dueño o link del mapa completo: todas las entradas; las notas si las reglas lo permiten.
 * - Link de un viaje (`tripId`): solo las entradas y el viaje compartido.
 */
export function useUserData(uid: string | null, tripId: string | null = null, owner = true): UserData {
  const [state, setState] = useState<Omit<UserData, 'plans'>>({ entries: [], trips: [], loading: true, error: null, pendingWrites: false })
  const [plans, setPlans] = useState<Map<string, TripPlan>>(new Map())
  const [rawEntries, setRawEntries] = useState<Entry[]>([])
  const [notes, setNotes] = useState<Map<string, Note>>(new Map())

  useEffect(() => {
    if (!uid) {
      setState({ entries: [], trips: [], loading: false, error: null, pendingWrites: false })
      return
    }
    const onError = (e: Error) => setState((s) => ({ ...s, loading: false, error: e.message }))
    const entriesQuery = tripId ? query(entriesCol(uid), where('tripIds', 'array-contains', tripId)) : entriesCol(uid)
    const unsubEntries = onSnapshot(
      entriesQuery,
      { includeMetadataChanges: true },
      (snap) => {
        // Los cambios solo de metadatos (p. ej. «ya sincronizado») no re-renderizan la lista.
        if (snap.docChanges().length) setRawEntries(snap.docs.map((d) => d.data() as Entry))
        setState((s) => ({ ...s, loading: false, pendingWrites: snap.metadata.hasPendingWrites }))
      },
      onError,
    )
    const unsubTrips = tripId
      ? onSnapshot(
          doc(tripsCol(uid), tripId),
          (d) => setState((s) => ({ ...s, trips: d.exists() ? [{ ...(d.data() as Trip), id: d.id }] : [] })),
          onError,
        )
      : onSnapshot(tripsCol(uid), (snap) => setState((s) => ({ ...s, trips: snap.docs.map((d) => ({ ...(d.data() as Trip), id: d.id })) })), onError)
    // Notas: si las reglas no las permiten (link sin «Mostrar notas»), simplemente no llegan.
    const unsubNotes = tripId
      ? () => undefined
      : onSnapshot(
          notesCol(uid),
          (snap) => setNotes(new Map(snap.docs.map((d) => [decodeURIComponent(d.id), d.data() as Note]))),
          () => setNotes(new Map()),
        )
    // Planes: privados, solo para el dueño (las reglas no los dejan leer en links compartidos).
    const unsubPlans = owner
      ? onSnapshot(
          plansCol(uid),
          (snap) => setPlans(new Map(snap.docs.map((d) => [d.id, { ...(d.data() as TripPlan), tripId: d.id }]))),
          () => setPlans(new Map()),
        )
      : () => undefined
    return () => {
      unsubEntries()
      unsubTrips()
      unsubNotes()
      unsubPlans()
    }
  }, [uid, tripId, owner])

  // Link de un viaje: las notas se piden una a una (las reglas comprueban que la entrada sea del viaje).
  const keysSig = tripId ? rawEntries.map((e) => e.key).sort().join('|') : ''
  useEffect(() => {
    if (!uid || !tripId || !keysSig) return
    let cancelled = false
    Promise.all(
      keysSig.split('|').map((key) =>
        getDoc(doc(notesCol(uid), docId(key))).then((d) => (d.exists() ? ([key, d.data() as Note] as const) : null), () => null),
      ),
    ).then((pairs) => !cancelled && setNotes(new Map(pairs.filter((p) => p !== null))))
    return () => {
      cancelled = true
    }
  }, [uid, tripId, keysSig])

  const entries = useMemo(
    () =>
      rawEntries.map((e) => {
        const n = notes.get(e.key)
        // Entradas antiguas guardaban la descripción en el propio documento.
        return { ...e, description: n?.description ?? e.description ?? '', people: n?.people ?? e.people ?? '' }
      }),
    [rawEntries, notes],
  )

  return useMemo(() => ({ ...state, entries, plans }), [state, entries, plans])
}

/** Documento de entrada sin campos privados y con `tripIds` derivado de las fechas. */
function entryDoc(entry: Entry) {
  const { description: _d, people: _p, ...rest } = entry
  const tripIds = [...new Set(entry.dates.map((d) => d.tripId).filter((t): t is string => !!t))]
  return { ...rest, tripIds, updatedAt: Date.now() }
}

/** Añade al lote la escritura de la entrada y de sus notas (o su borrado si quedan vacías). */
export function writeEntry(batch: WriteBatch, uid: string, entry: Entry) {
  batch.set(doc(entriesCol(uid), docId(entry.key)), entryDoc(entry))
  const noteRef = doc(notesCol(uid), docId(entry.key))
  if (entry.description || entry.people) batch.set(noteRef, { description: entry.description ?? '', people: entry.people ?? '' })
  else batch.delete(noteRef)
}

// Las escrituras no se esperan: con la caché offline se aplican localmente al instante
// y se sincronizan cuando hay conexión.
export function saveEntry(uid: string, entry: Entry) {
  const batch = writeBatch(db)
  writeEntry(batch, uid, entry)
  return batch.commit()
}

export function deleteEntry(uid: string, key: string) {
  const batch = writeBatch(db)
  batch.delete(doc(entriesCol(uid), docId(key)))
  batch.delete(doc(notesCol(uid), docId(key)))
  return batch.commit()
}

export function saveTrip(uid: string, trip: Trip) {
  return setDoc(doc(tripsCol(uid), trip.id), { ...trip, updatedAt: Date.now() })
}

/**
 * Borra el viaje y quita su referencia de las fechas que lo usaban (las fechas se conservan).
 * Las paradas de su plan que solo existían como «Planeado» vacío también se borran.
 */
export function deleteTrip(uid: string, id: string, entries: Entry[], plans: Map<string, TripPlan> = new Map()) {
  const batch = writeBatch(db)
  const others = new Set([...plans.values()].filter((p) => p.tripId !== id).flatMap((p) => p.stops.map(stopKey)))
  const byKey = new Map(entries.map((e) => [e.key, e]))
  for (const key of new Set(plans.get(id)?.stops.map(stopKey) ?? [])) {
    const e = byKey.get(key)
    if (e && isBarePlanned(e) && !others.has(key)) {
      batch.delete(doc(entriesCol(uid), docId(key)))
      batch.delete(doc(notesCol(uid), docId(key)))
    }
  }
  for (const e of entries) {
    if (!e.dates.some((d) => d.tripId === id)) continue
    writeEntry(batch, uid, { ...e, dates: e.dates.map((d) => (d.tripId === id ? { ...d, tripId: null } : d)) })
  }
  batch.delete(doc(tripsCol(uid), id))
  batch.delete(doc(plansCol(uid), id))
  batch.set(doc(db, 'users', uid), { sharedTrips: arrayRemove(id), tripShares: { [id]: deleteField() } }, { merge: true })
  return batch.commit()
}

export function savePlan(uid: string, plan: TripPlan) {
  return setDoc(doc(plansCol(uid), plan.tripId), { ...plan, updatedAt: Date.now() })
}

/**
 * Guarda el plan y sincroniza el mapa: las paradas nuevas sin entrada se marcan «Planeado»;
 * las quitadas se borran si eran una entrada «Planeado» vacía que ya nadie usa.
 */
export function savePlanWithEntries(uid: string, plan: TripPlan, previous: TripPlan | null, entries: Entry[], allPlans: Map<string, TripPlan>, created: Entry[] = []) {
  const batch = writeBatch(db)
  batch.set(doc(plansCol(uid), plan.tripId), { ...plan, updatedAt: Date.now() })
  const byKey = new Map(entries.map((e) => [e.key, e]))
  for (const e of created) if (!byKey.has(e.key)) writeEntry(batch, uid, e)
  const now = new Set(plan.stops.map(stopKey))
  const inOtherPlans = new Set([...allPlans.values()].filter((p) => p.tripId !== plan.tripId).flatMap((p) => p.stops.map(stopKey)))
  for (const s of previous?.stops ?? []) {
    const key = stopKey(s)
    const e = byKey.get(key)
    if (!now.has(key) && !inOtherPlans.has(key) && e && isBarePlanned(e)) {
      batch.delete(doc(entriesCol(uid), docId(key)))
      batch.delete(doc(notesCol(uid), docId(key)))
    }
  }
  return batch.commit()
}

/** Cierre del viaje: escribe las entradas visitadas y marca el plan como resuelto. */
export function closePlan(uid: string, plan: TripPlan, visited: Entry[]) {
  const batch = writeBatch(db)
  for (const e of visited) writeEntry(batch, uid, e)
  batch.set(doc(plansCol(uid), plan.tripId), { ...plan, closed: true, updatedAt: Date.now() })
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
  sharing: { enabled: boolean; token: string | null; showNotes?: boolean }
  sharedTrips?: string[] // ids de viajes con link propio (las reglas los leen)
  tripShares?: Record<string, string> // tripId → token
}

const DEFAULT_PROFILE: Profile = { displayName: '', sharing: { enabled: false, token: null, showNotes: false } }

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
  for (const token of Object.values(current.tripShares ?? {})) batch.set(doc(db, 'shares', token), { displayName }, { merge: true })
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
  batch.set(doc(db, 'users', uid), { sharing: { enabled: true, token, showNotes: current.sharing.showNotes ?? false }, email: deleteField() }, { merge: true })
  await batch.commit()
  return token
}

export async function disableSharing(uid: string, current: Profile) {
  const batch = writeBatch(db)
  if (current.sharing.token) batch.delete(doc(db, 'shares', current.sharing.token))
  batch.set(doc(db, 'users', uid), { sharing: { enabled: false, token: null, showNotes: current.sharing.showNotes ?? false } }, { merge: true })
  await batch.commit()
}

/** Mostrar u ocultar descripciones y personas en todos los links (mapa y viajes). */
export function setShowNotes(uid: string, showNotes: boolean) {
  return setDoc(doc(db, 'users', uid), { sharing: { showNotes } }, { merge: true })
}

/** Link de solo lectura de un viaje. Reescribe las entradas del viaje para asegurar su `tripIds`. */
export async function enableTripShare(uid: string, trip: Trip, entries: Entry[], current: Profile) {
  const token = randomToken()
  const batch = writeBatch(db)
  const old = current.tripShares?.[trip.id]
  if (old) batch.delete(doc(db, 'shares', old))
  batch.set(doc(db, 'shares', token), { uid, tripId: trip.id, displayName: current.displayName, createdAt: serverTimestamp() })
  batch.set(doc(db, 'users', uid), { sharedTrips: arrayUnion(trip.id), tripShares: { [trip.id]: token }, email: deleteField() }, { merge: true })
  for (const e of entries) if (e.dates.some((d) => d.tripId === trip.id)) writeEntry(batch, uid, e)
  await batch.commit()
  return token
}

export async function disableTripShare(uid: string, tripId: string, current: Profile) {
  const batch = writeBatch(db)
  const token = current.tripShares?.[tripId]
  if (token) batch.delete(doc(db, 'shares', token))
  batch.set(doc(db, 'users', uid), { sharedTrips: arrayRemove(tripId), tripShares: { [tripId]: deleteField() } }, { merge: true })
  await batch.commit()
}

/** Resuelve un token de link compartido al uid del dueño. */
export interface ShareInfo {
  uid: string
  displayName: string
  tripId?: string
}

export async function resolveShare(token: string): Promise<ShareInfo | null> {
  const snap = await getDoc(doc(db, 'shares', token))
  return snap.exists() ? (snap.data() as ShareInfo) : null
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
