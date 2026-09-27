// Carga de los datos geográficos generados por scripts/build-data.mjs (public/data).
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export type ContinentId = 'AF' | 'AN' | 'AS' | 'EU' | 'NA' | 'OC' | 'SA'

export const CONTINENTS: Record<ContinentId, string> = {
  AF: 'África',
  AN: 'Antártida',
  AS: 'Asia',
  EU: 'Europa',
  NA: 'América del Norte',
  OC: 'Oceanía',
  SA: 'América del Sur',
}

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
