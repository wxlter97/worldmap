// Logros: se evalúan recorriendo las visitas en orden cronológico para saber cuándo se desbloqueó cada uno.
import { useEffect, useMemo, useState } from 'react'
import { loadCities, type Geo } from './geo'
import { BEEN_STATUSES, type DateRange, type Entry } from './model'
import { uniqueDays } from './stats'

export type AchievementGroup = 'Países' | 'Continentes' | 'Regiones del mundo' | 'Ciudades' | 'Lugares' | 'Tiempo'

interface State {
  countries: Set<string>
  territories: Set<string>
  continents: Set<string>
  hemispheresNS: Set<'N' | 'S'>
  hemispheresEW: Set<'E' | 'W'>
  cities: Set<string>
  capitals: Set<string>
  megacities: Set<string>
  unesco: Set<string>
  wonders: Set<string>
  lived: Set<string>
  ranges: DateRange[]
  countriesByYear: Map<string, Set<string>>
  regionsByCountry: Map<string, Set<string>>
}

interface Ctx {
  geo: Geo
  completeCountries: (s: State) => number
}

export interface AchievementDef {
  id: string
  group: AchievementGroup
  title: string
  description: string
  glyph: string // 1–3 caracteres para el ícono
  target: number
  measure: (s: State, ctx: Ctx) => number
}

const countIn = (set: Set<string>, members: string[]) => members.filter((m) => set.has(m)).length

const CENTRAL_AMERICA = ['BLZ', 'GTM', 'SLV', 'HND', 'NIC', 'CRI', 'PAN']
const SOUTH_AMERICA = ['ARG', 'BOL', 'BRA', 'CHL', 'COL', 'ECU', 'GUY', 'PRY', 'PER', 'SUR', 'URY', 'VEN']
const NORDICS = ['DNK', 'FIN', 'ISL', 'NOR', 'SWE']
const EU = 'AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE'.split(' ')
const MEGACITY_POPULATION = 5_000_000

const tier = (id: string, group: AchievementGroup, title: string, description: string, glyph: string, target: number, measure: AchievementDef['measure']): AchievementDef => ({
  id, group, title, description, glyph, target, measure,
})

