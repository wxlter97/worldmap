// Reglas de Firestore contra el emulador (npm run test:rules arranca el emulador y ejecuta esto).
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const OWNER = 'owner'
const TRIP = 'trip-1'
let env: RulesTestEnvironment

const entry = (key: string, tripIds: string[] = []) => ({ key, status: 'visited', tripIds, name: key, dates: [] })

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())

async function seed(profile: object) {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', OWNER), profile)
    await setDoc(doc(db, 'users', OWNER, 'entries', 'city%3A1'), entry('city:1', [TRIP]))
    await setDoc(doc(db, 'users', OWNER, 'entries', 'city%3A2'), entry('city:2'))
    await setDoc(doc(db, 'users', OWNER, 'notes', 'city%3A1'), { description: 'secreto', people: 'Ana' })
    await setDoc(doc(db, 'users', OWNER, 'notes', 'city%3A2'), { description: 'otro', people: '' })
    await setDoc(doc(db, 'users', OWNER, 'trips', TRIP), { name: 'Viaje' })
    await setDoc(doc(db, 'users', OWNER, 'trips', 'trip-2'), { name: 'Otro' })
    await setDoc(doc(db, 'shares', 'tok'), { uid: OWNER, displayName: 'W' })
  })
}

const anon = () => env.unauthenticatedContext().firestore()
const owner = () => env.authenticatedContext(OWNER).firestore()
const stranger = () => env.authenticatedContext('otro').firestore()

describe('privado (sin links)', () => {
  beforeEach(() => seed({ sharing: { enabled: false } }))

  it('el dueño lee y escribe todo', async () => {
    await assertSucceeds(getDocs(collection(owner(), 'users', OWNER, 'entries')))
    await assertSucceeds(getDocs(collection(owner(), 'users', OWNER, 'notes')))
    await assertSucceeds(setDoc(doc(owner(), 'users', OWNER, 'entries', 'x'), entry('x')))
    await assertSucceeds(setDoc(doc(owner(), 'users', OWNER, 'notes', 'x'), { description: 'hola', people: '' }))
    await assertSucceeds(deleteDoc(doc(owner(), 'users', OWNER, 'entries', 'x')))
  })

  it('nadie más lee nada', async () => {
    for (const db of [anon(), stranger()]) {
      await assertFails(getDoc(doc(db, 'users', OWNER)))
      await assertFails(getDocs(collection(db, 'users', OWNER, 'entries')))
      await assertFails(getDoc(doc(db, 'users', OWNER, 'trips', TRIP)))
      await assertFails(getDoc(doc(db, 'users', OWNER, 'notes', 'city%3A1')))
    }
  })

  it('nadie más escribe', async () => {
    await assertFails(setDoc(doc(stranger(), 'users', OWNER, 'entries', 'x'), entry('x')))
    await assertFails(setDoc(doc(anon(), 'users', OWNER), { sharing: { enabled: true } }))
  })

  it('valida estado y tamaño de notas', async () => {
    await assertFails(setDoc(doc(owner(), 'users', OWNER, 'entries', 'x'), { ...entry('x'), status: 'volado' }))
    await assertFails(setDoc(doc(owner(), 'users', OWNER, 'notes', 'x'), { description: 'a'.repeat(20001), people: '' }))
  })

  it('shares: get público, list prohibido', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'shares', 'tok')))
    await assertFails(getDocs(collection(anon(), 'shares')))
    await assertFails(setDoc(doc(stranger(), 'shares', 'nuevo'), { uid: OWNER }))
  })
})

describe('link del mapa completo', () => {
  it('sin «mostrar notas»: lee mapa pero no notas', async () => {
    await seed({ sharing: { enabled: true, showNotes: false } })
    await assertSucceeds(getDoc(doc(anon(), 'users', OWNER)))
    await assertSucceeds(getDocs(collection(anon(), 'users', OWNER, 'entries')))
    await assertSucceeds(getDocs(collection(anon(), 'users', OWNER, 'trips')))
    await assertFails(getDocs(collection(anon(), 'users', OWNER, 'notes')))
    await assertFails(getDoc(doc(anon(), 'users', OWNER, 'notes', 'city%3A1')))
  })

  it('con «mostrar notas»: también notas', async () => {
    await seed({ sharing: { enabled: true, showNotes: true } })
    await assertSucceeds(getDocs(collection(anon(), 'users', OWNER, 'notes')))
  })
})

describe('link de un viaje', () => {
  it('solo las entradas y el viaje compartido', async () => {
    await seed({ sharing: { enabled: false }, sharedTrips: [TRIP] })
    const db = anon()
    await assertSucceeds(getDocs(query(collection(db, 'users', OWNER, 'entries'), where('tripIds', 'array-contains', TRIP))))
    await assertSucceeds(getDoc(doc(db, 'users', OWNER, 'entries', 'city%3A1')))
    await assertFails(getDoc(doc(db, 'users', OWNER, 'entries', 'city%3A2')))
    await assertFails(getDocs(collection(db, 'users', OWNER, 'entries')))
    await assertSucceeds(getDoc(doc(db, 'users', OWNER, 'trips', TRIP)))
    await assertFails(getDoc(doc(db, 'users', OWNER, 'trips', 'trip-2')))
    await assertFails(getDoc(doc(db, 'users', OWNER)))
    await assertFails(getDoc(doc(db, 'users', OWNER, 'notes', 'city%3A1')))
  })

  it('con «mostrar notas»: notas solo de entradas del viaje', async () => {
    await seed({ sharing: { enabled: false, showNotes: true }, sharedTrips: [TRIP] })
    await assertSucceeds(getDoc(doc(anon(), 'users', OWNER, 'notes', 'city%3A1')))
    await assertFails(getDoc(doc(anon(), 'users', OWNER, 'notes', 'city%3A2')))
  })

  it('al dejar de compartir, se corta', async () => {
    await seed({ sharing: { enabled: false }, sharedTrips: [] })
    await assertFails(getDoc(doc(anon(), 'users', OWNER, 'entries', 'city%3A1')))
    await assertFails(getDoc(doc(anon(), 'users', OWNER, 'trips', TRIP)))
  })
})
