// Exportación (CSV, JSON) e importación de copias de seguridad.
import { CONTINENTS, type Geo } from './geo'
import { PLACE_TYPE_LABEL, STATUSES, STATUS_LABEL, rangeDays, type Entry, type PlaceType, type Trip } from './model'

export function download(filename: string, data: Blob) {
  const url = URL.createObjectURL(data)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Fecha local YYYY-MM-DD (toISOString daría la fecha UTC).
export const today = () => new Date().toLocaleDateString('sv')

// --- CSV ---

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Una fila por rango de fechas (o una sola fila si el lugar no tiene fechas). BOM para que Excel lea UTF-8. */
export function entriesToCsv(geo: Geo, entries: Entry[], trips: Trip[]): Blob {
  const tripName = new Map(trips.map((t) => [t.id, t.name]))
  const header = ['tipo', 'nombre', 'pais', 'region', 'continente', 'estado', 'desde', 'hasta', 'dias', 'viaje', 'etiquetas', 'valoracion', 'con_quien', 'descripcion', 'fotos', 'lat', 'lon', 'clave']
  const rows = [header]
  const sorted = [...entries].sort((a, b) => (a.dates[0]?.start ?? '9').localeCompare(b.dates[0]?.start ?? '9') || a.name.localeCompare(b.name, 'es'))
  for (const e of sorted) {
    const country = geo.countries[e.countryId]
    const base = [
      PLACE_TYPE_LABEL[e.type], e.name, country?.name ?? e.countryId, e.regionId ? geo.regions[e.regionId]?.name ?? '' : '',
      country ? CONTINENTS[country.continent] : '', STATUS_LABEL[e.status],
    ]
    const tail = [e.tags.join(', '), e.rating ?? '', e.people, e.description, e.photos?.length ?? (e.photoPath ? 1 : 0), e.lat ?? '', e.lon ?? '', e.key]
    if (e.dates.length === 0) rows.push([...base, '', '', '', '', ...tail].map(String))
    for (const r of e.dates) {
      rows.push([...base, r.start, r.end || r.start, String(rangeDays(r)), r.tripId ? tripName.get(r.tripId) ?? '' : '', ...tail].map(String))
    }
  }
  const text = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  return new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
}

// --- JSON ---

export interface Backup {
  app: 'wxlter-mapa'
  version: 1
  exportedAt: string
  entries: Entry[]
  trips: Trip[]
}

export function backupToJson(entries: Entry[], trips: Trip[]): Blob {
  const backup: Backup = { app: 'wxlter-mapa', version: 1, exportedAt: new Date().toISOString(), entries, trips }
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
}

const TYPES: PlaceType[] = ['country', 'region', 'city', 'landmark', 'custom']
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Valida una copia de seguridad; devuelve un mensaje de error en español si no sirve. */
export function parseBackup(text: string): { backup: Backup } | { error: string } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { error: 'El archivo no es JSON válido. Elige un archivo exportado desde esta app.' }
  }
  const b = data as Partial<Backup>
  if (b?.app !== 'wxlter-mapa' || !Array.isArray(b.entries) || !Array.isArray(b.trips)) {
    return { error: 'El archivo no es una copia de seguridad de este mapa. Usa el JSON de «Copia de seguridad».' }
  }
  for (const e of b.entries) {
    const ok =
      typeof e?.key === 'string' && TYPES.includes(e.type) && typeof e.placeId === 'string' && typeof e.name === 'string' &&
      typeof e.countryId === 'string' && (STATUSES as readonly string[]).includes(e.status) && Array.isArray(e.dates) &&
      e.dates.every((d) => DATE.test(d?.start) && DATE.test(d?.end || d?.start)) && e.key === `${e.type}:${e.placeId}`
    if (!ok) return { error: `La entrada «${e?.name ?? e?.key ?? '?'}» está incompleta o dañada. Revisa el archivo.` }
  }
  for (const t of b.trips) {
    if (typeof t?.id !== 'string' || typeof t.name !== 'string') return { error: 'Un viaje del archivo está incompleto. Revisa el archivo.' }
  }
  return { backup: b as Backup }
}

/** Escribe la copia en Firestore (sobrescribe entradas y viajes con la misma clave), en lotes de 400. */
export async function restoreBackup(uid: string, backup: Backup) {
  // Firebase se carga aquí para que el resto del módulo (CSV, validación) no dependa de él.
  const [{ writeBatch, doc, collection }, { writeEntry }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('./data'),
    import('./firebase'),
  ])
  // Valores por defecto para copias de versiones anteriores a las que les falte algún campo.
  const tripDefaults: Partial<Trip> = { description: '', createdAt: Date.now() }
  const entryDefaults: Partial<Entry> = {
    tags: [], description: '', rating: null, people: '', photoPath: null, percentOverride: null,
    priority: null, regionId: null, lon: null, lat: null, createdAt: Date.now(),
  }
  const trips = backup.trips.map((t) => ({ ...tripDefaults, ...t, updatedAt: Date.now() }) as Trip)
  const entries = backup.entries.map((e) => ({ ...entryDefaults, ...e }) as Entry)
  // Cada entrada son 2 escrituras (entrada + notas): lotes de 200 para no pasar el límite de 500.
  for (let i = 0; i < trips.length; i += 400) {
    const batch = writeBatch(db)
    for (const t of trips.slice(i, i + 400)) batch.set(doc(collection(db, 'users', uid, 'trips'), t.id), t)
    await batch.commit()
  }
  for (let i = 0; i < entries.length; i += 200) {
    const batch = writeBatch(db)
    for (const e of entries.slice(i, i + 200)) writeEntry(batch, uid, e)
    await batch.commit()
  }
}
