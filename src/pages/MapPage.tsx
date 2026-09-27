import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { MapView, type MapFocus, type MapLines, type MapSelection } from '../components/MapView'
import { ReplayBar, type ReplayState } from '../components/ReplayBar'
import { PlacePanel, countryPlace, entryPlace, regionPlace } from '../components/PlacePanel'
import { QuickMarkPanel, toggleCountry } from '../components/QuickMark'
import { SearchBox } from '../components/SearchBox'
import { TripPanel } from '../components/TripPanel'
import { StatCard, formatPercent } from '../components/ui'
import { countryBBox, loadAdmin1, regionBBox, type Geo } from '../lib/geo'
import { readPref, writePref } from '../lib/prefs'
import { buildJourney, journeyArcs } from '../lib/journey'
import { BEEN_STATUSES, summarizeCountries, type Entry, type Status } from '../lib/model'
import type { Place } from '../lib/search'
import { useGazetteer, type Gazetteer } from '../lib/suggestions'
import { summarizeTrip } from '../lib/trips'
import { t } from '../lib/i18n'
import './MapPage.css'

/**
 * Encuadre al abrir un lugar: se ve entero lo que se marca. Una ciudad o un lugar encuadran su región
 * (marcar San Antonio marca Texas), una región se ve completa y un país, con sus islas cercanas.
 */
async function focusFor(geo: Geo, p: Place): Promise<MapFocus | null> {
  const point: [number, number] | null = p.lon != null && p.lat != null ? [p.lon, p.lat] : null
  let box = p.regionId ? await regionBBox(p.countryId, p.regionId) : null
  // Sin región (microestados, lugares sin región): el país.
  box ??= p.type === 'country' || !p.regionId ? countryBBox(geo, p.countryId) : null
  if (box) {
    if (point) box = [Math.min(box[0], point[0]), Math.min(box[1], point[1]), Math.max(box[2], point[0]), Math.max(box[3], point[1])]
    return { bounds: box, maxZoom: p.type === 'country' ? 6 : 7 }
  }
  return point ? { center: point, zoom: 5 } : null
}

