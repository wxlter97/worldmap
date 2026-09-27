// Convierte data-raw/ en los archivos que consume la app (public/data/).
//   countries.geojson   polígonos simplificados de países y territorios
//   countries.json      metadatos por país (nombre es, continente, tipo, capital, moneda…)
//   regions.json        regiones (admin-1) con su área, para el % por país
//   admin1/{ID}.json    polígonos de regiones por país (carga diferida)
//   cities.json         ciudades >15k hab. con país y región asignados
//   landmarks.json      Patrimonio de la Humanidad UNESCO + 7 maravillas
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import area from '@turf/area'
import bbox from '@turf/bbox'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

const ROOT = path.resolve(import.meta.dirname, '..')
const RAW = path.join(ROOT, 'data-raw')
const OUT = path.join(ROOT, 'public/data')
const TMP = path.join(RAW, 'tmp')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'admin1'), { recursive: true })
fs.mkdirSync(TMP, { recursive: true })

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'))
const writeJson = (f, data) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(data))
const mapshaper = (args) => execFileSync(path.join(ROOT, 'node_modules/.bin/mapshaper'), args, { stdio: 'inherit' })

// Estados miembros de la ONU (193). Todo lo demás se trata como territorio.
const UN_MEMBERS = new Set(`AFG ALB DZA AND AGO ATG ARG ARM AUS AUT AZE BHS BHR BGD BRB BLR BEL BLZ BEN BTN BOL BIH BWA
BRA BRN BGR BFA BDI CPV KHM CMR CAN CAF TCD CHL CHN COL COM COG CRI CIV HRV CUB CYP CZE PRK COD DNK DJI DMA DOM ECU EGY
SLV GNQ ERI EST SWZ ETH FJI FIN FRA GAB GMB GEO DEU GHA GRC GRD GTM GIN GNB GUY HTI HND HUN ISL IND IDN IRN IRQ IRL ISR
ITA JAM JPN JOR KAZ KEN KIR KWT KGZ LAO LVA LBN LSO LBR LBY LIE LTU LUX MDG MWI MYS MDV MLI MLT MHL MRT MUS MEX FSM MCO
MNG MNE MAR MOZ MMR NAM NRU NPL NLD NZL NIC NER NGA MKD NOR OMN PAK PLW PAN PNG PRY PER PHL POL PRT QAT KOR MDA ROU RUS
RWA KNA LCA VCT WSM SMR STP SAU SEN SRB SYC SLE SGP SVK SVN SLB SOM ZAF SSD ESP LKA SDN SUR SWE CHE SYR TJK TZA THA TLS
TGO TON TTO TUN TUR TKM TUV UGA UKR ARE GBR USA URY UZB VUT VEN VNM YEM ZMB ZWE`.split(/\s+/))
if (UN_MEMBERS.size !== 193) throw new Error(`UN_MEMBERS tiene ${UN_MEMBERS.size}`)

// Entidades de Natural Earth que se funden con su país de la ONU.
const MERGE_INTO = { SOL: 'SOM', CYN: 'CYP' }
const DROP = new Set(['KAS']) // glaciar de Siachen
// Códigos de Natural Earth que no coinciden con ISO3 / GeoNames.
const ID_OVERRIDE = { KOS: 'XKX' }
const NAME_OVERRIDE = { TWN: 'Taiwán' }

const CONTINENTS = {
  Africa: 'AF', Asia: 'AS', Europe: 'EU', 'North America': 'NA', 'South America': 'SA', Oceania: 'OC', Antarctica: 'AN',
}
function continentOf(p) {
  if (CONTINENTS[p.CONTINENT]) return CONTINENTS[p.CONTINENT]
  if (p.REGION_UN === 'Americas') return p.SUBREGION === 'South America' ? 'SA' : 'NA'
  return CONTINENTS[p.REGION_UN] ?? 'OC'
}