export const ACHIEVEMENTS: AchievementDef[] = [
  tier('paises-1', 'Países', 'Primer sello', 'Visita tu primer país de la ONU.', '1', 1, (s) => s.countries.size),
  tier('paises-5', 'Países', 'Cinco banderas', 'Visita 5 países de la ONU.', '5', 5, (s) => s.countries.size),
  tier('paises-10', 'Países', 'Diez fronteras', 'Visita 10 países de la ONU.', '10', 10, (s) => s.countries.size),
  tier('paises-25', 'Países', 'Pasaporte gastado', 'Visita 25 países de la ONU.', '25', 25, (s) => s.countries.size),
  tier('paises-50', 'Países', 'Medio centenar', 'Visita 50 países de la ONU.', '50', 50, (s) => s.countries.size),
  tier('paises-100', 'Países', 'Club de los 100', 'Visita 100 países de la ONU.', '100', 100, (s) => s.countries.size),
  tier('territorios-5', 'Países', 'Fuera del mapa', 'Visita 5 territorios (dependencias, regiones en disputa…).', 'T', 5, (s) => s.territories.size),
  tier('completo-1', 'Países', 'Completista', 'Recorre todas las regiones de un país (mín. 2 regiones).', '%', 1, (s, c) => c.completeCountries(s)),

  tier('continentes-3', 'Continentes', 'Tres continentes', 'Pisa 3 continentes.', '3', 3, (s) => s.continents.size),
  tier('continentes-5', 'Continentes', 'Cinco continentes', 'Pisa 5 continentes.', '5', 5, (s) => s.continents.size),
  tier('continentes-7', 'Continentes', 'Los siete', 'Pisa los 7 continentes, Antártida incluida.', '7', 7, (s) => s.continents.size),
  tier('ecuador', 'Continentes', 'Cruzar el ecuador', 'Visita lugares en los hemisferios norte y sur.', 'NS', 2, (s) => s.hemispheresNS.size),
  tier('meridiano', 'Continentes', 'Este y oeste', 'Visita lugares a ambos lados del meridiano de Greenwich.', 'EO', 2, (s) => s.hemispheresEW.size),

  tier('centroamerica', 'Regiones del mundo', 'Istmo completo', 'Visita los 7 países de Centroamérica.', 'CA', 7, (s) => countIn(s.countries, CENTRAL_AMERICA)),
  tier('sudamerica', 'Regiones del mundo', 'Sudamérica completa', 'Visita los 12 países de Sudamérica.', 'SA', 12, (s) => countIn(s.countries, SOUTH_AMERICA)),
  tier('nordicos', 'Regiones del mundo', 'Norte nórdico', 'Visita los 5 países nórdicos.', 'NO', 5, (s) => countIn(s.countries, NORDICS)),
  tier('ue', 'Regiones del mundo', 'Europa de los 27', 'Visita los 27 países de la Unión Europea.', 'UE', 27, (s) => countIn(s.countries, EU)),

  tier('ciudades-10', 'Ciudades', 'Diez ciudades', 'Visita 10 ciudades.', '10', 10, (s) => s.cities.size),
  tier('ciudades-50', 'Ciudades', 'Urbanita', 'Visita 50 ciudades.', '50', 50, (s) => s.cities.size),
  tier('ciudades-100', 'Ciudades', 'Cien ciudades', 'Visita 100 ciudades.', '100', 100, (s) => s.cities.size),
  tier('capitales-10', 'Ciudades', 'Capitalino', 'Visita 10 capitales.', 'C', 10, (s) => s.capitals.size),
  tier('mega-5', 'Ciudades', 'Megalópolis', 'Visita 5 ciudades de más de 5 millones de habitantes.', 'M', 5, (s) => s.megacities.size),

  tier('unesco-1', 'Lugares', 'Patrimonio', 'Visita un sitio del Patrimonio de la Humanidad.', 'U', 1, (s) => s.unesco.size),
  tier('unesco-10', 'Lugares', 'Diez patrimonios', 'Visita 10 sitios UNESCO.', '10', 10, (s) => s.unesco.size),
  tier('unesco-50', 'Lugares', 'Cincuenta patrimonios', 'Visita 50 sitios UNESCO.', '50', 50, (s) => s.unesco.size),
  tier('maravillas', 'Lugares', 'Las 7 maravillas', 'Visita las 7 maravillas del mundo moderno.', '7', 7, (s) => s.wonders.size),

  tier('dias-100', 'Tiempo', 'Cien días fuera', 'Suma 100 días de viaje con fecha.', '100', 100, (s) => uniqueDays(s.ranges)),
  tier('dias-365', 'Tiempo', 'Un año en ruta', 'Suma 365 días de viaje con fecha.', '365', 365, (s) => uniqueDays(s.ranges)),
  tier('anio-5', 'Tiempo', 'Año viajero', 'Visita 5 países en un mismo año.', 'A', 5, (s) => Math.max(0, ...[...s.countriesByYear.values()].map((c) => c.size))),
  tier('vivido-2', 'Tiempo', 'Ciudadano del mundo', 'Vive en 2 países distintos.', 'V', 2, (s) => s.lived.size),
]

export interface Achievement {
  def: AchievementDef
  value: number
  unlocked: boolean
  unlockedAt: string | null // fecha de la visita que lo desbloqueó (null si fue una entrada sin fechas)
}

export interface CityInfo {
  capital: boolean
  population: number
}

