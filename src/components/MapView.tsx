import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Vite empaqueta el worker de MapLibre aparte; su ruta relativa por defecto no sobrevive al bundling.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'
import { loadAdmin1, type Geo } from '../lib/geo'
import { BEEN_STATUSES, type CountrySummary, type Entry } from '../lib/model'
import './MapView.css'

export type MapSelection =
  | { type: 'country'; id: string }
  | { type: 'region'; id: string; countryId: string }
  | { type: 'point'; key: string }

interface Props {
  geo: Geo
  entries: Entry[]
  summaries: Map<string, CountrySummary>
  selectedCountry: string | null
  focus: { lon: number; lat: number; zoom: number } | null
  onSelect: (s: MapSelection) => void
  /** Modo "marcar lugar propio": el siguiente clic devuelve la coordenada. */
  picking?: boolean
  onPickLocation?: (lon: number, lat: number, countryId: string | null) => void
}

maplibregl.setWorkerUrl(workerUrl)

const C = { faro: '#FFDB00', ink: '#111111', paper: '#F4F3EF', white: '#FFFFFF', ash: '#C9C9C2', smoke: '#6B6B63' }

/** Patrones de relleno dibujados en canvas (sin colores fuera de la paleta). */
function makePattern(kind: 'hatch-faro' | 'hatch-ink' | 'dots'): ImageData {
  const size = 12
  const ctx = new OffscreenCanvas(size, size).getContext('2d')!
  ctx.fillStyle = C.white
  ctx.fillRect(0, 0, size, size)
  if (kind === 'dots') {
    ctx.fillStyle = C.ink
    ctx.fillRect(5, 5, 2, 2)
  } else {
    ctx.strokeStyle = kind === 'hatch-faro' ? C.faro : C.ink
    ctx.lineWidth = kind === 'hatch-faro' ? 4 : 1.2
    ctx.beginPath()
    for (const o of [-size, 0, size]) {
      ctx.moveTo(o, size)
      ctx.lineTo(o + size, 0)
    }
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, size, size)
}

