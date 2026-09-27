// Carga de los datos geográficos generados por scripts/build-data.mjs (public/data).
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { translated } from './i18n'

export type ContinentId = 'AF' | 'AN' | 'AS' | 'EU' | 'NA' | 'OC' | 'SA'

const CONTINENTS_ES: Record<ContinentId, string> = {
  AF: 'África',
  AN: 'Antártida',
  AS: 'Asia',
  EU: 'Europa',
  NA: 'América del Norte',
  OC: 'Oceanía',
  SA: 'América del Sur',
}

export const CONTINENTS = translated(CONTINENTS_ES)

export interface Country {
  id: string // ISO3
  iso2: string | null
  name: string
  nameEn: string
  kind: 'country' | 'territory'
  sovereign: string | null
  continent: ContinentId
  subregion: string
  capital: string | null
  currency: { code: string; name: string } | null
  phone: string | null
  languages: string[]
  population: number | null
  areaKm2: number | null
  center: [number, number]
  neighbours: string[] // países con frontera terrestre
}

export interface Region {
  id: string
  country: string
  name: string
  type: string | null
  areaKm2: number
}

/** [id, nombre, país, región, lon, lat, población, esCapital] */
export type CityRow = [number, string, string, string | null, number, number, number, 0 | 1]
/** [id, nombre, país, región, lon, lat, fuente] */
export type LandmarkRow = [string, string, string, string | null, number, number, 'unesco' | 'wonder']

export interface Geo {
  countries: Record<string, Country>
  regions: Record<string, Region>
  regionAreaByCountry: Record<string, number>
  shapes: FeatureCollection<Polygon | MultiPolygon, { id: string }>
}

const base = import.meta.env.BASE_URL + 'data/'
const getJson = async <T>(file: string): Promise<T> => {
  const res = await fetch(base + file)
  if (!res.ok) throw new Error(`No se pudo cargar ${file} (${res.status})`)
  return res.json() as Promise<T>
}

let geoPromise: Promise<Geo> | null = null
export function loadGeo(): Promise<Geo> {
  geoPromise ??= Promise.all([
    getJson<Record<string, Country>>('countries.json'),
    getJson<Record<string, Region>>('regions.json'),
    getJson<Geo['shapes']>('countries.geojson'),
  ]).then(([countries, regions, shapes]) => {
    const regionAreaByCountry: Record<string, number> = {}
    for (const r of Object.values(regions)) regionAreaByCountry[r.country] = (regionAreaByCountry[r.country] ?? 0) + r.areaKm2
    return { countries, regions, regionAreaByCountry, shapes }
  })
  return geoPromise
}

let citiesPromise: Promise<CityRow[]> | null = null
export const loadCities = () => (citiesPromise ??= getJson<CityRow[]>('cities.json'))

let landmarksPromise: Promise<LandmarkRow[]> | null = null
export const loadLandmarks = () => (landmarksPromise ??= getJson<LandmarkRow[]>('landmarks.json'))

const admin1Cache = new Map<string, Promise<FeatureCollection<Polygon | MultiPolygon, { id: string; country: string }> | null>>()
export function loadAdmin1(countryId: string) {
  if (!admin1Cache.has(countryId)) {
    admin1Cache.set(countryId, getJson<FeatureCollection<Polygon | MultiPolygon, { id: string; country: string }>>(`admin1/${countryId}.json`).catch(() => null))
  }
  return admin1Cache.get(countryId)!
}

/** [oeste, sur, este, norte] */
export type BBox = [number, number, number, number]

const ringBBox = (ring: number[][]): BBox => {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of ring) {
    if (x < b[0]) b[0] = x
    if (y < b[1]) b[1] = y
    if (x > b[2]) b[2] = x
    if (y > b[3]) b[3] = y
  }
  return b
}

/**
 * Encuadre útil de una forma: la parte más grande y las islas cercanas a ella. Así Francia no incluye
 * la Guayana, EE. UU. no se estira hasta Alaska y nada cruza el antimeridiano (Rusia, Fiyi, Alaska).
 */
export function shapeBBox(geometry: Polygon | MultiPolygon): BBox {
  const parts = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map((p) => {
    const b = ringBBox(p[0])
    return { b, area: (b[2] - b[0]) * (b[3] - b[1]) }
  })
  parts.sort((a, z) => z.area - a.area)
  const main = parts[0].b
  const w = main[2] - main[0]
  const h = main[3] - main[1]
  const near: BBox = [main[0] - w / 2 - 1, main[1] - h / 2 - 1, main[2] + w / 2 + 1, main[3] + h / 2 + 1]
  const out: BBox = [...main]
  for (const { b } of parts.slice(1)) {
    const cx = (b[0] + b[2]) / 2
    const cy = (b[1] + b[3]) / 2
    if (cx < near[0] || cx > near[2] || cy < near[1] || cy > near[3]) continue
    out[0] = Math.min(out[0], b[0])
    out[1] = Math.min(out[1], b[1])
    out[2] = Math.max(out[2], b[2])
    out[3] = Math.max(out[3], b[3])
  }
  return out
}

const countryBBoxes = new WeakMap<Geo, Map<string, BBox>>()
export function countryBBox(geo: Geo, id: string): BBox | null {
  let cache = countryBBoxes.get(geo)
  if (!cache) {
    cache = new Map(geo.shapes.features.map((f) => [f.properties.id, shapeBBox(f.geometry)]))
    countryBBoxes.set(geo, cache)
  }
  return cache.get(id) ?? null
}

export async function regionBBox(countryId: string, regionId: string): Promise<BBox | null> {
  const fc = await loadAdmin1(countryId)
  const f = fc?.features.find((x) => x.properties.id === regionId)
  return f ? shapeBBox(f.geometry) : null
}
