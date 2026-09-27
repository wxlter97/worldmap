import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { t } from '../lib/i18n'
import 'maplibre-gl/dist/maplibre-gl.css'
// Vite empaqueta el worker de MapLibre aparte; su ruta relativa por defecto no sobrevive al bundling.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'
import { loadAdmin1, type BBox, type Geo } from '../lib/geo'
import { readPref, writePref } from '../lib/prefs'
import { useTheme, type Theme } from '../lib/theme'
import { BEEN_STATUSES, STATUS_LABEL, type CountrySummary, type Entry } from '../lib/model'
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
  /** Región del lugar abierto (la de una ciudad incluida): es lo que se marca, se resalta su borde. */
  selectedRegion?: string | null
  focus: MapFocus | null
  onSelect: (s: MapSelection) => void
  /** Modo "marcar lugar propio": el siguiente clic devuelve la coordenada. */
  picking?: boolean
  onPickLocation?: (lon: number, lat: number, countryId: string | null) => void
  /** Líneas de viaje (arcos ya calculados), paradas y marcador animado. */
  lines?: MapLines | null
  /** Repetición en curso: oculta la leyenda y deja sitio a la barra de reproducción. */
  replaying?: boolean
}

/** Hacia dónde mover la cámara: un encuadre (se ve entero) o un punto con zoom. */
export type MapFocus = { bounds: BBox; maxZoom: number } | { center: [number, number]; zoom: number }

export interface MapLines {
  arcs: [number, number][][]
  stops: [number, number][]
  head?: [number, number] | null // posición actual en la repetición
  /** Cambia cuando la cámara debe re-encuadrar (p. ej. al abrir otro viaje). null = no mover. */
  fitKey?: string | null
  fitCoords?: [number, number][]
}

maplibregl.setWorkerUrl(workerUrl)

const C = { faro: '#FFDB00', ink: '#111111', paper: '#F4F3EF', white: '#FFFFFF', ash: '#C9C9C2', smoke: '#6B6B63' }

/** Colores del mapa por tema (solo valores de la paleta del design system). */
interface MapPalette {
  ocean: string
  land: string
  line: string
  fg: string // bordes de selección, líneas de viaje, texto
  lived: string
  patternBg: string
  patternInk: string
  foil: string
  foilLine: string
  foilBorder: string // fronteras sobre la lámina
}

const PALETTES: Record<Theme, MapPalette> = {
  light: {
    ocean: C.paper, land: C.white, line: C.ink, fg: C.ink, lived: C.ink,
    patternBg: C.white, patternInk: C.ink, foil: C.ink, foilLine: '#3D3D38', foilBorder: C.smoke,
  },
  dark: {
    ocean: C.ink, land: '#1C1C1A', line: '#8A8A80', fg: '#EDEDE7', lived: '#EDEDE7',
    patternBg: '#1C1C1A', patternInk: '#EDEDE7', foil: '#3D3D38', foilLine: '#1C1C1A', foilBorder: '#8A8A80',
  },
}

type PatternKind = 'hatch-faro' | 'hatch-ink' | 'dots' | 'foil'
const PATTERNS: PatternKind[] = ['hatch-faro', 'hatch-ink', 'dots', 'foil']

