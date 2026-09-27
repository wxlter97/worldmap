// Buscador sobre el nomenclátor mundial (países, regiones, ciudades, lugares) y lugares propios.
import Fuse from 'fuse.js'
import { loadCities, loadLandmarks, type Geo } from './geo'
import type { Entry, PlaceType } from './model'

export interface Place {
  type: PlaceType
  id: string
  name: string
  countryId: string
  regionId: string | null
  lon: number | null
  lat: number | null
  population?: number
  source?: 'unesco' | 'wonder'
}

interface Indexed extends Place {
  norm: string
  weight: number // desempate: más grande/relevante primero
}

export const normalize = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

// Países > lugares emblemáticos > ciudades (por población) > regiones (por área).
const TYPE_WEIGHT: Record<PlaceType, number> = { country: 4e9, landmark: 3e9, custom: 2e9, city: 1e5, region: 0 }

let indexPromise: Promise<{ items: Indexed[]; fuzzy: Fuse<Indexed> }> | null = null

export function buildIndex(geo: Geo) {
  indexPromise ??= Promise.all([loadCities(), loadLandmarks()]).then(([cities, landmarks]) => {
    const items: Indexed[] = []
    const add = (p: Place, weight: number) => items.push({ ...p, norm: normalize(p.name), weight })
    for (const c of Object.values(geo.countries)) {
      add({ type: 'country', id: c.id, name: c.name, countryId: c.id, regionId: null, lon: c.center[0], lat: c.center[1] }, TYPE_WEIGHT.country)
      if (c.nameEn !== c.name) add({ type: 'country', id: c.id, name: c.nameEn, countryId: c.id, regionId: null, lon: c.center[0], lat: c.center[1] }, TYPE_WEIGHT.country - 1)
    }
    for (const r of Object.values(geo.regions)) {
      add({ type: 'region', id: r.id, name: r.name, countryId: r.country, regionId: r.id, lon: null, lat: null }, TYPE_WEIGHT.region + r.areaKm2 / 100)
    }
    for (const [id, name, countryId, regionId, lon, lat, population] of cities) {
      add({ type: 'city', id: String(id), name, countryId, regionId, lon, lat, population }, TYPE_WEIGHT.city + population)
    }
    for (const [id, name, countryId, regionId, lon, lat, source] of landmarks) {
      add({ type: 'landmark', id, name, countryId, regionId, lon, lat, source }, TYPE_WEIGHT.landmark)
    }
    // Búsqueda tolerante a errores solo sobre el conjunto pequeño (países + lugares).
    const fuzzy = new Fuse(
      items.filter((i) => i.type === 'country' || i.type === 'landmark'),
      { keys: ['norm'], threshold: 0.35, ignoreLocation: true },
    )
    return { items, fuzzy }
  })
  indexPromise.catch(() => {
    indexPromise = null // permite reintentar si falló la descarga
  })
  return indexPromise
}

export interface SearchOptions {
  types?: ReadonlySet<PlaceType>
  countryId?: string | null
  limit?: number
}

/** Coincidencia exacta > empieza por > palabra empieza por > contiene; luego por relevancia. */
export async function searchPlaces(geo: Geo, query: string, opts: SearchOptions = {}): Promise<Place[]> {
  const q = normalize(query)
  if (q.length < 2) return []
  const { items, fuzzy } = await buildIndex(geo)
  const limit = opts.limit ?? 30
  const keep = (i: Place) => (!opts.types || opts.types.has(i.type)) && (!opts.countryId || i.countryId === opts.countryId)

  const scored: { item: Indexed; score: number }[] = []
  for (const item of items) {
    if (!keep(item)) continue
    const n = item.norm
    let rank = -1
    if (n === q) rank = 3
    else if (n.startsWith(q)) rank = 2
    else if (n.includes(' ' + q) || n.includes('-' + q)) rank = 1
    else if (n.includes(q)) rank = 0
    if (rank >= 0) scored.push({ item, score: rank * 1e10 + item.weight })
  }
  scored.sort((a, b) => b.score - a.score)

  const seen = new Set<string>()
  const out: Place[] = []
  const push = (i: Indexed) => {
    const k = `${i.type}:${i.id}`
    if (seen.has(k)) return
    seen.add(k)
    const { norm: _norm, weight: _weight, ...place } = i
    out.push(place)
  }
  for (const { item } of scored) {
    if (out.length >= limit) break
    push(item)
  }
  if (out.length < 5) for (const r of fuzzy.search(q, { limit: 10 })) if (keep(r.item)) push(r.item)
  return out
}

/** Filtra las entradas propias del usuario por texto (nombre, descripción, etiquetas, personas). */
export function searchEntries(entries: Entry[], query: string): Entry[] {
  const q = normalize(query)
  if (!q) return entries
  return entries.filter((e) =>
    [e.name, e.description, e.people, ...e.tags].some((f) => normalize(f ?? '').includes(q)),
  )
}
