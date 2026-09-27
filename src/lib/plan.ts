// Planificador de viajes: tipos y cálculos puros (itinerario, distancias, presupuesto, checklist, cierre).
// El plan vive en users/{uid}/plans/{tripId}, privado: nunca se muestra en links compartidos.
import type { Geo } from './geo'
import { emptyEntry, entryKey, BEEN_STATUSES, type Entry, type PlaceType } from './model'
import type { Place } from './search'
import { locale, t, translated } from './i18n'

export interface PlanPlace {
  type: PlaceType
  id: string
  name: string
  countryId: string
  regionId: string | null
  lon: number | null
  lat: number | null
}

export interface Activity {
  id: string
  day: number // días desde la llegada a la parada (0 = día de llegada)
  time: string | null // HH:MM
  text: string
  done: boolean
}

export interface PlanStop {
  id: string
  place: PlanPlace
  nights: number // 0 = de paso (mismo día)
  activities: Activity[]
}

export const BOOKING_KINDS = ['flight', 'lodging', 'transport', 'activity', 'food', 'other'] as const
export type BookingKind = (typeof BOOKING_KINDS)[number]

export const BOOKING_KIND_LABEL = translated<BookingKind>({
  flight: 'Vuelo',
  lodging: 'Alojamiento',
  transport: 'Transporte',
  activity: 'Actividad',
  food: 'Comida',
  other: 'Otro',
})

export interface Booking {
  id: string
  kind: BookingKind
  title: string
  amount: number | null
  currency: string
  paid: boolean
  date: string | null // YYYY-MM-DD
  confirmation: string
  url: string
  stopId: string | null
}

export const CHECK_GROUPS = ['docs', 'health', 'luggage', 'other'] as const
export type CheckGroup = (typeof CHECK_GROUPS)[number]

export const CHECK_GROUP_LABEL = translated<CheckGroup>({
  docs: 'Documentos',
  health: 'Salud',
  luggage: 'Maleta',
  other: 'Antes de salir',
})

export interface CheckItem {
  id: string
  group: CheckGroup
  text: string
  done: boolean
}

export interface TripPlan {
  tripId: string
  start: string | null // YYYY-MM-DD
  travelers: number
  currency: string
  stops: PlanStop[]
  bookings: Booking[]
  checklist: CheckItem[]
  /** El cierre ya se resolvió (paradas marcadas como visitadas, o descartado). */
  closed: boolean
  updatedAt: number
}

export const newId = () => crypto.randomUUID().slice(0, 8)

export function emptyPlan(tripId: string, currency = 'USD'): TripPlan {
  return { tripId, start: null, travelers: 1, currency, stops: [], bookings: [], checklist: [], closed: false, updatedAt: Date.now() }
}

export function planPlace(p: Place): PlanPlace {
  return { type: p.type, id: p.id, name: p.name, countryId: p.countryId, regionId: p.regionId, lon: p.lon, lat: p.lat }
}

export const stopKey = (s: PlanStop) => entryKey(s.place.type, s.place.id)

// --- Fechas ---

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface ScheduledStop {
  stop: PlanStop
  index: number
  arrive: number // índice de día (0 = primer día del viaje)
  depart: number
  arriveDate: string | null
  departDate: string | null
}

export interface Schedule {
  stops: ScheduledStop[]
  totalDays: number
  start: string | null
  end: string | null
}

/** Las paradas van seguidas: se sale de una el mismo día que se llega a la siguiente. */
export function schedule(plan: Pick<TripPlan, 'start' | 'stops'>): Schedule {
  let day = 0
  const stops = plan.stops.map((stop, index) => {
    const arrive = day
    const depart = arrive + Math.max(0, stop.nights)
    day = depart
    return {
      stop,
      index,
      arrive,
      depart,
      arriveDate: plan.start ? addDays(plan.start, arrive) : null,
      departDate: plan.start ? addDays(plan.start, depart) : null,
    }
  })
  const totalDays = stops.length ? day + 1 : 0
  return { stops, totalDays, start: plan.start, end: plan.start && totalDays ? addDays(plan.start, totalDays - 1) : null }
}

export interface PlanDay {
  index: number
  date: string | null
  stops: ScheduledStop[] // más de una = día de traslado
  activities: { stop: ScheduledStop; activity: Activity }[]
}

export function planDays(s: Schedule): PlanDay[] {
  const days: PlanDay[] = []
  for (let d = 0; d < s.totalDays; d++) {
    const here = s.stops.filter((x) => x.arrive <= d && d <= x.depart)
    const activities = here
      // Si se acortó la estancia, las actividades de días que ya no existen caen en el último día.
      .flatMap((stop) => stop.stop.activities.filter((a) => stop.arrive + Math.min(a.day, stop.stop.nights) === d).map((activity) => ({ stop, activity })))
      .sort((a, b) => (a.activity.time ?? '99').localeCompare(b.activity.time ?? '99'))
    days.push({ index: d, date: s.start ? addDays(s.start, d) : null, stops: here, activities })
  }
  return days
}

// --- Distancias entre paradas ---