/** Patrones de relleno dibujados en canvas (sin colores fuera de la paleta). */
function makePattern(kind: PatternKind, P: MapPalette): ImageData {
  const size = kind === 'foil' ? 16 : 12
  const ctx = new OffscreenCanvas(size, size).getContext('2d')!
  ctx.fillStyle = kind === 'foil' ? P.foil : P.patternBg
  ctx.fillRect(0, 0, size, size)
  if (kind === 'foil') {
    // "Lámina" del mapa de raspar con rayado fino.
    ctx.strokeStyle = P.foilLine
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const o of [-size, -size / 2, 0, size / 2, size]) {
      ctx.moveTo(o, size)
      ctx.lineTo(o + size, 0)
    }
    ctx.stroke()
  } else if (kind === 'dots') {
    ctx.fillStyle = P.patternInk
    ctx.fillRect(5, 5, 2, 2)
  } else {
    ctx.strokeStyle = kind === 'hatch-faro' ? C.faro : P.patternInk
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

export function MapView({ geo, entries, summaries, selectedCountry, selectedRegion = null, focus, onSelect, picking = false, onPickLocation, lines = null, replaying = false }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [globe, setGlobe] = useState(false)
  const [scratch, setScratch] = useState(() => readPref('scratch'))
  // Nivel de detalle: por regiones (se ve lo que falta de cada país) o país entero pintado.
  const [byCountry, setByCountry] = useState(() => readPref('countryLevel'))
  const theme = useTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme
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
      for (const kind of PATTERNS) map.addImage(kind, makePattern(kind, PALETTES[themeRef.current]))

      map.addSource('countries', { type: 'geojson', data: geo.shapes, promoteId: 'id' })
      map.addSource('regions', { type: 'geojson', data: emptyFc(), promoteId: 'id' })
      map.addSource('points', { type: 'geojson', data: emptyFc() })
      map.addSource('route', { type: 'geojson', data: emptyFc() })
      map.addSource('route-head', { type: 'geojson', data: emptyFc() })

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
      // Modo raspar: lámina sobre lo no visitado (y sobre países parciales, bajo sus regiones visitadas).
      map.addLayer({
        id: 'country-foil',
        type: 'fill',
        source: 'countries',
        layout: { visibility: 'none' },
        filter: ['any', ['!', ['in', ['get', 'status'], ['literal', ['lived', 'visited']]]], ['==', ['get', 'partial'], true]],
        paint: { 'fill-pattern': 'foil' },
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
        id: 'region-selected',
        type: 'line',
        source: 'regions',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': C.ink, 'line-width': 2.5, 'line-dasharray': [2, 1] },
      })
      // Borde ink bajo la línea: solo en modo raspar, donde la línea es amarilla.
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
        layout: { 'line-join': 'miter', 'line-cap': 'butt', visibility: 'none' },
        paint: { 'line-color': C.ink, 'line-width': 5 },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
        layout: { 'line-join': 'miter', 'line-cap': 'butt' },
        paint: { 'line-color': C.ink, 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
      })
      map.addLayer({
        id: 'route-stops',
        type: 'circle',
        source: 'route',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 4, 'circle-color': C.faro, 'circle-stroke-color': C.ink, 'circle-stroke-width': 2 },
      })
      map.addLayer({
        id: 'route-head',
        type: 'circle',
        source: 'route-head',
        paint: { 'circle-radius': 8, 'circle-color': C.ink, 'circle-stroke-color': C.faro, 'circle-stroke-width': 3 },
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
      const partial = !byCountry && regionDetail(geo, s) && s!.percent < 99.5
      return { ...f, properties: { id: f.properties.id, status: s?.status ?? null, partial } }
    })
    ;(mapRef.current!.getSource('countries') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  }, [ready, geo, summaries, byCountry])

  // --- Regiones de los países visitados (+ todas las del país seleccionado) ---
  const regionCountries = useMemo(() => {
    const ids = new Set<string>()
    if (!byCountry) for (const [id, s] of summaries) if (regionDetail(geo, s)) ids.add(id)
    if (selectedCountry) ids.add(selectedCountry)
    return [...ids].sort()
  }, [geo, summaries, selectedCountry, byCountry])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    Promise.all(regionCountries.map(loadAdmin1)).then((collections) => {
      if (cancelled) return
      const features: Feature<Polygon | MultiPolygon, { id: string; visited: boolean }>[] = []
      for (const fc of collections) {
        if (!fc) continue
        for (const f of fc.features) {
          const visited = !byCountry && (summaries.get(f.properties.country)?.visitedRegionIds.has(f.properties.id) ?? false)
          // Con detalle por regiones se dibujan todas las de un país visitado: así se ve lo que falta.
          if (!byCountry || f.properties.country === selectedCountry) features.push({ ...f, properties: { id: f.properties.id, visited } })
        }
      }
      ;(mapRef.current!.getSource('regions') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
    })
    return () => {
      cancelled = true
    }
  }, [ready, regionCountries, summaries, selectedCountry, byCountry])

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
    mapRef.current!.setFilter('region-selected', ['==', ['get', 'id'], selectedRegion ?? ''])
  }, [ready, selectedCountry, selectedRegion])

  useEffect(() => {
    if (!ready || !focus) return
    const map = mapRef.current!
    if ('bounds' in focus) map.fitBounds(focus.bounds, { padding: overlayPadding(map), maxZoom: focus.maxZoom, duration: 900 })
    else map.flyTo({ center: focus.center, zoom: focus.zoom, duration: 900 })
  }, [ready, focus])

  // --- Líneas de viaje ---
  useEffect(() => {
    if (!ready) return
    const map = mapRef.current!
    const features: Feature[] = (lines?.stops ?? []).map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} }))
    if (lines?.arcs.length) features.push({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: lines.arcs }, properties: {} })
    ;(map.getSource('route') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
    const head: Feature[] = lines?.head ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: lines.head }, properties: {} }] : []
    ;(map.getSource('route-head') as GeoJSONSource).setData({ type: 'FeatureCollection', features: head })
  }, [ready, lines])

  // Durante la repetición, si el marcador sale del encuadre la cámara lo sigue.
  const head = lines?.head ?? null
  useEffect(() => {
    if (!ready || !head) return
    const map = mapRef.current!
    if (map.isMoving()) return
    const canvas = map.getCanvas()
    const margin = 40
    const p = map.project(head)
    const barHeight = 150 // la barra de reproducción tapa el pie del mapa
    const inside = p.x > margin && p.y > margin && p.x < canvas.clientWidth - margin && p.y < canvas.clientHeight - barHeight
    if (!inside) map.easeTo({ center: head, offset: [0, -barHeight / 3], duration: 700 })
  }, [ready, head])

  const fitKey = lines?.fitKey ?? null
  useEffect(() => {
    if (!ready || !fitKey) return
    const map = mapRef.current!
    const coords = lines?.fitCoords ?? []
    if (coords.length === 1) map.flyTo({ center: coords[0], zoom: 5, duration: 900 })
    else if (coords.length > 1) {
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      map.fitBounds(bounds, { padding: 60, maxZoom: 5.5, duration: 900 })
    }
    // Solo cuando cambia la clave de encuadre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey])

  // --- Estilo según tema y modo raspar ---
  useEffect(() => {
    if (!ready) return
    const map = mapRef.current!
    const P = PALETTES[theme]
    for (const kind of PATTERNS) map.updateImage(kind, makePattern(kind, P))
    map.setPaintProperty('bg', 'background-color', P.ocean)
    map.setLayoutProperty('country-foil', 'visibility', scratch ? 'visible' : 'none')
    map.setLayoutProperty('country-pattern', 'visibility', scratch ? 'none' : 'visible')
    map.setPaintProperty(
      'country-fill',
      'fill-color',
      scratch
        ? ['match', ['get', 'status'], ['lived', 'visited'], C.faro, P.ocean]
        : ['match', ['get', 'status'], 'lived', P.lived, 'visited', C.faro, P.land],
    )
    map.setPaintProperty('country-fill', 'fill-opacity', scratch ? 1 : ['case', ['boolean', ['get', 'partial'], false], 0.45, 1])
    // Sobre la lámina las fronteras y líneas en ink desaparecen: se aclaran en modo raspar.
    const beenExpr: maplibregl.ExpressionSpecification = ['in', ['get', 'status'], ['literal', ['lived', 'visited']]]
    map.setPaintProperty('country-line', 'line-color', scratch ? ['case', beenExpr, C.ink, P.foilBorder] : P.line)
    map.setPaintProperty('region-line', 'line-color', scratch ? ['case', ['==', ['get', 'visited'], true], C.ink, P.foilBorder] : P.line)
    map.setPaintProperty('country-selected', 'line-color', P.fg)
    map.setPaintProperty('region-selected', 'line-color', scratch ? C.faro : P.fg)
    map.setPaintProperty('route-line', 'line-color', scratch ? C.faro : P.fg)
    map.setLayoutProperty('route-casing', 'visibility', scratch ? 'visible' : 'none')
    map.setPaintProperty('points', 'circle-color', ['match', ['get', 'status'], 'lived', P.lived, 'visited', C.faro, P.land])
    map.setPaintProperty('points', 'circle-stroke-color', ['match', ['get', 'status'], 'lived', C.faro, P.fg])
    writePref('scratch', scratch)
  }, [ready, scratch, theme])

  useEffect(() => {
    if (ready) mapRef.current!.setProjection({ type: globe ? 'globe' : 'mercator' })
  }, [ready, globe])

  useEffect(() => {
    if (ready) mapRef.current!.getCanvas().style.cursor = picking ? 'crosshair' : ''
  }, [ready, picking])

  return (
    <div className={replaying ? 'map-wrap map-wrap--replay' : 'map-wrap'}>
      <div ref={container} className="map" />
      <div className="map-legend" aria-label={t('Leyenda')} hidden={replaying}>
        {scratch ? (
          <>
            <span><i className="sw sw--foil" />{t('Por raspar')}</span>
            <span><i className="sw sw--visited" />{t('Raspado (Vivido o Visitado)')}</span>
          </>
        ) : (
          <>
            <span><i className="sw sw--lived" />{STATUS_LABEL.lived}</span>
            <span><i className="sw sw--visited" />{STATUS_LABEL.visited}</span>
            <span><i className="sw sw--transit" />{STATUS_LABEL.transit}</span>
            <span><i className="sw sw--planned" />{STATUS_LABEL.planned}</span>
            <span><i className="sw sw--wishlist" />{STATUS_LABEL.wishlist}</span>
          </>
        )}
      </div>
      <div className="map-modes">
        <button type="button" className="btn btn--small" aria-pressed={scratch} onClick={() => setScratch((v) => !v)}>
          {scratch ? t('Normal') : t('Raspar')}
        </button>
        <button
          type="button"
          className="btn btn--small"
          title={byCountry ? t('Ver el detalle por regiones') : t('Pintar cada país entero')}
          onClick={() => {
            writePref('countryLevel', !byCountry)
            setByCountry((v) => !v)
          }}
        >
          {byCountry ? t('Regiones') : t('Países')}
        </button>
        <button type="button" className="btn btn--small" onClick={() => setGlobe((g) => !g)}>
          {globe ? t('Plano') : t('Globo')}
        </button>
      </div>
    </div>
  )
}

/** Margen del encuadre: deja libre lo que tapan la leyenda y los botones (en móvil ocupan buena parte del mapa). */
function overlayPadding(map: maplibregl.Map): maplibregl.PaddingOptions {
  const box = map.getContainer().getBoundingClientRect()
  const pad = Math.min(40, Math.round(Math.min(box.width, box.height) / 8))
  const p = { top: pad, right: pad, bottom: pad, left: pad }
  const legend = map.getContainer().parentElement?.querySelector<HTMLElement>('.map-legend:not([hidden])')?.getBoundingClientRect()
  const modes = map.getContainer().parentElement?.querySelector<HTMLElement>('.map-modes')?.getBoundingClientRect()
  if (modes) p.right = Math.max(p.right, box.right - modes.left + 8)
  // Una leyenda ancha (móvil) cubre la franja de arriba.
  if (legend && legend.width > box.width / 2) p.top = Math.max(p.top, legend.bottom - box.top + 8)
  // Nunca más margen que mapa.
  if (p.left + p.right > box.width * 0.6) p.right = p.left = Math.round(box.width * 0.1)
  if (p.top + p.bottom > box.height * 0.6) p.top = p.bottom = Math.round(box.height * 0.1)
  return p
}

/** País visitado cuyo % sale de sus regiones (no manual, con regiones en los datos). */
function regionDetail(geo: Geo, s: CountrySummary | undefined): boolean {
  return !!s && s.status != null && BEEN_STATUSES.has(s.status) && !s.percentIsManual && (geo.regionAreaByCountry[s.country.id] ?? 0) > 0
}

function emptyFc(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}
