import { describe, expect, it } from 'vitest'
import { computeAchievements } from '../../src/lib/achievements'
import { parseBackup } from '../../src/lib/exporters'
import type { Country, Geo, Region } from '../../src/lib/geo'
import { buildJourney, greatCircle, splitAntimeridian, wrapLon } from '../../src/lib/journey'
import { emptyEntry, rangeDays, summarizeCountries, type Entry } from '../../src/lib/model'
import { uniqueDays } from '../../src/lib/stats'

// --- Geo mínimo de prueba ---
const country = (id: string, over: Partial<Country> = {}): Country => ({
  id, iso2: id.slice(0, 2), name: id, nameEn: id, kind: 'country', sovereign: null, continent: 'NA', subregion: '',
  capital: null, currency: null, phone: null, languages: [], population: 1000, areaKm2: 100, center: [0, 0], neighbours: [], ...over,
})
const region = (id: string, c: string, areaKm2: number): Region => ({ id, country: c, name: id, type: null, areaKm2 })
const geo: Geo = {
  countries: {
    SLV: country('SLV', { center: [-89, 13.7], neighbours: ['GTM', 'HND'] }),
    GTM: country('GTM', { center: [-90.3, 15.7] }),
    HND: country('HND', { center: [-86.6, 14.8] }),
    JPN: country('JPN', { continent: 'AS', center: [139, 36] }),
    USA: country('USA', { center: [-98, 39] }),
    PRI: country('PRI', { kind: 'territory', center: [-66.5, 18.2] }),
  },
  regions: { A: region('A', 'SLV', 300), B: region('B', 'SLV', 700) },
  regionAreaByCountry: { SLV: 1000 },
  shapes: { type: 'FeatureCollection', features: [] },
}

const mk = (type: Entry['type'], id: string, countryId: string, extra: Partial<Entry> = {}): Entry => ({
  ...emptyEntry(type, id, { name: id, countryId, regionId: null, lon: null, lat: null }),
  ...extra,
})

describe('fechas', () => {
  it('rangeDays es inclusivo', () => {
    expect(rangeDays({ start: '2024-12-20', end: '2025-01-05' })).toBe(17)
    expect(rangeDays({ start: '2024-01-01', end: '2024-01-01' })).toBe(1)
  })

  it('uniqueDays no cuenta dos veces los solapes', () => {
    expect(uniqueDays([{ start: '2024-12-20', end: '2025-01-05' }, { start: '2024-12-27', end: '2024-12-29' }])).toBe(17)
    expect(uniqueDays([{ start: '2024-01-01', end: '2024-01-02' }, { start: '2024-01-03', end: '2024-01-03' }])).toBe(3)
    expect(uniqueDays([{ start: '2024-01-01', end: '2024-01-01' }, { start: '2024-02-01', end: '2024-02-01' }])).toBe(2)
    expect(uniqueDays([])).toBe(0)
  })
})

describe('resumen por país', () => {
  it('una ciudad implica el país y suma su región al %', () => {
    const s = summarizeCountries(geo, [mk('city', '1', 'SLV', { regionId: 'A' })]).get('SLV')!
    expect(s.status).toBe('visited')
    expect(s.percent).toBeCloseTo(30)
  })

  it('el % manual manda', () => {
    const s = summarizeCountries(geo, [mk('country', 'SLV', 'SLV', { percentOverride: 80 }), mk('city', '1', 'SLV', { regionId: 'A' })]).get('SLV')!
    expect(s.percent).toBe(80)
    expect(s.percentIsManual).toBe(true)
  })

  it('Vivido gana a Quiero ir', () => {
    const s = summarizeCountries(geo, [mk('city', '1', 'SLV', { status: 'wishlist' }), mk('city', '2', 'SLV', { status: 'lived' })]).get('SLV')!
    expect(s.status).toBe('lived')
  })

  it('las escalas no suman %', () => {
    const s = summarizeCountries(geo, [mk('city', '1', 'SLV', { status: 'transit', regionId: 'B' })]).get('SLV')!
    expect(s.percent).toBe(0)
  })
})