// --- countryInfo.txt de GeoNames: capital, moneda, población, idiomas ---
const info = {}
for (const line of fs.readFileSync(path.join(RAW, 'countryInfo.txt'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue
  const c = line.split('\t')
  info[c[1]] = {
    iso2: c[0], capital: c[5], areaKm2: Number(c[6]) || null, population: Number(c[7]) || null,
    tld: c[9], currencyCode: c[10], currencyName: c[11], phone: c[12], languages: c[15],
    neighbours: c[17] ? c[17].split(',') : [],
  }
}

// --- Países ---
const ne0 = readJson('ne_50m_admin_0_countries.geojson')
const neToId = {} // ADM0_A3 de Natural Earth -> nuestro id (ISO3)
const sovToId = {} // SOV_A3 de Natural Earth (p. ej. US1) -> ISO3 del Estado soberano
for (const { properties: p } of ne0.features) {
  if (p.ADMIN === p.SOVEREIGNT) sovToId[p.SOV_A3] = p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3
}
const countries = {}
const countryFeatures = []
for (const f of ne0.features) {
  const p = f.properties
  if (DROP.has(p.ADM0_A3)) continue
  const merged = MERGE_INTO[p.ADM0_A3]
  const id = merged ?? ID_OVERRIDE[p.ADM0_A3] ?? (p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3)
  neToId[p.ADM0_A3] = id
  countryFeatures.push({ type: 'Feature', properties: { id }, geometry: f.geometry })
  if (merged) continue
  const gi = info[id] ?? {}
  countries[id] = {
    id,
    iso2: p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : gi.iso2 ?? null,
    name: NAME_OVERRIDE[id] ?? p.NAME_ES ?? p.NAME,
    nameEn: p.NAME_EN ?? p.NAME,
    kind: UN_MEMBERS.has(id) ? 'country' : 'territory',
    // Territorios en disputa o indeterminados quedan sin Estado soberano.
    sovereign: ['Disputed', 'Indeterminate'].includes(p.TYPE) || sovToId[p.SOV_A3] === id ? null : sovToId[p.SOV_A3] ?? null,
    continent: continentOf(p),
    subregion: p.SUBREGION,
    capital: gi.capital || null,
    currency: gi.currencyCode ? { code: gi.currencyCode, name: gi.currencyName } : null,
    phone: gi.phone || null,
    languages: gi.languages ? gi.languages.split(',').map((l) => l.split('-')[0]).filter((v, i, a) => a.indexOf(v) === i) : [],
    population: gi.population ?? p.POP_EST ?? null,
    areaKm2: gi.areaKm2 ?? Math.round(area(f) / 1e6),
    center: [p.LABEL_X, p.LABEL_Y],
  }
}
// Vecinos por frontera terrestre (GeoNames usa ISO2).
const iso2ToIdAll = Object.fromEntries(Object.values(countries).filter((c) => c.iso2).map((c) => [c.iso2, c.id]))
for (const c of Object.values(countries)) {
  c.neighbours = (info[c.id]?.neighbours ?? []).map((iso2) => iso2ToIdAll[iso2]).filter((id) => id && id !== c.id)
}
const missing = [...UN_MEMBERS].filter((id) => !countries[id])
if (missing.length) throw new Error(`Faltan miembros ONU en Natural Earth: ${missing.join(', ')}`)

fs.writeFileSync(path.join(TMP, 'countries.geojson'), JSON.stringify({ type: 'FeatureCollection', features: countryFeatures }))
mapshaper([path.join(TMP, 'countries.geojson'), '-simplify', '40%', 'keep-shapes', '-dissolve', 'id',
  '-o', path.join(OUT, 'countries.geojson'), 'precision=0.001', 'format=geojson'])
writeJson('countries.json', countries)

// --- Regiones (admin-1) ---
const ne1 = readJson('ne_10m_admin_1_states_provinces.geojson')
const regions = {}
const regionByGeonamesCode = {} // "SV.10" -> adm1_code
const regionFeaturesByCountry = {}
const regionFeatures = []
for (const f of ne1.features) {
  const p = f.properties
  const country = neToId[p.adm0_a3]
  if (!country) continue
  const id = p.adm1_code
  regions[id] = { id, country, name: p.name_es || p.name || p.name_local || p.gn_name || id, type: p.type_en || null, areaKm2: Math.round(area(f) / 1e6 * 10) / 10 }
  if (p.gn_a1_code) regionByGeonamesCode[p.gn_a1_code] ??= id
  const feature = { type: 'Feature', properties: { id, country }, geometry: f.geometry }
  ;(regionFeaturesByCountry[country] ??= []).push({ feature, bbox: bbox(f) })
  regionFeatures.push(feature)
}
writeJson('regions.json', regions)
fs.writeFileSync(path.join(TMP, 'regions.geojson'), JSON.stringify({ type: 'FeatureCollection', features: regionFeatures }))
mapshaper([path.join(TMP, 'regions.geojson'), '-simplify', '8%', 'keep-shapes', '-split', 'country',
  '-o', path.join(OUT, 'admin1') + '/', 'precision=0.001', 'format=geojson', 'extension=json'])

// --- Asignación punto -> país/región ---
const countryIndex = countryFeatures.map((f) => ({ id: f.properties.id, feature: f, bbox: bbox(f) }))
const inBox = (b, [x, y]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
// Punto en polígono; si cae fuera (costas simplificadas), la región con el bbox más cercano.
function regionAt(country, pt) {
  const candidates = regionFeaturesByCountry[country] ?? []
  for (const r of candidates) {
    if (inBox(r.bbox, pt) && booleanPointInPolygon(pt, r.feature)) return r.feature.properties.id
  }
  let best = null
  let bestDist = 0.5 // grados; más lejos que esto no se asigna
  for (const r of candidates) {
    const dx = Math.max(r.bbox[0] - pt[0], 0, pt[0] - r.bbox[2])
    const dy = Math.max(r.bbox[1] - pt[1], 0, pt[1] - r.bbox[3])
    const d = Math.hypot(dx, dy)
    if (d < bestDist) { best = r.feature.properties.id; bestDist = d }
  }
  return best
}
function countryAt(pt) {
  for (const c of countryIndex) if (inBox(c.bbox, pt) && booleanPointInPolygon(pt, c.feature)) return c.id
  return null
}
const iso2ToId = Object.fromEntries(Object.values(countries).filter((c) => c.iso2).map((c) => [c.iso2, c.id]))

// --- Ciudades ---
const namesEs = readJson('city-names-es.json')
const cities = []
let droppedCities = 0
for (const line of fs.readFileSync(path.join(RAW, 'cities15000.txt'), 'utf8').split('\n')) {
  if (!line) continue
  const c = line.split('\t')
  const pt = [Number(c[5]), Number(c[4])]
  const country = iso2ToId[c[8]] ?? countryAt(pt)
  if (!country) { droppedCities++; continue }
  const name = namesEs[c[0]] ?? c[1]
  // [id, nombre, país, región, lon, lat, población, esCapital]
  const region = regionAt(country, pt) ?? regionByGeonamesCode[`${c[8]}.${c[10]}`] ?? null
  cities.push([Number(c[0]), name, country, region, round(pt[0]), round(pt[1]), Number(c[14]), c[7] === 'PPLC' ? 1 : 0])
}
cities.sort((a, b) => b[6] - a[6])
writeJson('cities.json', cities)

// --- Sitios UNESCO ---
const MAIN_WHS = /^\d+(bis|ter|quater|rev)?$/
const sites = new Map()
for (const r of readJson('whs.json')) {
  const whs = r.whs.value
  const num = parseInt(whs, 10)
  if (!Number.isFinite(num)) continue
  const isMain = MAIN_WHS.test(whs)
  const prev = sites.get(num)
  if (prev && (prev.isMain || !isMain)) continue
  sites.set(num, {
    isMain, name: r.es?.value ?? r.en?.value, iso2: r.iso2?.value,
    pt: [round(Number(r.lon.value)), round(Number(r.lat.value))],
  })
}
const landmarks = []
for (const [num, s] of sites) {
  if (!s.name || /^Q\d+$/.test(s.name)) continue
  const country = iso2ToId[s.iso2] ?? countryAt(s.pt)
  if (!country) continue
  // [id, nombre, país, región, lon, lat, fuente]
  landmarks.push([`whs-${num}`, s.name, country, regionAt(country, s.pt), s.pt[0], s.pt[1], 'unesco'])
}
const WONDERS = [
  ['Chichén Itzá', 'MEX', -88.5686, 20.6843], ['Cristo Redentor', 'BRA', -43.2105, -22.9519],
  ['Coliseo de Roma', 'ITA', 12.4922, 41.8902], ['Gran Muralla China', 'CHN', 116.5704, 40.4319],
  ['Machu Picchu', 'PER', -72.545, -13.1631], ['Petra', 'JOR', 35.4444, 30.3285], ['Taj Mahal', 'IND', 78.0421, 27.1751],
]
WONDERS.forEach(([name, country, lon, lat], i) =>
  landmarks.push([`wonder-${i + 1}`, name, country, regionAt(country, [lon, lat]), lon, lat, 'wonder']))
writeJson('landmarks.json', landmarks)

fs.rmSync(TMP, { recursive: true, force: true })
const kinds = Object.values(countries).reduce((a, c) => ({ ...a, [c.kind]: (a[c.kind] ?? 0) + 1 }), {})
console.log({ ...kinds, regions: Object.keys(regions).length, cities: cities.length, droppedCities, landmarks: landmarks.length })

function round(n) { return Math.round(n * 1e4) / 1e4 }