export function MapView({ geo, entries, summaries, selectedCountry, focus, onSelect, picking = false, onPickLocation }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [globe, setGlobe] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const selectedRef = useRef(selectedCountry)
  selectedRef.current = selectedCountry
  const pickRef = useRef({ picking, onPickLocation })
  pickRef.current = { picking, onPickLocation }

  // --- Inicialización ---
  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': C.paper } }],
      },
      center: [-40, 20],
      zoom: 1.4,
      minZoom: 0.8,
      maxZoom: 11,
      attributionControl: false,
      dragRotate: false,
      renderWorldCopies: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Natural Earth · GeoNames · Wikidata' }))
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    mapRef.current = map
    if (import.meta.env.DEV) Object.assign(window, { __map: map })

    map.on('load', () => {
      map.addImage('hatch-faro', makePattern('hatch-faro'))
      map.addImage('hatch-ink', makePattern('hatch-ink'))
      map.addImage('dots', makePattern('dots'))

      map.addSource('countries', { type: 'geojson', data: geo.shapes, promoteId: 'id' })
      map.addSource('regions', { type: 'geojson', data: emptyFc(), promoteId: 'id' })
      map.addSource('points', { type: 'geojson', data: emptyFc() })

      map.addLayer({
        id: 'country-fill',
        type: 'fill',
        source: 'countries',
        paint: {
          'fill-color': [
            'match', ['get', 'status'],
            'lived', C.ink,
            'visited', C.faro,
            C.white,
          ],
          'fill-opacity': ['case', ['boolean', ['get', 'partial'], false], 0.45, 1],
        },
      })
      map.addLayer({
        id: 'country-pattern',
        type: 'fill',
        source: 'countries',
        filter: ['in', ['get', 'status'], ['literal', ['transit', 'planned', 'wishlist']]],
        paint: {
          'fill-pattern': ['match', ['get', 'status'], 'transit', 'hatch-faro', 'planned', 'hatch-ink', 'dots'],
        },
      })
      map.addLayer({
        id: 'region-fill',
        type: 'fill',
        source: 'regions',
        filter: ['==', ['get', 'visited'], true],
        paint: { 'fill-color': C.faro },
      })
      map.addLayer({
        id: 'region-line',
        type: 'line',
        source: 'regions',
        paint: { 'line-color': C.ink, 'line-width': 0.4, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.2, 5, 0.6] },
      })
      map.addLayer({
        id: 'country-line',
        type: 'line',
        source: 'countries',
        paint: { 'line-color': C.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 6, 1.2] },
      })
      map.addLayer({
        id: 'country-selected',
        type: 'line',
        source: 'countries',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': C.ink, 'line-width': 3 },
      })
      map.addLayer({
        id: 'points',
        type: 'circle',
        source: 'points',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 6, 6],
          'circle-color': ['match', ['get', 'status'], 'lived', C.ink, 'visited', C.faro, C.white],
          'circle-stroke-color': ['match', ['get', 'status'], 'lived', C.faro, C.ink],
          'circle-stroke-width': 2,
        },
      })

      const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'map-tip', offset: 10 })
      const showTip = (e: MapLayerMouseEvent, text: string) => {
        map.getCanvas().style.cursor = 'pointer'
        hoverPopup.setLngLat(e.lngLat).setText(text).addTo(map)
      }
      const hideTip = () => {
        map.getCanvas().style.cursor = ''
        hoverPopup.remove()
      }
      map.on('mousemove', 'country-fill', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined
        if (id && !map.queryRenderedFeatures(e.point, { layers: ['points'] }).length) showTip(e, geo.countries[id]?.name ?? id)
      })
      map.on('mouseleave', 'country-fill', hideTip)
      map.on('mousemove', 'points', (e) => showTip(e, String(e.features?.[0]?.properties?.name ?? '')))
      map.on('mouseleave', 'points', hideTip)

      map.on('click', (e) => {
        if (pickRef.current.picking) {
          const [c] = map.queryRenderedFeatures(e.point, { layers: ['country-fill'] })
          return pickRef.current.onPickLocation?.(e.lngLat.lng, e.lngLat.lat, (c?.properties?.id as string) ?? null)
        }
        const [point] = map.queryRenderedFeatures(e.point, { layers: ['points'] })
        if (point) return onSelectRef.current({ type: 'point', key: String(point.properties.key) })
        const [region] = map.queryRenderedFeatures(e.point, { layers: ['region-line', 'region-fill'] })
        const [country] = map.queryRenderedFeatures(e.point, { layers: ['country-fill'] })
        const countryId = country?.properties?.id as string | undefined
        // Con un país seleccionado y zoom suficiente, el clic elige la región.
        if (region && countryId && countryId === selectedRef.current && map.getZoom() >= 3.5) {
          return onSelectRef.current({ type: 'region', id: String(region.properties.id), countryId })
        }
        if (countryId) onSelectRef.current({ type: 'country', id: countryId })
      })
      setReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // El mapa se crea una sola vez; los datos se sincronizan en los efectos de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Estado de países ---
  useEffect(() => {
    if (!ready) return
    const features = geo.shapes.features.map((f) => {
      const s = summaries.get(f.properties.id)
      const partial = !!s && s.status != null && BEEN_STATUSES.has(s.status) && !s.percentIsManual && s.visitedRegionIds.size > 0 && s.percent < 99.5
      return { ...f, properties: { id: f.properties.id, status: s?.status ?? null, partial } }
    })
    ;(mapRef.current!.getSource('countries') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  }, [ready, geo, summaries])

  // --- Regiones visitadas (+ todas las del país seleccionado) ---
  const regionCountries = useMemo(() => {
    const ids = new Set<string>()
    for (const [id, s] of summaries) if (s.visitedRegionIds.size > 0 && !s.percentIsManual) ids.add(id)
    if (selectedCountry) ids.add(selectedCountry)
    return [...ids].sort()
  }, [summaries, selectedCountry])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    Promise.all(regionCountries.map(loadAdmin1)).then((collections) => {
      if (cancelled) return
      const features: Feature<Polygon | MultiPolygon, { id: string; visited: boolean }>[] = []
      for (const fc of collections) {
        if (!fc) continue
        for (const f of fc.features) {
          const visited = summaries.get(f.properties.country)?.visitedRegionIds.has(f.properties.id) ?? false
          if (visited || f.properties.country === selectedCountry) features.push({ ...f, properties: { id: f.properties.id, visited } })
        }
      }
      ;(mapRef.current!.getSource('regions') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
    })
    return () => {
      cancelled = true
    }
  }, [ready, regionCountries, summaries, selectedCountry])

  // --- Puntos (ciudades, lugares, lugares propios) ---
  useEffect(() => {
    if (!ready) return
    const features: Feature<Point>[] = entries
      .filter((e) => e.type !== 'country' && e.type !== 'region' && e.lon != null && e.lat != null)
      .map((e) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lon!, e.lat!] },
        properties: { key: e.key, name: e.name, status: e.status },
      }))
    ;(mapRef.current!.getSource('points') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  }, [ready, entries])

  useEffect(() => {
    if (!ready) return
    mapRef.current!.setFilter('country-selected', ['==', ['get', 'id'], selectedCountry ?? ''])
  }, [ready, selectedCountry])

  useEffect(() => {
    if (ready && focus) mapRef.current!.flyTo({ center: [focus.lon, focus.lat], zoom: focus.zoom, duration: 900 })
  }, [ready, focus])

  useEffect(() => {
    if (ready) mapRef.current!.setProjection({ type: globe ? 'globe' : 'mercator' })
  }, [ready, globe])

  useEffect(() => {
    if (ready) mapRef.current!.getCanvas().style.cursor = picking ? 'crosshair' : ''
  }, [ready, picking])

  return (
    <div className="map-wrap">
      <div ref={container} className="map" />
      <div className="map-legend" aria-label="Leyenda">
        <span><i className="sw sw--lived" />Vivido</span>
        <span><i className="sw sw--visited" />Visitado</span>
        <span><i className="sw sw--transit" />Escala</span>
        <span><i className="sw sw--planned" />Planeado</span>
        <span><i className="sw sw--wishlist" />Quiero ir</span>
      </div>
      <button type="button" className="btn btn--small map-projection" onClick={() => setGlobe((g) => !g)}>
        {globe ? 'Plano' : 'Globo'}
      </button>
    </div>
  )
}

function emptyFc(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}
