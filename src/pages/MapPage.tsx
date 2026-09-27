import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { MapView, type MapLines, type MapSelection } from '../components/MapView'
import { ReplayBar, type ReplayState } from '../components/ReplayBar'
import { PlacePanel, countryPlace, entryPlace, regionPlace } from '../components/PlacePanel'
import { SearchBox } from '../components/SearchBox'
import { TripPanel } from '../components/TripPanel'
import { StatCard, formatPercent } from '../components/ui'
import { loadAdmin1, type Geo } from '../lib/geo'
import { readPref, writePref } from '../lib/prefs'
import { buildJourney, journeyArcs } from '../lib/journey'
import { BEEN_STATUSES, summarizeCountries, type Entry } from '../lib/model'
import type { Place } from '../lib/search'
import { summarizeTrip } from '../lib/trips'
import './MapPage.css'

const zoomFor = (p: Place) => (p.type === 'country' ? 4 : p.type === 'region' ? 5.5 : 7)

export function MapPage() {
  const { geo, entries, trips, summaries, uid, readOnly } = useAppData()
  const [params, setParams] = useSearchParams()
  const [focus, setFocus] = useState<{ lon: number; lat: number; zoom: number } | null>(null)
  const [pickCountry, setPickCountry] = useState<string | null>(null)
  const [pending, setPending] = useState<{ lon: number; lat: number; countryId: string } | null>(null)
  const [pendingName, setPendingName] = useState('')

  // El lugar abierto vive en la URL (?p=city:123) para poder enlazarlo y usar "atrás".
  const param = params.get('p')
  const current = placeFromParam(geo, entries, param)
  const tripId = params.get('viaje')
  const tripSummary = useMemo(() => {
    const trip = trips.find((t) => t.id === tripId)
    return trip ? summarizeTrip(geo, trip, entries) : null
  }, [geo, trips, entries, tripId])

  // --- Líneas de viaje y repetición ---
  const [showLines, setShowLines] = useState(() => readPref('lines'))
  const [replay, setReplay] = useState<ReplayState | null>(null)
  const journey = useMemo(() => buildJourney(geo, entries), [geo, entries])
  const journeyCoords = useMemo(() => journey.map((s) => [s.lon, s.lat] as [number, number]), [journey])
  // Arcos por tramo (un tramo puede partirse en dos al cruzar el antimeridiano).
  const allArcsByLeg = useMemo(
    () => journeyCoords.slice(1).map((c, i) => journeyArcs([journeyCoords[i], c])),
    [journeyCoords],
  )
  const allArcs = useMemo(() => allArcsByLeg.flat(), [allArcsByLeg])
  const tripJourney = useMemo(
    () => (tripId ? buildJourney(geo, entries, (_e, r) => r.tripId === tripId) : null),
    [geo, entries, tripId],
  )

  const lines = useMemo<MapLines | null>(() => {
    if (replay) {
      const i = Math.floor(replay.t)
      const arcs = allArcsByLeg.slice(0, i).flat()
      const partial = replay.t > i && i < journeyCoords.length - 1 ? journeyArcs(journeyCoords.slice(i, i + 2), replay.t - i) : []
      const headSeg = partial.at(-1)
      return {
        arcs: [...arcs, ...partial],
        stops: journeyCoords.slice(0, i + 1),
        head: headSeg ? headSeg[headSeg.length - 1] : journeyCoords[i],
        fitKey: 'replay',
        fitCoords: journeyCoords,
      }
    }
    if (tripJourney) {
      const coords = tripJourney.map((s) => [s.lon, s.lat] as [number, number])
      return { arcs: journeyArcs(coords), stops: coords, fitKey: `trip:${tripId}`, fitCoords: coords }
    }
    if (showLines) return { arcs: allArcs, stops: journeyCoords, fitKey: null }
    return null
  }, [replay, allArcs, allArcsByLeg, journeyCoords, tripJourney, tripId, showLines])

  // Durante la repetición el mapa solo pinta lo visitado hasta la fecha actual.
  const replayDate = replay ? journey[Math.floor(replay.t)]?.date ?? null : null
  const replayEntries = useMemo(() => (replayDate ? entriesUntil(entries, replayDate) : null), [entries, replayDate])
  const replaySummaries = useMemo(() => (replayEntries ? summarizeCountries(geo, replayEntries) : null), [geo, replayEntries])
  const replayCountries = replaySummaries
    ? [...replaySummaries.values()].filter((s) => s.status && BEEN_STATUSES.has(s.status) && s.country.kind === 'country').length
    : 0

  const startReplay = () => {
    closeTrip()
    setReplay({ t: 0, playing: true, speed: 1 })
  }
  function closeTrip() {
    const next = new URLSearchParams(params)
    next.delete('viaje')
    next.delete('p')
    setParams(next)
  }
  // Clics en el mapa no deben mover la cámara; el buscador, la lista y los enlaces sí.
  const skipFly = useRef(false)
  const open = (p: Place | null, fly = true) => {
    if (p) rememberPlace(p)
    skipFly.current = !fly
    const next = new URLSearchParams(params)
    if (p) next.set('p', `${p.type}:${p.id}`)
    else next.delete('p')
    setParams(next)
  }

  useEffect(() => {
    if (skipFly.current || !current) {
      skipFly.current = false
      return
    }
    const lon = current.lon ?? (current.regionId ? null : geo.countries[current.countryId]?.center[0])
    const lat = current.lat ?? (current.regionId ? null : geo.countries[current.countryId]?.center[1])
    if (lon != null && lat != null) setFocus({ lon, lat, zoom: zoomFor(current) })
    // Solo al cambiar el lugar abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param])

  const onSelect = (s: MapSelection) => {
    if (s.type === 'country') open(countryPlace(geo, s.id), false)
    else if (s.type === 'region') open(regionPlace(geo, s.id), false)
    else {
      const e = entries.find((x) => x.key === s.key)
      if (e) open(entryPlace(e), false)
    }
  }

  const onPickLocation = (lon: number, lat: number, countryId: string | null) => {
    setPickCountry(null)
    if (countryId) {
      setPending({ lon, lat, countryId })
      setPendingName('')
    }
  }

  const createCustom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pending || !pendingName.trim()) return
    const regionId = await regionAt(pending.countryId, pending.lon, pending.lat)
    const place: Place = { type: 'custom', id: crypto.randomUUID(), name: pendingName.trim(), countryId: pending.countryId, regionId, lon: pending.lon, lat: pending.lat }
    setPending(null)
    open(place, false)
  }

  const been = [...summaries.values()].filter((s) => s.status && BEEN_STATUSES.has(s.status))
  const beenCountries = been.filter((s) => s.country.kind === 'country').length

  return (
    <div className={replay ? 'map-page map-page--replay' : 'map-page'}>
      <aside className="map-page__side">
        <div className="map-page__search">
          <SearchBox geo={geo} entries={entries} onPick={(p) => open(p)} />
        </div>

        {pickCountry && (
          <div className="notice map-page__notice" role="status">
            Toca el mapa donde está el lugar.{' '}
            <button type="button" className="link-btn" onClick={() => setPickCountry(null)}>Cancelar</button>
          </div>
        )}

        {pending && (
          <form className="map-page__pending" onSubmit={createCustom}>
            <label className="field">
              <span>Nombre del lugar en {geo.countries[pending.countryId]?.name}</span>
              <input autoFocus value={pendingName} onChange={(e) => setPendingName(e.target.value)} placeholder="Mirador, restaurante, playa…" />
            </label>
            <div className="map-page__pending-actions">
              <button type="submit" className="btn btn--primary" disabled={!pendingName.trim()}>Continuar</button>
              <button type="button" className="btn" onClick={() => setPending(null)}>Cancelar</button>
            </div>
          </form>
        )}

        {current ? (
          <PlacePanel
            uid={readOnly ? null : uid}
            geo={geo}
            place={current}
            entries={entries}
            trips={trips}
            summaries={summaries}
            onOpen={(p) => open(p)}
            onClose={() => open(null)}
            closeLabel={tripSummary ? `Volver a ${tripSummary.trip.name}` : undefined}
            defaultTripId={tripSummary?.trip.id ?? null}
            onStartPick={readOnly ? undefined : (id) => setPickCountry(id)}
          />
        ) : tripSummary ? (
          <TripPanel
            uid={readOnly ? null : uid}
            geo={geo}
            summary={tripSummary}
            entries={entries}
            onOpen={(p) => open(p)}
            onClose={closeTrip}
            onDeleted={closeTrip}
          />
        ) : (
          <div className="map-page__overview">
            <div className="map-page__stats">
              <StatCard label="Países ONU" value={`${beenCountries}/193`} meta={formatPercent((beenCountries / 193) * 100) + ' del mundo'} />
              <StatCard label="Lugares" value={entries.filter((e) => e.type !== 'country' && e.type !== 'region').length} meta="ciudades y lugares" />
            </div>
            <div className="map-page__journey">
              <button type="button" className="btn btn--ink" disabled={journey.length < 2} onClick={startReplay}>
                ▶ Repetir mis viajes
              </button>
              <label className="map-page__toggle">
                <button
                  type="button"
                  className="toggle"
                  role="switch"
                  aria-checked={showLines}
                  aria-label="Mostrar líneas de viaje"
                  onClick={() => {
                    setShowLines(!showLines)
                    writePref('lines', !showLines)
                  }}
                />
                <span className="mono">Líneas de viaje</span>
              </label>
              {journey.length < 2 && (
                <p className="mono muted map-page__hint">Añade fechas a dos o más lugares para ver tus líneas de viaje.</p>
              )}
            </div>
            <p className="mono muted map-page__hint">
              {readOnly ? 'Toca un país para ver detalles.' : 'Busca un lugar o toca un país en el mapa para añadirlo.'}
            </p>
          </div>
        )}
      </aside>

      <section className="map-page__map" aria-label="Mapa">
        <MapView
          geo={geo}
          entries={replayEntries ?? entries}
          summaries={replaySummaries ?? summaries}
          selectedCountry={replay ? null : current?.countryId ?? null}
          focus={focus}
          onSelect={onSelect}
          picking={!!pickCountry}
          onPickLocation={onPickLocation}
          lines={lines}
          replaying={!!replay}
        />
        {replay && (
          <ReplayBar
            geo={geo}
            stops={journey}
            state={replay}
            countriesSoFar={replayCountries}
            onChange={setReplay}
            onClose={() => setReplay(null)}
          />
        )}
      </section>
    </div>
  )
}

