// Itinerario y resumen de un viaje, derivados de los rangos de fechas que apuntan a él.
import type { Geo } from './geo'
import type { DateRange, Entry, Trip } from './model'
import { uniqueDays } from './stats'

export interface TripStop {
  entry: Entry
  range: DateRange
  lon: number | null
  lat: number | null
}

export interface TripSummary {
  trip: Trip
  stops: TripStop[]
  start: string | null
  end: string | null
  days: number
  countryIds: string[] // en orden de aparición
}

const TYPE_ORDER: Record<Entry['type'], number> = { country: 0, region: 1, city: 2, landmark: 3, custom: 3 }

export function tripStops(geo: Geo, tripId: string, entries: Entry[]): TripStop[] {
  const stops: TripStop[] = []
  for (const entry of entries) {
    for (const range of entry.dates) {
      if (range.tripId !== tripId) continue
      const country = geo.countries[entry.countryId]
      const useCenter = entry.lon == null || entry.lat == null
      stops.push({
        entry,
        range,
        lon: useCenter ? country?.center[0] ?? null : entry.lon,
        lat: useCenter ? country?.center[1] ?? null : entry.lat,
      })
    }
  }
  return stops.sort(
    (a, b) =>
      a.range.start.localeCompare(b.range.start) ||
      TYPE_ORDER[a.entry.type] - TYPE_ORDER[b.entry.type] ||
      a.entry.name.localeCompare(b.entry.name, 'es'),
  )
}

export function summarizeTrip(geo: Geo, trip: Trip, entries: Entry[]): TripSummary {
  const stops = tripStops(geo, trip.id, entries)
  const countryIds: string[] = []
  for (const s of stops) if (!countryIds.includes(s.entry.countryId)) countryIds.push(s.entry.countryId)
  const ends = stops.map((s) => s.range.end || s.range.start).sort()
  return {
    trip,
    stops,
    start: stops[0]?.range.start ?? null,
    end: ends.at(-1) ?? null,
    days: uniqueDays(stops.map((s) => s.range)),
    countryIds,
  }
}

/** Puntos de la ruta: se omiten los países cuando hay paradas más precisas dentro de ellos. */
export function routeCoords(stops: TripStop[]): [number, number][] {
  const precise = new Set(stops.filter((s) => s.entry.type !== 'country').map((s) => s.entry.countryId))
  const coords: [number, number][] = []
  for (const s of stops) {
    if (s.lon == null || s.lat == null) continue
    if (s.entry.type === 'country' && precise.has(s.entry.countryId)) continue
    const last = coords.at(-1)
    if (last && last[0] === s.lon && last[1] === s.lat) continue
    coords.push([s.lon, s.lat])
  }
  return coords
}

export function formatTripRange(start: string | null, end: string | null): string {
  if (!start) return 'Sin fechas'
  const fmt = (s: string, withYear: boolean) =>
    new Date(`${s}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
  if (!end || end === start) return fmt(start, true)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`
}
