// Datos públicos de un link compartido, leídos con la API REST de Firestore (sin credenciales:
// las reglas permiten leer shares/{token} y, si el link está activo, las entradas del dueño).

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'map-wxlter-dev'
const API_KEY = process.env.FIREBASE_API_KEY ?? 'AIzaSyAtEpTUf67NGnyc_vVGUivBeGquW_RLQ3s'
// Para pruebas locales contra el emulador: FIRESTORE_REST_BASE=http://localhost:8080/v1/projects/demo-worldmap/databases/(default)/documents
const BASE = process.env.FIRESTORE_REST_BASE ?? `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

type FsValue = { stringValue?: string; arrayValue?: { values?: FsValue[] } }
type FsDoc = { name: string; fields?: Record<string, FsValue> }

const str = (v?: FsValue) => v?.stringValue ?? ''
const withKey = (url: string) => (process.env.FIRESTORE_REST_BASE ? url : `${url}${url.includes('?') ? '&' : '?'}key=${API_KEY}`)

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(withKey(url), init)
  return res.ok ? ((await res.json()) as T) : null
}

export interface ShareSummary {
  displayName: string
  tripName: string | null
  countryIds: string[] // Vivido o Visitado
  places: number
}

const BEEN = new Set(['lived', 'visited'])

export async function loadShare(token: string): Promise<ShareSummary | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return null
  const share = await getJson<FsDoc>(`${BASE}/shares/${token}`)
  if (!share?.fields) return null
  const uid = str(share.fields.uid)
  const tripId = str(share.fields.tripId) || null
  const displayName = str(share.fields.displayName)

  let docs: FsDoc[] = []
  if (tripId) {
    const rows = await getJson<{ document?: FsDoc }[]>(`${BASE}/users/${uid}:runQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'entries' }],
          where: { fieldFilter: { field: { fieldPath: 'tripIds' }, op: 'ARRAY_CONTAINS', value: { stringValue: tripId } } },
        },
      }),
    })
    docs = (rows ?? []).flatMap((r) => (r.document ? [r.document] : []))
  } else {
    let pageToken = ''
    do {
      const page = await getJson<{ documents?: FsDoc[]; nextPageToken?: string }>(
        `${BASE}/users/${uid}/entries?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`,
      )
      if (!page) return null // link desactivado: las reglas niegan la lectura
      docs.push(...(page.documents ?? []))
      pageToken = page.nextPageToken ?? ''
    } while (pageToken)
  }

  let tripName: string | null = null
  if (tripId) {
    const trip = await getJson<FsDoc>(`${BASE}/users/${uid}/trips/${tripId}`)
    tripName = str(trip?.fields?.name) || null
  }

  const countryIds = new Set<string>()
  let places = 0
  for (const d of docs) {
    const f = d.fields ?? {}
    if (!BEEN.has(str(f.status))) continue
    countryIds.add(str(f.countryId))
    if (str(f.type) !== 'country' && str(f.type) !== 'region') places++
  }
  return { displayName, tripName, countryIds: [...countryIds], places }
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
