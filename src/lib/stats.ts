import { CONTINENTS, type ContinentId, type Geo } from './geo'
import { BEEN_STATUSES, type CountrySummary, type DateRange, type Entry } from './model'

const DAY = 86_400_000

/** Días únicos cubiertos por varios rangos (los solapes cuentan una vez). */
export function uniqueDays(ranges: DateRange[]): number {
  const sorted = ranges
    .map((r) => [Date.parse(r.start), Date.parse(r.end || r.start)] as const)
    .filter(([a, b]) => !Number.isNaN(a) && !Number.isNaN(b))
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let cur: [number, number] | null = null
  for (const [a, b] of sorted) {
    if (cur && a <= cur[1] + DAY) cur[1] = Math.max(cur[1], b)
    else {
      if (cur) total += (cur[1] - cur[0]) / DAY + 1
      cur = [a, b]
    }
  }
  if (cur) total += (cur[1] - cur[0]) / DAY + 1
  return Math.round(total)
}

export interface Stats {
  unCountries: number
  territories: number
  worldAreaPercent: number
  worldPopulationPercent: number
  cities: number
  landmarks: number
  unesco: number
  continents: { id: ContinentId; name: string; been: number; total: number }[]
  continentsBeen: number
  daysByCountry: { id: string; name: string; days: number }[]
  totalDays: number
  byYear: { year: string; countries: number; places: number }[]
  wishlist: Entry[]
}

export function computeStats(geo: Geo, entries: Entry[], summaries: Map<string, CountrySummary>): Stats {
  const been = [...summaries.values()].filter((s) => s.status && BEEN_STATUSES.has(s.status))
  const beenIds = new Set(been.map((s) => s.country.id))
  const all = Object.values(geo.countries)

  let worldArea = 0
  let worldPop = 0
  let areaBeen = 0
  let popBeen = 0
  for (const c of all) {
    if (c.id === 'ATA') continue
    worldArea += c.areaKm2 ?? 0
    worldPop += c.population ?? 0
  }
  for (const s of been) {
    areaBeen += ((s.country.areaKm2 ?? 0) * s.percent) / 100
    popBeen += s.country.population ?? 0
  }

  const continents = (Object.keys(CONTINENTS) as ContinentId[]).map((id) => {
    const members = all.filter((c) => c.continent === id && (c.kind === 'country' || id === 'AN'))
    return { id, name: CONTINENTS[id], total: members.length, been: members.filter((c) => beenIds.has(c.id)).length }
  })

  const beenEntries = entries.filter((e) => BEEN_STATUSES.has(e.status))
  const rangesByCountry = new Map<string, DateRange[]>()
  for (const e of beenEntries) {
    const list = rangesByCountry.get(e.countryId) ?? []
    list.push(...e.dates)
    rangesByCountry.set(e.countryId, list)
  }
  const daysByCountry = [...rangesByCountry]
    .map(([id, ranges]) => ({ id, name: geo.countries[id]?.name ?? id, days: uniqueDays(ranges) }))
    .filter((d) => d.days > 0)
    .sort((a, b) => b.days - a.days)

  const years = new Map<string, { countries: Set<string>; places: Set<string> }>()
  for (const e of beenEntries) {
    for (const d of e.dates) {
      for (let y = Number(d.start.slice(0, 4)); y <= Number((d.end || d.start).slice(0, 4)); y++) {
        const bucket = years.get(String(y)) ?? { countries: new Set(), places: new Set() }
        bucket.countries.add(e.countryId)
        if (e.type !== 'country') bucket.places.add(e.key)
        years.set(String(y), bucket)
      }
    }
  }

  return {
    unCountries: been.filter((s) => s.country.kind === 'country').length,
    territories: been.filter((s) => s.country.kind === 'territory').length,
    worldAreaPercent: worldArea ? (areaBeen / worldArea) * 100 : 0,
    worldPopulationPercent: worldPop ? (popBeen / worldPop) * 100 : 0,
    cities: beenEntries.filter((e) => e.type === 'city').length,
    landmarks: beenEntries.filter((e) => e.type === 'landmark' || e.type === 'custom').length,
    unesco: beenEntries.filter((e) => e.type === 'landmark' && e.placeId.startsWith('whs-')).length,
    continents,
    continentsBeen: continents.filter((c) => c.been > 0).length,
    daysByCountry,
    totalDays: uniqueDays(beenEntries.flatMap((e) => e.dates)),
    byYear: [...years]
      .map(([year, b]) => ({ year, countries: b.countries.size, places: b.places.size }))
      .sort((a, b) => b.year.localeCompare(a.year)),
    wishlist: entries
      .filter((e) => e.status === 'wishlist')
      .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || a.name.localeCompare(b.name, 'es')),
  }
}
