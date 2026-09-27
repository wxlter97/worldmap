// Sugerencias para la lista de deseos: qué combinar con cada destino e ideas a partir de lo ya visitado.
import { useEffect, useState } from 'react'
import { ACHIEVEMENTS, REGION_SETS } from './achievements'
import { loadCities, loadLandmarks, type CityRow, type Geo, type LandmarkRow } from './geo'
import { BEEN_STATUSES, type CountrySummary, type Entry } from './model'
import type { Place } from './search'

export interface Gazetteer {
  cities: CityRow[]
  landmarks: LandmarkRow[]
}

let gazetteerCache: Gazetteer | null = null

export function useGazetteer(): Gazetteer | null {
  const [g, setG] = useState<Gazetteer | null>(gazetteerCache)
  useEffect(() => {
    if (g) return
    Promise.all([loadCities(), loadLandmarks()]).then(([cities, landmarks]) => {
      gazetteerCache = { cities, landmarks }
      setG(gazetteerCache)
    }, () => undefined)
  }, [g])
  return g
}

export interface Suggestion {
  place: Place
  reason: string
  distanceKm?: number
}

const R = 6371
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLon = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const cityPlace = (c: CityRow): Place => ({ type: 'city', id: String(c[0]), name: c[1], countryId: c[2], regionId: c[3], lon: c[4], lat: c[5], population: c[6] })
const landmarkPlace = (l: LandmarkRow): Place => ({ type: 'landmark', id: l[0], name: l[1], countryId: l[2], regionId: l[3], lon: l[4], lat: l[5], source: l[6] })
export const countryAsPlace = (geo: Geo, id: string): Place => {
  const c = geo.countries[id]
  return { type: 'country', id, name: c?.name ?? id, countryId: id, regionId: null, lon: c?.center[0] ?? null, lat: c?.center[1] ?? null }
}

const NEARBY_KM = 250
// Más cerca que esto suelen ser barrios o suburbios del mismo destino (p. ej. Soacha para Bogotá).
const MIN_CITY_KM = 40
const MIN_CITY_POP = 150_000

/**
 * Qué combinar con un destino: sitios UNESCO y ciudades cercanas (o las más destacadas del país si el
 * destino es un país entero) y países vecinos aún no visitados. Excluye lo que ya está en el mapa.
 */
export function combineWith(geo: Geo, target: Entry, entries: Entry[], summaries: Map<string, CountrySummary>, gz: Gazetteer, limit = 6): Suggestion[] {
  const known = new Set(entries.map((e) => e.key))
  const out: Suggestion[] = []
  const country = geo.countries[target.countryId]

  if (target.type === 'country' || target.lon == null || target.lat == null) {
    const sites = gz.landmarks
      .filter((l) => l[2] === target.countryId && !known.has(`landmark:${l[0]}`))
      .sort((a, b) => Number(b[6] === 'wonder') - Number(a[6] === 'wonder'))
      .slice(0, 3)
    for (const l of sites) out.push({ place: landmarkPlace(l), reason: l[6] === 'wonder' ? 'Maravilla del mundo' : 'Patrimonio UNESCO' })
    // cities.json viene ordenado por población.
    const cities = gz.cities.filter((c) => c[2] === target.countryId && !known.has(`city:${c[0]}`)).slice(0, 3)
    for (const c of cities) out.push({ place: cityPlace(c), reason: c[7] ? 'Capital' : `${(c[6] / 1e6).toLocaleString('es', { maximumFractionDigits: 1 })} M hab.` })
  } else {
    const here: [number, number] = [target.lon, target.lat]
    const near = <T,>(rows: T[], coords: (r: T) => [number, number], keep: (r: T) => boolean) =>
      rows
        .filter(keep)
        .map((r) => ({ r, d: distanceKm(here, coords(r)) }))
        .filter((x) => x.d <= NEARBY_KM && x.d > 1)
        .sort((a, b) => a.d - b.d)
    for (const { r, d } of near(gz.landmarks, (l) => [l[4], l[5]], (l) => !known.has(`landmark:${l[0]}`)).slice(0, 3)) {
      out.push({ place: landmarkPlace(r), reason: `UNESCO · a ${Math.round(d)} km`, distanceKm: d })
    }
    const cities = near(gz.cities, (c) => [c[4], c[5]], (c) => c[6] >= MIN_CITY_POP && !known.has(`city:${c[0]}`))
      .filter((x) => x.d >= MIN_CITY_KM)
      .slice(0, 3)
    for (const { r, d } of cities) out.push({ place: cityPlace(r), reason: `a ${Math.round(d)} km`, distanceKm: d })
  }

  for (const n of country?.neighbours ?? []) {
    const s = summaries.get(n)
    if (s?.status && BEEN_STATUSES.has(s.status)) continue
    if (known.has(`country:${n}`)) continue
    out.push({ place: countryAsPlace(geo, n), reason: `Frontera con ${country.name}` })
    if (out.length >= limit + 2) break
  }
  return out.slice(0, limit)
}

