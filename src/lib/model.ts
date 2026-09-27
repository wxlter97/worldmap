// Modelo de datos del usuario y reglas derivadas (estado por país, % visitado).
import type { Country, Geo } from './geo'
import { locale, translated } from './i18n'

export const STATUSES = ['lived', 'visited', 'transit', 'planned', 'wishlist'] as const
export type Status = (typeof STATUSES)[number]

const STATUS_ES: Record<Status, string> = {
  lived: 'Vivido',
  visited: 'Visitado',
  transit: 'Escala',
  planned: 'Planeado',
  wishlist: 'Quiero ir',
}

/** Etiquetas traducidas al idioma activo en cada lectura. */
export const STATUS_LABEL = translated(STATUS_ES)

/** Estados que cuentan como "he estado ahí" para estadísticas y el % del país. */
export const BEEN_STATUSES: ReadonlySet<Status> = new Set(['lived', 'visited'])

/** Prioridad al combinar estados (p. ej. país con ciudades en distintos estados). */
const STATUS_RANK: Record<Status, number> = { lived: 5, visited: 4, transit: 3, planned: 2, wishlist: 1 }

export type PlaceType = 'country' | 'region' | 'city' | 'landmark' | 'custom'

const PLACE_TYPE_ES: Record<PlaceType, string> = {
  country: 'País',
  region: 'Región',
  city: 'Ciudad',
  landmark: 'Lugar',
  custom: 'Lugar propio',
}

export const PLACE_TYPE_LABEL = translated(PLACE_TYPE_ES)

export interface DateRange {
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD (igual a start si es un solo día)
  tripId?: string | null
}

/** Una entrada por lugar: users/{uid}/entries/{key}. */
export interface Entry {
  key: string // "{type}:{id}"
  type: PlaceType
  placeId: string
  name: string // denormalizado para listas y links compartidos
  countryId: string
  regionId: string | null
  lon: number | null
  lat: number | null
  status: Status
  dates: DateRange[]
  description: string // markdown
  tags: string[]
  rating: number | null // 1–5
  people: string
  photoPath: string | null // primera foto (compatibilidad con entradas antiguas)
  photos?: string[] // todas las fotos, en orden; photos[0] === photoPath
  percentOverride: number | null // solo países: % manual
  priority: number | null // solo "quiero ir": 1 (alta) – 3 (baja)
  createdAt: number
  updatedAt: number
}

export interface Trip {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
}

export const entryKey = (type: PlaceType, id: string | number) => `${type}:${id}`

export function emptyEntry(type: PlaceType, placeId: string, fields: Pick<Entry, 'name' | 'countryId' | 'regionId' | 'lon' | 'lat'>): Entry {
  const now = Date.now()
  return {
    key: entryKey(type, placeId),
    type,
    placeId,
    ...fields,
    status: 'visited',
    dates: [],
    description: '',
    tags: [],
    rating: null,
    people: '',
    photoPath: null,
    percentOverride: null,
    priority: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function strongestStatus(statuses: Iterable<Status>): Status | null {
  let best: Status | null = null
  for (const s of statuses) if (!best || STATUS_RANK[s] > STATUS_RANK[best]) best = s
  return best
}

export interface CountrySummary {
  country: Country
  status: Status | null // propio o derivado de sus ciudades/regiones/lugares
  ownEntry: Entry | null
  childEntries: Entry[]
  visitedRegionIds: Set<string>
  percent: number // 0–100
  percentIsManual: boolean
}

/**
 * Resume el estado de cada país a partir de todas las entradas.
 * Una ciudad/región/lugar con estado implica ese estado en su país.
 * El % se calcula por área de las regiones visitadas (Vivido/Visitado), salvo override manual.
 */
export function summarizeCountries(geo: Geo, entries: Entry[]): Map<string, CountrySummary> {
  const byCountry = new Map<string, Entry[]>()
  for (const e of entries) {
    if (!byCountry.has(e.countryId)) byCountry.set(e.countryId, [])
    byCountry.get(e.countryId)!.push(e)
  }

  const out = new Map<string, CountrySummary>()
  for (const [countryId, list] of byCountry) {
    const country = geo.countries[countryId]
    if (!country) continue
    const ownEntry = list.find((e) => e.type === 'country') ?? null
    const childEntries = list.filter((e) => e.type !== 'country')
    const status = strongestStatus(list.map((e) => e.status))

    const visitedRegionIds = new Set<string>()
    for (const e of childEntries) if (e.regionId && BEEN_STATUSES.has(e.status)) visitedRegionIds.add(e.regionId)

    let percent = 0
    const total = geo.regionAreaByCountry[countryId] ?? 0
    if (total > 0) {
      let visitedArea = 0
      for (const id of visitedRegionIds) visitedArea += geo.regions[id]?.areaKm2 ?? 0
      percent = (visitedArea / total) * 100
    } else if (status && BEEN_STATUSES.has(status)) {
      percent = 100 // país sin regiones (microestados)
    }
    const manual = ownEntry?.percentOverride
    out.set(countryId, {
      country,
      status,
      ownEntry,
      childEntries,
      visitedRegionIds,
      percent: manual ?? percent,
      percentIsManual: manual != null,
    })
  }
  return out
}

/** Días (inclusivos) de un rango. */
export function rangeDays(r: DateRange): number {
  const a = Date.parse(r.start)
  const b = Date.parse(r.end || r.start)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
}

export function formatRange(r: DateRange): string {
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })
  if (!r.end || r.end === r.start) return fmt(r.start)
  return `${fmt(r.start)} – ${fmt(r.end)}`
}

export function flagEmoji(iso2: string | null): string {
  if (!iso2 || iso2.length !== 2) return '🏳️'
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}
