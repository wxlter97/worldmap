// Itinerario y resumen de un viaje, derivados de los rangos de fechas que apuntan a él.
import type { Geo } from './geo'
import type { DateRange, Entry, Trip } from './model'
import { uniqueDays } from './stats'
import { locale } from './i18n'
import { t } from './i18n'

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

export function formatTripRange(start: string | null, end: string | null): string {
  if (!start) return t('Sin fechas')
  const fmt = (s: string, withYear: boolean) =>
    new Date(`${s}T00:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
  if (!end || end === start) return fmt(start, true)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`
}