export interface Idea {
  title: string
  description: string
  suggestions: Suggestion[]
}

const beenIds = (summaries: Map<string, CountrySummary>) =>
  new Set([...summaries.values()].filter((s) => s.status && BEEN_STATUSES.has(s.status)).map((s) => s.country.id))

/** Ideas generales: vecinos de lo visitado, países para completar logros regionales y maravillas pendientes. */
export function ideas(geo: Geo, entries: Entry[], summaries: Map<string, CountrySummary>, gz: Gazetteer): Idea[] {
  const been = beenIds(summaries)
  const out: Idea[] = []
  // Lo que ya está en el mapa (p. ej. en Quiero ir) no se vuelve a sugerir.
  const listed = new Set(entries.map((e) => e.key))
  const fresh = (s: Suggestion) => !listed.has(`${s.place.type}:${s.place.id}`)
  // Distancia al país visitado más cercano: ordena las sugerencias largas por cercanía.
  const beenCenters = [...been].map((id) => geo.countries[id]?.center).filter(Boolean) as [number, number][]
  const closeness = (id: string) => {
    const c = geo.countries[id]?.center
    return c ? Math.min(...beenCenters.map((b) => distanceKm(b, c))) : Infinity
  }
  const MAX = 8

  // Países de la ONU no visitados que limitan con varios que sí.
  const neighbourScore = new Map<string, string[]>()
  for (const id of been) {
    for (const n of geo.countries[id]?.neighbours ?? []) {
      if (been.has(n) || geo.countries[n]?.kind !== 'country') continue
      neighbourScore.set(n, [...(neighbourScore.get(n) ?? []), geo.countries[id].name])
    }
  }
  const gaps = [...neighbourScore]
    .sort((a, b) => b[1].length - a[1].length || geo.countries[a[0]].name.localeCompare(geo.countries[b[0]].name, 'es'))
    .slice(0, 8)
  if (gaps.length) {
    out.push({
      title: 'Cerca de lo que conoces',
      description: 'Países que limitan con los que ya visitaste.',
      suggestions: gaps.map(([id, via]) => ({ place: countryAsPlace(geo, id), reason: `Vecino de ${listEs(via)}` })).filter(fresh),
    })
  }

  // Logros regionales empezados: qué países faltan.
  for (const [achId, members] of Object.entries(REGION_SETS)) {
    const done = members.filter((m) => been.has(m)).length
    if (done === 0 || done === members.length) continue
    const def = ACHIEVEMENTS.find((a) => a.id === achId)!
    const missing = members.filter((m) => !been.has(m)).sort((a, b) => closeness(a) - closeness(b))
    out.push({
      title: `Para «${def.title}»`,
      description:
        missing.length > MAX
          ? `${done} de ${members.length}. Te faltan ${missing.length}; estos son los más cercanos a donde ya estuviste:`
          : `${done} de ${members.length}. Te faltan:`,
      suggestions: missing.slice(0, MAX).map((m) => ({ place: countryAsPlace(geo, m), reason: def.title })).filter(fresh),
    })
  }

  // Maravillas pendientes (si ya empezaste la colección).
  const wonders = gz.landmarks.filter((l) => l[6] === 'wonder')
  const seen = wonders.filter((l) => entries.some((e) => e.key === `landmark:${l[0]}` && BEEN_STATUSES.has(e.status)))
  if (seen.length > 0 && seen.length < wonders.length) {
    out.push({
      title: 'Las 7 maravillas',
      description: `${seen.length} de 7. Te faltan:`,
      suggestions: wonders
        .filter((l) => !seen.includes(l))
        .map((l) => ({ place: landmarkPlace(l), reason: geo.countries[l[2]]?.name ?? '' }))
        .filter(fresh),
    })
  }
  return out.filter((idea) => idea.suggestions.length > 0)
}

function listEs(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length > 3) return `${items.slice(0, 2).join(', ')} y ${items.length - 2} más`
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}
