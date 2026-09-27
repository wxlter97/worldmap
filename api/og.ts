// Imagen de vista previa (1200×630) de un link compartido: /api/og?t={token}
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { readFileSync } from 'node:fs'
import { loadShare } from './_lib/share.js'

const font = readFileSync(new URL('./_lib/fonts/ArchivoBlack-Regular.ttf', import.meta.url))

// --- Proyección Equal Earth (igual que el póster) ---
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796
const M = Math.sqrt(3) / 2
function equalEarth(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180
  const t = Math.asin(M * Math.sin((lat * Math.PI) / 180))
  const t2 = t * t, t6 = t2 * t2 * t2
  return [(2 * Math.sqrt(3) * l * Math.cos(t)) / (3 * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))), t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))]
}
const X_MAX = equalEarth(180, 0)[0]
const Y_TOP = equalEarth(0, 84)[1]
const Y_BOTTOM = equalEarth(0, -57)[1]

type Geometry = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] }
type Shapes = { features: { properties: { id: string }; geometry: Geometry }[] }

let shapesPromise: Promise<Shapes> | null = null
const loadShapes = (origin: string) =>
  (shapesPromise ??= fetch(`${origin}/data/countries.geojson`).then((r) => r.json() as Promise<Shapes>))

let kindsPromise: Promise<Record<string, { kind: string }>> | null = null
const loadKinds = (origin: string) =>
  (kindsPromise ??= fetch(`${origin}/data/countries.json`).then((r) => r.json() as Promise<Record<string, { kind: string }>>))

function mapPaths(shapes: Shapes, visited: Set<string>, width: number, height: number) {
  const scale = Math.min(width / (2 * X_MAX), height / (Y_TOP - Y_BOTTOM))
  const offX = width / 2
  const offY = (height - (Y_TOP - Y_BOTTOM) * scale) / 2 + Y_TOP * scale
  const paths: { d: string; visited: boolean }[] = []
  for (const f of shapes.features) {
    if (f.properties.id === 'ATA') continue
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    let d = ''
    for (const poly of polys) {
      for (const ring of poly) {
        ring.forEach(([lon, lat], i) => {
          const [x, y] = equalEarth(lon, Math.max(-57, Math.min(84, lat)))
          d += `${i === 0 ? 'M' : 'L'}${(offX + x * scale).toFixed(1)} ${(offY - y * scale).toFixed(1)}`
        })
        d += 'Z'
      }
    }
    paths.push({ d, visited: visited.has(f.properties.id) })
  }
  return paths
}

// Satori acepta elementos como objetos { type, props }: se evita JSX en la función.
type Node = { type: string; props: Record<string, unknown> & { children?: unknown } }
const h = (type: string, props: Record<string, unknown>, ...children: unknown[]): Node => ({
  type,
  props: { ...props, children: children.length <= 1 ? children[0] : children },
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = process.env.PUBLIC_ORIGIN ?? url.origin
  const share = await loadShare(url.searchParams.get('t') ?? '')
  const [shapes, kinds] = await Promise.all([loadShapes(origin), loadKinds(origin)])

  const visited = new Set(share?.countryIds ?? [])
  const unCount = [...visited].filter((id) => kinds[id]?.kind === 'country').length
  const who = share ? (share.tripName ? share.tripName : share.displayName ? `Mapa de ${share.displayName}` : 'Mapa de viajes') : 'Mapa de viajes'
  const sub = share
    ? share.tripName
      ? `${share.displayName ? `Viaje de ${share.displayName} · ` : ''}${share.places} lugares`
      : `${share.places} ciudades y lugares`
    : 'Link no disponible'

  const W = 1200, H = 630, MAP_W = 700, MAP_H = 380
  const paths = mapPaths(shapes, visited, MAP_W, MAP_H)
  const svg = h(
    'svg',
    { width: MAP_W, height: MAP_H, viewBox: `0 0 ${MAP_W} ${MAP_H}` },
    ...paths.map((p) => h('path', { d: p.d, fill: p.visited ? '#FFDB00' : '#FFFFFF', stroke: '#111111', 'stroke-width': 0.6 })),
  )

  const tree = h(
    'div',
    { style: { width: W, height: H, display: 'flex', flexDirection: 'column', background: '#F4F3EF', color: '#111111', fontFamily: 'Archivo Black', padding: 56 } },
    h(
      'div',
      { style: { display: 'flex', flex: 1, alignItems: 'center', gap: 32 } },
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', width: 380, gap: 14 } },
        h('div', { style: { fontSize: 18, letterSpacing: 3, color: '#6B6B63', textTransform: 'uppercase' } }, who.slice(0, 40)),
        h('div', { style: { fontSize: 120, lineHeight: 0.9, letterSpacing: -5 } }, String(unCount)),
        h('div', { style: { fontSize: 44, lineHeight: 1, letterSpacing: -1.5 } }, unCount === 1 ? 'país' : 'países'),
        h('div', { style: { fontSize: 20, color: '#3D3D38', marginTop: 8 } }, sub),
      ),
      svg,
    ),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '4px solid #111111', paddingTop: 20 } },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        h(
          'svg',
          { width: 40, height: 40, viewBox: '0 0 100 100' },
          h('rect', { width: 100, height: 100, fill: '#111111' }),
          h('polyline', { points: '14,24 32,76 50,44 68,76 86,24', fill: 'none', stroke: '#FFDB00', 'stroke-width': 15, 'stroke-linejoin': 'miter' }),
        ),
        h('div', { style: { fontSize: 32, letterSpacing: -1 } }, 'wxlter.'),
      ),
      h('div', { style: { fontSize: 18, letterSpacing: 2, color: '#6B6B63' } }, 'MAP.WXLTER.DEV'),
    ),
  )

  const svgMarkup = await satori(tree as never, {
    width: W,
    height: H,
    fonts: [{ name: 'Archivo Black', data: font, weight: 400, style: 'normal' }],
  })
  const png = new Resvg(svgMarkup, { fitTo: { mode: 'width', value: W } }).render().asPng()
  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
