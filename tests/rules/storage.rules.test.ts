// Reglas de Storage contra el emulador (con Firestore para leer el perfil del dueño).
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { getBytes, listAll, ref, uploadBytes } from 'firebase/storage'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const OWNER = 'owner'
const PHOTO = `users/${OWNER}/photos/abc.webp`
const png = new Uint8Array([137, 80, 78, 71])
let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})
afterAll(() => env.cleanup())

async function seed(profile: object) {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', OWNER), profile)
    await uploadBytes(ref(ctx.storage(), PHOTO), png, { contentType: 'image/webp' })
  })
}

const storageOf = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage()

describe('fotos', () => {
  beforeEach(() => seed({ sharing: { enabled: false } }))

  it('el dueño sube, lee y lista', async () => {
    const st = storageOf(OWNER)
    await assertSucceeds(uploadBytes(ref(st, `users/${OWNER}/photos/nueva.webp`), png, { contentType: 'image/webp' }))
    await assertSucceeds(getBytes(ref(st, PHOTO)))
    await assertSucceeds(listAll(ref(st, `users/${OWNER}/photos`)))
  })

  it('solo imágenes', async () => {
    await assertFails(uploadBytes(ref(storageOf(OWNER), `users/${OWNER}/photos/x.txt`), png, { contentType: 'text/plain' }))
  })

  it('privado: nadie más lee ni sube', async () => {
    await assertFails(getBytes(ref(storageOf(null), PHOTO)))
    await assertFails(uploadBytes(ref(storageOf('otro'), `users/${OWNER}/photos/x.webp`), png, { contentType: 'image/webp' }))
  })

  it('con link activo: se lee por ruta, pero no se lista', async () => {
    await seed({ sharing: { enabled: true } })
    await assertSucceeds(getBytes(ref(storageOf(null), PHOTO)))
    await assertFails(listAll(ref(storageOf(null), `users/${OWNER}/photos`)))
  })

  it('con un viaje compartido: igual', async () => {
    await seed({ sharing: { enabled: false }, sharedTrips: ['t'] })
    await assertSucceeds(getBytes(ref(storageOf(null), PHOTO)))
  })
})