describe('líneas de viaje', () => {
  it('wrapLon deja la longitud en [-180, 180)', () => {
    expect(wrapLon(190)).toBe(-170)
    expect(wrapLon(-190)).toBe(170)
    expect(wrapLon(0)).toBe(0)
  })

  it('el círculo máximo empieza y termina en los extremos', () => {
    const arc = greatCircle([-89, 13.7], [139, 36])
    expect(arc[0][0]).toBeCloseTo(-89)
    expect(wrapLon(arc.at(-1)![0])).toBeCloseTo(139)
  })

  it('Tokio → Nueva York se corta en el antimeridiano y queda dentro del mapa', () => {
    const segments = splitAntimeridian(greatCircle([139.7, 35.7], [-74, 40.7]))
    expect(segments.length).toBe(2)
    for (const seg of segments) for (const [lon] of seg) expect(Math.abs(lon)).toBeLessThanOrEqual(180)
    expect(Math.abs(segments[0].at(-1)![0])).toBe(180)
    expect(segments[0].at(-1)![1]).toBeCloseTo(segments[1][0][1])
  })

  it('un arco que no cruza queda en un solo tramo', () => {
    expect(splitAntimeridian(greatCircle([-89, 13.7], [-3.7, 40.4])).length).toBe(1)
  })

  it('buildJourney ordena por fecha y omite el país si hay parada precisa', () => {
    const entries = [
      mk('city', '2', 'JPN', { lon: 139, lat: 35, dates: [{ start: '2022-04-01', end: '2022-04-05' }] }),
      mk('country', 'JPN', 'JPN', { dates: [{ start: '2022-04-01', end: '2022-04-09' }] }),
      mk('city', '1', 'SLV', { lon: -89, lat: 13.7, dates: [{ start: '2019-01-01', end: '2019-01-02' }] }),
      mk('city', '3', 'USA', { status: 'wishlist', lon: -74, lat: 40, dates: [{ start: '2020-01-01', end: '2020-01-01' }] }),
    ]
    expect(buildJourney(geo, entries).map((s) => s.key)).toEqual(['city:1', 'city:2'])
  })
})

describe('logros', () => {
  const cityInfo = new Map([['1', { capital: true, population: 6_000_000 }]])

  it('se desbloquean con la fecha de la visita que los consigue', () => {
    const entries = [
      mk('city', '1', 'SLV', { lon: -89, lat: 13.7, dates: [{ start: '2019-06-02', end: '2019-06-03' }] }),
      mk('country', 'JPN', 'JPN', { dates: [{ start: '2022-04-01', end: '2022-04-02' }] }),
    ]
    const byId = Object.fromEntries(computeAchievements(geo, entries, cityInfo).map((a) => [a.def.id, a]))
    expect(byId['paises-1'].unlockedAt).toBe('2019-06-02')
    expect(byId['continentes-3'].unlocked).toBe(false)
    expect(byId['continentes-3'].value).toBe(2)
    expect(byId['centroamerica'].value).toBe(1)
  })

  it('un lugar sin fechas cuenta, pero sin fecha de desbloqueo', () => {
    const byId = Object.fromEntries(computeAchievements(geo, [mk('country', 'SLV', 'SLV')], cityInfo).map((a) => [a.def.id, a]))
    expect(byId['paises-1'].unlocked).toBe(true)
    expect(byId['paises-1'].unlockedAt).toBeNull()
  })

  it('los territorios no cuentan como países', () => {
    const byId = Object.fromEntries(computeAchievements(geo, [mk('country', 'PRI', 'PRI')], cityInfo).map((a) => [a.def.id, a]))
    expect(byId['paises-1'].unlocked).toBe(false)
  })

  it('Completista: todas las regiones de un país', () => {
    const entries = [mk('city', '1', 'SLV', { regionId: 'A' }), mk('city', '2', 'SLV', { regionId: 'B' })]
    const byId = Object.fromEntries(computeAchievements(geo, entries, cityInfo).map((a) => [a.def.id, a]))
    expect(byId['completo-1'].unlocked).toBe(true)
  })
})

describe('copias de seguridad', () => {
  const valid = { app: 'wxlter-mapa', version: 1, exportedAt: '2026-01-01', trips: [], entries: [mk('city', '1', 'SLV')] }

  it('acepta una copia válida', () => {
    expect('backup' in parseBackup(JSON.stringify(valid))).toBe(true)
  })

  it('rechaza JSON roto, otra app o entradas dañadas', () => {
    expect(parseBackup('{no')).toHaveProperty('error')
    expect(parseBackup(JSON.stringify({ foo: 1 }))).toHaveProperty('error')
    expect(parseBackup(JSON.stringify({ ...valid, entries: [{ ...valid.entries[0], status: 'volado' }] }))).toHaveProperty('error')
    expect(parseBackup(JSON.stringify({ ...valid, entries: [{ ...valid.entries[0], key: 'city:2' }] }))).toHaveProperty('error')
  })
})