export function stopCoords(geo: Geo, p: PlanPlace): [number, number] | null {
  if (p.lon != null && p.lat != null) return [p.lon, p.lat]
  // Regiones y países sin coordenadas propias: el centro del país.
  const c = geo.countries[p.countryId]
  return c ? c.center : null
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLon = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface Leg {
  km: number
  hours: number
  mode: 'ground' | 'flight'
}

/** Estimación gruesa: por tierra hasta 600 km (~90 km/h sobre un 20 % más de recorrido), en avión más allá (800 km/h + 2 h de aeropuerto). */
export function estimateLeg(km: number): Leg {
  if (km <= 600) return { km, hours: (km * 1.2) / 90, mode: 'ground' } // la carretera no va en línea recta
  return { km, hours: km / 800 + 2, mode: 'flight' }
}

export function formatHours(h: number): string {
  if (h < 1) return `~${Math.max(5, Math.round((h * 60) / 5) * 5)} min`
  const whole = Math.floor(h)
  const min = Math.round(((h - whole) * 60) / 15) * 15
  return min === 60 ? `~${whole + 1} h` : min ? `~${whole} h ${min}` : `~${whole} h`
}

// --- Presupuesto ---

export interface CurrencyTotal {
  currency: string
  total: number
  paid: number
}

/** Totales por moneda (sin convertir: los tipos de cambio cambian y la app funciona sin conexión). */
export function budgetTotals(bookings: Booking[]): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>()
  for (const b of bookings) {
    if (b.amount == null || !Number.isFinite(b.amount)) continue
    const cur = map.get(b.currency) ?? { currency: b.currency, total: 0, paid: 0 }
    cur.total += b.amount
    if (b.paid) cur.paid += b.amount
    map.set(b.currency, cur)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

// --- Checklist ---

/** Lista sugerida según el viaje: pasaporte con la fecha mínima de vencimiento, países a revisar, días de ropa. */
export function suggestedChecklist(geo: Geo, plan: TripPlan): CheckItem[] {
  const s = schedule(plan)
  const countries = [...new Set(plan.stops.map((x) => x.place.countryId))].map((id) => geo.countries[id]?.name ?? id)
  const list = countries.join(', ')
  const currencies = [...new Set(plan.stops.map((x) => geo.countries[x.place.countryId]?.currency?.code).filter(Boolean))].join(', ')
  const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
  const passport = s.end
    ? t('Pasaporte vigente hasta después del {date} (muchos países piden 6 meses)', { date: longDate(addDays(s.end, 183)) })
    : t('Pasaporte vigente (muchos países piden 6 meses después del regreso)')
  const items: [CheckGroup, string][] = [
    ['docs', passport],
    ['docs', countries.length ? t('Visas o permisos de entrada: {countries}', { countries: list }) : t('Visas o permisos de entrada')],
    ['docs', t('Seguro de viaje')],
    ['docs', t('Copias digitales de documentos y reservas')],
    ['docs', t('Licencia de conducir (e internacional si vas a manejar)')],
    ['health', countries.length ? t('Vacunas y requisitos sanitarios: {countries}', { countries: list }) : t('Vacunas y requisitos sanitarios')],
    ['health', t('Medicinas habituales y recetas')],
    ['health', t('Botiquín básico')],
    ['luggage', s.totalDays ? t('Ropa para {n} días', { n: s.totalDays }) : t('Ropa')],
    ['luggage', t('Adaptador de enchufe')],
    ['luggage', t('Cargadores y batería externa')],
    ['luggage', t('Artículos de aseo')],
    ['other', t('Avisar al banco y llevar una tarjeta sin comisión')],
    ['other', currencies ? t('Efectivo en moneda local ({currencies})', { currencies }) : t('Efectivo en moneda local')],
    ['other', t('eSIM o roaming')],
    ['other', t('Descargar mapas sin conexión')],
  ]
  return items.map(([group, text]) => ({ id: newId(), group, text, done: false }))
}

/** Añade los ítems cuyo texto aún no está en la lista. */
export function mergeChecklist(current: CheckItem[], extra: CheckItem[]): CheckItem[] {
  const seen = new Set(current.map((i) => i.text.trim().toLowerCase()))
  return [...current, ...extra.filter((i) => !seen.has(i.text.trim().toLowerCase())).map((i) => ({ ...i, id: newId(), done: false }))]
}

// --- Cierre del viaje ---

/** El viaje ya terminó y aún no se resolvió qué hacer con sus paradas. */
export function needsClosing(plan: TripPlan, today = todayIso()): boolean {
  const { end } = schedule(plan)
  return !plan.closed && plan.stops.length > 0 && !!end && end < today
}

/**
 * Entradas a escribir al cerrar el viaje: cada parada elegida pasa a «Visitado» (salvo que ya fuera
 * Vivido/Visitado) con sus fechas asociadas al viaje.
 */
export function closingEntries(plan: TripPlan, entries: Entry[], stopIds: Set<string>): Entry[] {
  const s = schedule(plan)
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const out = new Map<string, Entry>()
  for (const x of s.stops) {
    if (!stopIds.has(x.stop.id) || !x.arriveDate || !x.departDate) continue
    const key = stopKey(x.stop)
    const p = x.stop.place
    const base = out.get(key) ?? byKey.get(key) ?? emptyEntry(p.type, p.id, { name: p.name, countryId: p.countryId, regionId: p.regionId, lon: p.lon, lat: p.lat })
    const range = { start: x.arriveDate, end: x.departDate, tripId: plan.tripId }
    const has = base.dates.some((d) => d.start === range.start && d.end === range.end)
    out.set(key, {
      ...base,
      status: BEEN_STATUSES.has(base.status) && byKey.has(key) ? base.status : 'visited',
      dates: has ? base.dates : [...base.dates, range].sort((a, b) => a.start.localeCompare(b.start)),
    })
  }
  return [...out.values()]
}

/** Una entrada «Planeado» creada por el planificador y sin nada propio: se puede borrar al quitar la parada. */
export function isBarePlanned(e: Entry): boolean {
  return (
    e.status === 'planned' && e.dates.length === 0 && !e.description && !e.people && e.tags.length === 0 &&
    e.rating == null && !e.photoPath && !(e.photos?.length)
  )
}
