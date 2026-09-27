// Recorrido cronológico de todas las visitas: base de las líneas de viaje y de la repetición animada.
import type { Geo } from './geo'
import { type DateRange, type Entry, type Status } from './model'

/** Estados que implican haber viajado físicamente (incluye escalas). */
export const TRAVEL_STATUSES: ReadonlySet<Status> = new Set(['lived', 'visited', 'transit'])

export interface JourneyStop {
  key: string // entry.key
  name: string
  countryId: string
  date: string // inicio del rango
  end: string
  lon: number
  lat: number
  precise: boolean // false = centro del país
}

const PRECISION: Record<Entry['type'], number> = { country: 0, region: 1, city: 2, landmark: 2, custom: 2 }

/**
 * Paradas ordenadas por fecha. Si el mismo día hay una parada precisa en un país, se omite
 * la parada genérica del país; paradas consecutivas en el mismo punto se fusionan.
 */
export function buildJourney(geo: Geo, entries: Entry[], filter: (e: Entry, r: DateRange) => boolean = () => true): JourneyStop[] {
  const raw: (JourneyStop & { precision: number })[] = []
  for (const e of entries) {
    if (!TRAVEL_STATUSES.has(e.status)) continue
    const country = geo.countries[e.countryId]
    const hasPoint = e.lon != null && e.lat != null
    if (!hasPoint && !country) continue
    for (const r of e.dates) {
      if (!r.start || !filter(e, r)) continue
      raw.push({
        key: e.key,
        name: e.name,
        countryId: e.countryId,
        date: r.start,
        end: r.end || r.start,
        lon: hasPoint ? e.lon! : country.center[0],
        lat: hasPoint ? e.lat! : country.center[1],
        precise: hasPoint,
        precision: PRECISION[e.type],
      })
    }
  }
  raw.sort((a, b) => a.date.localeCompare(b.date) || b.precision - a.precision)

  // País genérico cubierto por una parada más precisa en el mismo país y periodo.
  const covered = (s: (typeof raw)[number]) =>
    !s.precise && raw.some((o) => o.precise && o.countryId === s.countryId && o.date <= s.end && o.end >= s.date)

  const out: JourneyStop[] = []
  for (const s of raw) {
    if (covered(s)) continue
    const last = out.at(-1)
    if (last && last.lon === s.lon && last.lat === s.lat) continue
    const { precision: _p, ...stop } = s
    out.push(stop)
  }
  return out
}

// --- Geometría: arcos de círculo máximo ---

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Puntos a lo largo del círculo máximo entre a y b (longitudes "desenrolladas" para no saltar el antimeridiano). */
export function greatCircle(a: [number, number], b: [number, number], steps = 48): [number, number][] {
  const [lon1, lat1, lon2, lat2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])]
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2))
  if (d < 1e-6) return [a, b]
  const pts: [number, number][] = []
  let prevLon = a[0]
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    let lon = deg(Math.atan2(y, x))
    while (lon - prevLon > 180) lon -= 360
    while (lon - prevLon < -180) lon += 360
    prevLon = lon
    pts.push([lon, deg(Math.atan2(z, Math.sqrt(x * x + y * y)))])
  }
  return pts
}

/** Arcos entre paradas consecutivas; `progress` (0…n-1, fraccional) recorta el último arco para animar. */
export function journeyArcs(coords: [number, number][], progress = Infinity): [number, number][][] {
  const arcs: [number, number][][] = []
  for (let i = 0; i < coords.length - 1 && i < progress; i++) {
    const arc = greatCircle(coords[i], coords[i + 1])
    const frac = Math.min(1, progress - i)
    arcs.push(...splitAntimeridian(frac >= 1 ? arc : arc.slice(0, Math.max(2, Math.ceil(frac * arc.length)))))
  }
  return arcs
}

export const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180

/**
 * Corta una línea de longitudes continuas donde cruza ±180°: el mapa plano no dibuja fuera de
 * [-180, 180] (sin copias del mundo), así que cada lado se dibuja por separado.
 */
export function splitAntimeridian(points: [number, number][]): [number, number][][] {
  const segments: [number, number][][] = []
  let current: [number, number][] = []
  for (let i = 0; i < points.length; i++) {
    const [lon, lat] = points[i]
    if (i > 0) {
      const [pLon, pLat] = points[i - 1]
      const crossings = Math.floor((pLon + 180) / 360) !== Math.floor((lon + 180) / 360)
      if (crossings) {
        const edge = Math.round((lon > pLon ? lon + 180 : pLon + 180) / 360) * 360 - 180 // ±180 (desenrollado)
        const f = (edge - pLon) / (lon - pLon)
        const cLat = pLat + f * (lat - pLat)
        const side = wrapLon(pLon) >= 0 ? 180 : -180
        current.push([side, cLat])
        segments.push(current)
        current = [[-side, cLat]]
      }
    }
    current.push([wrapLon(lon), lat])
  }
  if (current.length > 1) segments.push(current)
  return segments
}