function placeFromParam(geo: Geo, entries: ReturnType<typeof useAppData>['entries'], param: string | null): Place | null {
  if (!param) return null
  const i = param.indexOf(':')
  const type = param.slice(0, i)
  const id = param.slice(i + 1)
  const entry = entries.find((e) => e.key === param)
  if (entry) return entryPlace(entry)
  if (type === 'country' && geo.countries[id]) return countryPlace(geo, id)
  if (type === 'region' && geo.regions[id]) return regionPlace(geo, id)
  // Ciudades/lugares elegidos en el buscador que aún no tienen entrada.
  return pendingPlaces.get(param) ?? null
}

const pendingPlaces = new Map<string, Place>()
function rememberPlace(p: Place) {
  pendingPlaces.set(`${p.type}:${p.id}`, p)
}

async function regionAt(countryId: string, lon: number, lat: number): Promise<string | null> {
  const fc = await loadAdmin1(countryId)
  const f = fc?.features.find((x) => booleanPointInPolygon([lon, lat], x))
  return f?.properties.id ?? null
}

/** Entradas recortadas a las fechas que empiezan en o antes de `date` (solo las que tienen fechas). */
function entriesUntil(entries: Entry[], date: string): Entry[] {
  const out: Entry[] = []
  for (const e of entries) {
    const dates = e.dates.filter((d) => d.start <= date)
    if (dates.length) out.push({ ...e, dates })
  }
  return out
}