export function MapPage() {
  const { geo, entries, trips, summaries, uid, readOnly, basePath, sharedTripId } = useAppData()
  const [params, setParams] = useSearchParams()
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [pickCountry, setPickCountry] = useState<string | null>(null)
  const [pending, setPending] = useState<{ lon: number; lat: number; countryId: string } | null>(null)
  const [pendingName, setPendingName] = useState('')

  // El lugar abierto vive en la URL (?p=city:123) para poder enlazarlo y usar "atrás".
  const param = params.get('p')
  const gazetteer = useGazetteer()
  const current = placeFromParam(geo, entries, param, gazetteer)
  // En un link de viaje, ese viaje queda abierto por defecto.
  const tripId = params.get('viaje') ?? sharedTripId
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
    let cancelled = false
    void focusFor(geo, current).then((f) => {
      if (!cancelled && f) setFocus(f)
    })
    return () => {
      cancelled = true
    }
    // Solo al cambiar el lugar abierto (o cuando termina de resolverse desde el nomenclátor).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, current == null])

  // --- Marcado rápido ---
  const [quick, setQuick] = useState<Status | null>(null)
  const [quickMsg, setQuickMsg] = useState<string | null>(null)

  const onSelect = (s: MapSelection) => {
    if (quick) {
      const id = s.type === 'country' ? s.id : s.type === 'region' ? s.countryId : null
      if (id && uid && !readOnly) {
        const r = toggleCountry(uid, geo, entries, id, quick)
        setQuickMsg(r === 'kept' ? t('{country} tiene fechas o notas: ábrelo desde el mapa normal para quitarlo.', { country: geo.countries[id]?.name ?? id }) : null)
      }
      return
    }
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
        {!quick && (
          <div className="map-page__search">
            <SearchBox geo={geo} entries={entries} onPick={(p) => open(p)} />
          </div>
        )}

        {pickCountry && (
          <div className="notice map-page__notice" role="status">
            {t('Toca el mapa donde está el lugar.')}{' '}
            <button type="button" className="link-btn" onClick={() => setPickCountry(null)}>{t('Cancelar')}</button>
          </div>
        )}

        {pending && (
          <form className="map-page__pending" onSubmit={createCustom}>
            <label className="field">
              <span>{t('Nombre del lugar en {country}', { country: geo.countries[pending.countryId]?.name ?? '' })}</span>
              <input autoFocus value={pendingName} onChange={(e) => setPendingName(e.target.value)} placeholder={t('Mirador, restaurante, playa…')} />
            </label>
            <div className="map-page__pending-actions">
              <button type="submit" className="btn btn--primary" disabled={!pendingName.trim()}>{t('Continuar')}</button>
              <button type="button" className="btn" onClick={() => setPending(null)}>{t('Cancelar')}</button>
            </div>
          </form>
        )}

        {quick && uid ? (
          <QuickMarkPanel
            uid={uid}
            geo={geo}
            entries={entries}
            summaries={summaries}
            status={quick}
            onStatus={setQuick}
            message={quickMsg}
            onDone={() => {
              setQuick(null)
              setQuickMsg(null)
            }}
          />
        ) : current ? (
          <PlacePanel
            uid={readOnly ? null : uid}
            geo={geo}
            place={current}
            entries={entries}
            trips={trips}
            summaries={summaries}
            onOpen={(p) => open(p)}
            onClose={() => open(null)}
            closeLabel={tripSummary ? t('Volver a {trip}', { trip: tripSummary.trip.name }) : undefined}
            defaultTripId={tripSummary?.trip.id ?? null}
            basePath={basePath}
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
              <StatCard label={t('Países ONU')} value={`${beenCountries}/193`} meta={t('{p} del mundo', { p: formatPercent((beenCountries / 193) * 100) })} />
              <StatCard label={t('Lugares')} value={entries.filter((e) => e.type !== 'country' && e.type !== 'region').length} meta={t('ciudades y lugares')} />
            </div>
            <div className="map-page__journey">
              <div className="map-page__actions">
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      closeTrip()
                      setQuick('visited')
                    }}
                  >
                    {t('Marcado rápido')}
                  </button>
                )}
                <button type="button" className="btn btn--ink" disabled={journey.length < 2} onClick={startReplay}>
                  ▶ {t('Repetir mis viajes')}
                </button>
              </div>
              <label className="map-page__toggle">
                <button
                  type="button"
                  className="toggle"
                  role="switch"
                  aria-checked={showLines}
                  aria-label={t('Mostrar líneas de viaje')}
                  onClick={() => {
                    setShowLines(!showLines)
                    writePref('lines', !showLines)
                  }}
                />
                <span className="mono">{t('Líneas de viaje')}</span>
              </label>
              {journey.length < 2 && (
                <p className="mono muted map-page__hint">{t('Añade fechas a dos o más lugares para ver tus líneas de viaje.')}</p>
              )}
            </div>
            <p className="mono muted map-page__hint">
              {readOnly ? t('Toca un país para ver detalles.') : t('Busca un lugar o toca un país en el mapa para añadirlo.')}
            </p>
          </div>
        )}
      </aside>

      <section className="map-page__map" aria-label={t('Mapa')}>
        <MapView
          geo={geo}
          entries={replayEntries ?? entries}
          summaries={replaySummaries ?? summaries}
          selectedCountry={replay || quick ? null : current?.countryId ?? null}
          selectedRegion={replay || quick ? null : current?.regionId ?? null}
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

function placeFromParam(geo: Geo, entries: ReturnType<typeof useAppData>['entries'], param: string | null, gz: Gazetteer | null): Place | null {
  if (!param) return null
  const i = param.indexOf(':')
  const type = param.slice(0, i)
  const id = param.slice(i + 1)
  const entry = entries.find((e) => e.key === param)
  if (entry) return entryPlace(entry)
  if (type === 'country' && geo.countries[id]) return countryPlace(geo, id)
  if (type === 'region' && geo.regions[id]) return regionPlace(geo, id)
  // Ciudades/lugares sin entrada: elegidos en el buscador o abiertos desde un enlace (sugerencias, recarga).
  const pending = pendingPlaces.get(param)
  if (pending) return pending
  if (type === 'city') {
    const c = gz?.cities.find((r) => String(r[0]) === id)
    if (c) return { type: 'city', id, name: c[1], countryId: c[2], regionId: c[3], lon: c[4], lat: c[5], population: c[6] }
  }
  if (type === 'landmark') {
    const l = gz?.landmarks.find((r) => r[0] === id)
    if (l) return { type: 'landmark', id, name: l[1], countryId: l[2], regionId: l[3], lon: l[4], lat: l[5], source: l[6] }
  }
  return null
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