export function computeAchievements(geo: Geo, entries: Entry[], cityInfo: Map<string, CityInfo>): Achievement[] {
  const s: State = {
    countries: new Set(), territories: new Set(), continents: new Set(), hemispheresNS: new Set(), hemispheresEW: new Set(),
    cities: new Set(), capitals: new Set(), megacities: new Set(), unesco: new Set(), wonders: new Set(), lived: new Set(),
    ranges: [], countriesByYear: new Map(), regionsByCountry: new Map(),
  }
  const regionCount = new Map<string, number>()
  for (const r of Object.values(geo.regions)) regionCount.set(r.country, (regionCount.get(r.country) ?? 0) + 1)
  const ctx: Ctx = {
    geo,
    completeCountries: (st) => {
      let n = 0
      for (const [countryId, regions] of st.regionsByCountry) {
        const total = geo.regionAreaByCountry[countryId] ?? 0
        if ((regionCount.get(countryId) ?? 0) < 2 || total === 0) continue
        let area = 0
        for (const id of regions) area += geo.regions[id]?.areaKm2 ?? 0
        if (area / total >= 0.995) n++
      }
      return n
    },
  }

  // Eventos: cada rango de fechas de una entrada Vivido/Visitado; las entradas sin fechas cuentan al final.
  const events: { date: string | null; entry: Entry; range: DateRange | null }[] = []
  for (const e of entries) {
    if (!BEEN_STATUSES.has(e.status)) continue
    if (e.dates.length === 0) events.push({ date: null, entry: e, range: null })
    for (const r of e.dates) events.push({ date: r.start, entry: e, range: r })
  }
  events.sort((a, b) => (a.date ?? '￿').localeCompare(b.date ?? '￿'))

  const result = new Map<string, Achievement>(ACHIEVEMENTS.map((def) => [def.id, { def, value: 0, unlocked: false, unlockedAt: null }]))
  const evaluate = (date: string | null) => {
    for (const a of result.values()) {
      if (a.unlocked) continue
      a.value = a.def.measure(s, ctx)
      if (a.value >= a.def.target) {
        a.unlocked = true
        a.unlockedAt = date
      }
    }
  }

  for (const { date, entry: e, range } of events) {
    const country = geo.countries[e.countryId]
    if (!country) continue
    ;(country.kind === 'country' ? s.countries : s.territories).add(country.id)
    s.continents.add(country.continent)
    const lat = e.lat ?? country.center[1]
    const lon = e.lon ?? country.center[0]
    s.hemispheresNS.add(lat >= 0 ? 'N' : 'S')
    s.hemispheresEW.add(lon >= 0 ? 'E' : 'W')
    if (e.status === 'lived') s.lived.add(country.id)
    if (e.regionId) {
      if (!s.regionsByCountry.has(country.id)) s.regionsByCountry.set(country.id, new Set())
      s.regionsByCountry.get(country.id)!.add(e.regionId)
    }
    if (e.type === 'city') {
      s.cities.add(e.placeId)
      const info = cityInfo.get(e.placeId)
      if (info?.capital) s.capitals.add(e.placeId)
      if (info && info.population >= MEGACITY_POPULATION) s.megacities.add(e.placeId)
    }
    if (e.type === 'landmark' && e.placeId.startsWith('whs-')) s.unesco.add(e.placeId)
    if (e.type === 'landmark' && e.placeId.startsWith('wonder-')) s.wonders.add(e.placeId)
    if (range) {
      s.ranges.push(range)
      for (let y = Number(range.start.slice(0, 4)); y <= Number((range.end || range.start).slice(0, 4)); y++) {
        const set = s.countriesByYear.get(String(y)) ?? new Set<string>()
        if (country.kind === 'country') set.add(country.id)
        s.countriesByYear.set(String(y), set)
      }
    }
    evaluate(date)
  }
  evaluate(null)
  return [...result.values()]
}

let cityInfoCache: Map<string, CityInfo> | null = null

/** Logros del usuario; carga el índice de ciudades (capitales, población) en segundo plano. */
export function useAchievements(geo: Geo, entries: Entry[]) {
  const [cityInfo, setCityInfo] = useState<Map<string, CityInfo> | null>(cityInfoCache)
  useEffect(() => {
    if (cityInfo) return
    loadCities().then((rows) => {
      cityInfoCache = new Map(rows.map((r) => [String(r[0]), { capital: r[7] === 1, population: r[6] }]))
      setCityInfo(cityInfoCache)
    }, () => undefined)
  }, [cityInfo])
  return useMemo(() => (cityInfo ? computeAchievements(geo, entries, cityInfo) : null), [geo, entries, cityInfo])
}
