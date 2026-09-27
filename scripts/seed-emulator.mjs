// Siembra entradas de ejemplo en el emulador de Firestore para el primer usuario del emulador de Auth.
// Uso: node scripts/seed-emulator.mjs   (con `npm run emulators` corriendo)
import fs from 'node:fs'

const PROJECT = 'demo-worldmap'
const AUTH = `http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' } // salta las reglas en el emulador

const users = await fetch(AUTH, { method: 'POST', headers: OWNER, body: '{}' }).then((r) => r.json())
const uid = users.userInfo?.[0]?.localId
if (!uid) throw new Error('No hay usuarios en el emulador: crea una cuenta desde la app primero.')

const cities = JSON.parse(fs.readFileSync(new URL('../public/data/cities.json', import.meta.url)))
const landmarks = JSON.parse(fs.readFileSync(new URL('../public/data/landmarks.json', import.meta.url)))
const city = (name, country) => cities.find((c) => c[1] === name && c[2] === country)
const landmark = (id) => landmarks.find((l) => l[0] === id)

// [tipo, nombre|id, país, estado, [[inicio, fin]], etiquetas]
const SEED = [
  ['city', 'Madrid', 'ESP', 'visited', [['2019-06-02', '2019-06-06']], ['trabajo']],
  ['city', 'París', 'FRA', 'visited', [['2019-06-07', '2019-06-10']], ['museos']],
  ['city', 'Roma', 'ITA', 'visited', [['2019-06-11', '2019-06-14']], []],
  ['landmark', 'wonder-3', 'ITA', 'visited', [['2019-06-12', '2019-06-12']], []],
  ['city', 'Tokio', 'JPN', 'visited', [['2022-04-01', '2022-04-09']], ['comida']],
  ['city', 'Kioto', 'JPN', 'visited', [['2022-04-10', '2022-04-13']], ['templos']],
  ['city', 'Nueva York', 'USA', 'visited', [['2023-09-15', '2023-09-20']], []],
  ['city', 'Ciudad de México', 'MEX', 'visited', [['2023-11-01', '2023-11-05']], ['comida']],
  ['landmark', 'wonder-1', 'MEX', 'visited', [['2023-11-06', '2023-11-06']], []],
  ['city', 'Lima', 'PER', 'visited', [['2024-07-10', '2024-07-12']], []],
  ['landmark', 'wonder-5', 'PER', 'visited', [['2024-07-14', '2024-07-15']], ['montaña']],
  ['city', 'Ciudad de Panamá', 'PAN', 'transit', [['2024-07-10', '2024-07-10']], []],
  ['city', 'Bogotá', 'COL', 'wishlist', [], []],
]

const value = (v) =>
  v === null ? { nullValue: null }
  : Array.isArray(v) ? { arrayValue: { values: v.map(value) } }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } }
  : { stringValue: String(v) }

let n = 0
for (const [type, ref, country, status, dates, tags] of SEED) {
  const row = type === 'city' ? city(ref, country) : landmark(ref)
  if (!row) {
    console.warn('No encontrado:', ref)
    continue
  }
  const placeId = String(row[0])
  const key = `${type}:${placeId}`
  const now = Date.now()
  const entry = {
    key, type, placeId, name: row[1], countryId: row[2], regionId: row[3], lon: row[4], lat: row[5], status,
    dates: dates.map(([start, end]) => ({ start, end, tripId: null })),
    description: '', tags, rating: null, people: '', photoPath: null, percentOverride: null,
    priority: status === 'wishlist' ? 1 : null, createdAt: now, updatedAt: now,
  }
  const res = await fetch(`${FS}/users/${uid}/entries/${encodeURIComponent(encodeURIComponent(key))}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(entry).map(([k, v]) => [k, value(v)])) }),
  })
  if (!res.ok) throw new Error(`${key}: ${res.status} ${await res.text()}`)
  n++
}
console.log(`Sembradas ${n} entradas para ${uid.slice(0, 6)}…`)
