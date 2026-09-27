// Póster PNG del mapa, dibujado en canvas con la proyección Equal Earth (independiente de MapLibre).
import type { MultiPolygon, Polygon, Position } from 'geojson'
import { loadAdmin1, type Geo } from './geo'
import { BEEN_STATUSES, type CountrySummary } from './model'
import type { Stats } from './stats'

export type PosterTheme = 'papel' | 'negro' | 'amarillo' | 'raspar'

export interface PosterFormat {
  id: string
  label: string
  width: number
  height: number
}

export const POSTER_FORMATS: PosterFormat[] = [
  { id: 'vertical', label: 'Vertical 1080×1350', width: 1080, height: 1350 },
  { id: 'cuadrado', label: 'Cuadrado 1080×1080', width: 1080, height: 1080 },
  { id: 'historia', label: 'Historia 1080×1920', width: 1080, height: 1920 },
  { id: 'a3', label: 'Impresión A3 (300 ppp)', width: 3508, height: 4961 },
]

export const POSTER_THEMES: { id: PosterTheme; label: string }[] = [
  { id: 'papel', label: 'Papel' },
  { id: 'negro', label: 'Negro' },
  { id: 'amarillo', label: 'Amarillo' },
  { id: 'raspar', label: 'Raspado' },
]

interface Palette {
  bg: string
  text: string
  accent: string // titular
  muted: string
  land: string
  landPattern?: 'foil'
  border: string
  been: string
  lived: string
  partial: string // base de un país parcialmente visitado
  line: string
}

const PALETTES: Record<PosterTheme, Palette> = {
  papel: { bg: '#F4F3EF', text: '#111111', accent: '#111111', muted: '#6B6B63', land: '#FFFFFF', border: '#111111', been: '#FFDB00', lived: '#111111', partial: 'rgba(255,219,0,0.4)', line: '#111111' },
  negro: { bg: '#111111', text: '#EDEDE7', accent: '#FFDB00', muted: '#8A8A80', land: '#1C1C1A', border: '#3D3D38', been: '#FFDB00', lived: '#EDEDE7', partial: 'rgba(255,219,0,0.35)', line: '#EDEDE7' },
  amarillo: { bg: '#FFDB00', text: '#111111', accent: '#111111', muted: '#3D3D38', land: '#F4F3EF', border: '#111111', been: '#111111', lived: '#111111', partial: 'rgba(17,17,17,0.35)', line: '#111111' },
  raspar: { bg: '#F4F3EF', text: '#111111', accent: '#111111', muted: '#6B6B63', land: '#111111', landPattern: 'foil', border: '#111111', been: '#FFDB00', lived: '#FFDB00', partial: '#111111', line: '#FFDB00' },
}

// --- Proyección Equal Earth (Šavrič, Patterson & Jenny, 2018) ---
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796
const M = Math.sqrt(3) / 2
function equalEarth(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180
  const t = Math.asin(M * Math.sin((lat * Math.PI) / 180))
  const t2 = t * t, t6 = t2 * t2 * t2
  const x = (2 * Math.sqrt(3) * l * Math.cos(t)) / (3 * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
  return [x, y]
}
const X_MAX = equalEarth(180, 0)[0]
const Y_TOP = equalEarth(0, 84)[1]
const Y_BOTTOM = equalEarth(0, -57)[1] // se recorta la Antártida

export interface PosterInput {
  geo: Geo
  summaries: Map<string, CountrySummary>
  stats: Stats
  name: string
  years: [string, string] | null
  arcs: [number, number][][] | null
  theme: PosterTheme
  format: PosterFormat
}

export async function renderPoster(canvas: HTMLCanvasElement, input: PosterInput) {
  const { geo, summaries, stats, theme, format } = input
  const P = PALETTES[theme]
  const W = format.width
  const H = format.height
  const s = W / 1080 // escala respecto al diseño base
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  await Promise.all([
    document.fonts.load(`400 ${100 * s}px "Archivo Black"`),
    document.fonts.load(`500 ${30 * s}px "Archivo"`),
    document.fonts.load(`700 ${20 * s}px "JetBrains Mono"`),
  ]).catch(() => undefined)

  // Regiones de países parcialmente visitados (se pintan encima de su país).
  const partialIds = [...summaries.values()]
    .filter((x) => x.status && BEEN_STATUSES.has(x.status) && !x.percentIsManual && x.visitedRegionIds.size > 0 && x.percent < 99.5)
    .map((x) => x.country.id)
  const admin1 = await Promise.all(partialIds.map(loadAdmin1))

  ctx.fillStyle = P.bg
  ctx.fillRect(0, 0, W, H)

  // --- Encabezado ---
  const pad = 64 * s
  let y = pad
  ctx.fillStyle = P.muted
  ctx.font = `700 ${20 * s}px "JetBrains Mono", monospace`
  setSpacing(ctx, 0.14 * 20 * s)
  ctx.textBaseline = 'top'
  ctx.fillText(`MAPA DE VIAJES${input.name ? ` · ${input.name.toUpperCase()}` : ''}`, pad, y)
  y += 48 * s

  ctx.fillStyle = P.accent
  const headSize = (format.height / format.width > 1.6 ? 170 : 150) * s
  ctx.font = `400 ${headSize}px "Archivo Black", "Arial Black", sans-serif`
  setSpacing(ctx, -0.04 * headSize)
  ctx.fillText(`${stats.unCountries} ${stats.unCountries === 1 ? 'país' : 'países'}`, pad - 6 * s, y)
  y += headSize * 0.92

  ctx.fillStyle = P.text
  ctx.font = `500 ${32 * s}px "Archivo", sans-serif`
  setSpacing(ctx, 0)
  const sub = [
    `${stats.continentsBeen} ${stats.continentsBeen === 1 ? 'continente' : 'continentes'}`,
    `${stats.cities} ${stats.cities === 1 ? 'ciudad' : 'ciudades'}`,
    stats.totalDays ? `${stats.totalDays.toLocaleString('es')} días` : null,
    `${Math.round((stats.unCountries / 193) * 100)}% del mundo`,
  ].filter(Boolean).join('  ·  ')
  ctx.fillText(sub, pad, y + 12 * s)
  y += 80 * s

  // --- Mapa ---
  const footerH = 120 * s
  const mapTop = y
  const mapBottom = H - footerH - pad * 0.5
  const mapW = W - pad * 2
  const scale = Math.min(mapW / (2 * X_MAX), (mapBottom - mapTop) / (Y_TOP - Y_BOTTOM))
  const mapH = (Y_TOP - Y_BOTTOM) * scale
  // En formatos altos sobra espacio bajo el mapa: ahí va la lista de países.
  const listSpace = mapBottom - mapTop - mapH
  const withList = listSpace > 220 * s
  const offX = W / 2
  const offY = (withList ? mapTop + 24 * s : mapTop + listSpace / 2) + Y_TOP * scale
  const project = ([lon, lat]: Position): [number, number] => {
    const [px, py] = equalEarth(lon, Math.max(-57, Math.min(84, lat)))
    return [offX + px * scale, offY - py * scale]
  }
  const pathOf = (geom: Polygon | MultiPolygon) => {
    const path = new Path2D()
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
    for (const poly of polys) {
      for (const ring of poly) {
        ring.forEach((pt, i) => {
          const [px, py] = project(pt)
          if (i === 0) path.moveTo(px, py)
          else path.lineTo(px, py)
        })
        path.closePath()
      }
    }
    return path
  }

  const foil = P.landPattern ? foilPattern(ctx, s) : null
  const lineWidth = Math.max(0.6, 0.7 * s)
  for (const f of geo.shapes.features) {
    if (f.properties.id === 'ATA') continue
    const sum = summaries.get(f.properties.id)
    const been = !!sum?.status && BEEN_STATUSES.has(sum.status)
    const partial = been && partialIds.includes(f.properties.id)
    const path = pathOf(f.geometry)
    if (!been || (partial && foil)) {
      ctx.fillStyle = foil ?? P.land // raspado: la lámina cubre también los países parciales
      ctx.fill(path)
    } else if (partial) {
      ctx.fillStyle = P.land
      ctx.fill(path)
      ctx.fillStyle = P.partial
      ctx.fill(path)
    } else {
      ctx.fillStyle = sum!.status === 'lived' ? P.lived : P.been
      ctx.fill(path)
    }
    ctx.strokeStyle = P.border
    ctx.lineWidth = lineWidth
    ctx.stroke(path)
  }
  for (const [i, fc] of admin1.entries()) {
    const visited = summaries.get(partialIds[i])?.visitedRegionIds
    for (const f of fc?.features ?? []) {
      if (!visited?.has(f.properties.id)) continue
      ctx.fillStyle = P.been
      const path = pathOf(f.geometry)
      ctx.fill(path)
      ctx.strokeStyle = P.border
      ctx.lineWidth = lineWidth * 0.6
      ctx.stroke(path)
    }
  }

  if (input.arcs?.length) {
    ctx.save()
    const arcPath = new Path2D()
    for (const arc of input.arcs) {
      arc.forEach((pt, i) => {
        const [px, py] = project(pt)
        if (i === 0) arcPath.moveTo(px, py)
        else arcPath.lineTo(px, py)
      })
    }
    if (theme === 'raspar') {
      // Amarillo sobre papel no contrasta: la línea lleva un borde ink continuo debajo.
      ctx.strokeStyle = '#111111'
      ctx.lineWidth = 5 * s
      ctx.stroke(arcPath)
    }
    ctx.strokeStyle = P.line
    ctx.lineWidth = 2.2 * s
    ctx.setLineDash([7 * s, 5 * s])
    ctx.stroke(arcPath)
    ctx.restore()
  }

  if (withList) {
    const names = [...summaries.values()]
      .filter((x) => x.status && BEEN_STATUSES.has(x.status))
      .map((x) => x.country.name)
      .sort((a, b) => a.localeCompare(b, 'es'))
    let ly = mapTop + 24 * s + mapH + 56 * s
    ctx.fillStyle = P.text
    ctx.fillRect(pad, ly, W - pad * 2, 3 * s)
    ly += 28 * s
    ctx.fillStyle = P.muted
    ctx.font = `700 ${18 * s}px "JetBrains Mono", monospace`
    setSpacing(ctx, 0.14 * 18 * s)
    ctx.textBaseline = 'top'
    ctx.fillText(`${names.length} PAÍSES Y TERRITORIOS`, pad, ly)
    ly += 44 * s
    ctx.fillStyle = P.text
    const size = 30 * s
    ctx.font = `500 ${size}px "Archivo", sans-serif`
    setSpacing(ctx, 0)
    const maxLines = Math.floor((mapBottom - ly) / (size * 1.45))
    wrapList(ctx, names, W - pad * 2, maxLines).forEach((line, i) => ctx.fillText(line, pad, ly + i * size * 1.45))
  }

  // --- Pie: símbolo + wordmark, años y dominio ---
  const footTop = H - footerH
  ctx.fillStyle = P.border === '#3D3D38' ? '#3D3D38' : P.text
  ctx.fillRect(pad, footTop, W - pad * 2, 3 * s)
  const sym = 52 * s
  const symY = footTop + (footerH - sym) / 2
  drawSymbol(ctx, pad, symY, sym, theme)
  ctx.fillStyle = P.text
  ctx.font = `400 ${38 * s}px "Archivo Black", sans-serif`
  setSpacing(ctx, -0.035 * 38 * s)
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('wxlter', pad + sym + 16 * s, symY + sym - 4 * s)
  const wordW = ctx.measureText('wxlter').width
  ctx.fillStyle = theme === 'negro' ? '#FFDB00' : P.text // el punto va en faro solo sobre fondo oscuro
  ctx.fillText('.', pad + sym + 16 * s + wordW, symY + sym - 4 * s)

  ctx.fillStyle = P.muted
  ctx.font = `700 ${18 * s}px "JetBrains Mono", monospace`
  setSpacing(ctx, 0.12 * 18 * s)
  ctx.textAlign = 'right'
  const right = W - pad
  ctx.fillText(input.years ? (input.years[0] === input.years[1] ? input.years[0] : `${input.years[0]} — ${input.years[1]}`) : '', right, symY + sym * 0.45)
  ctx.fillText('MAP.WXLTER.DEV', right, symY + sym - 4 * s)
  ctx.textAlign = 'left'
}

/** Reparte nombres separados por « · » en líneas; si no caben, la última termina en «+N más». */
function wrapList(ctx: CanvasRenderingContext2D, names: string[], width: number, maxLines: number): string[] {
  const lines: string[] = []
  let current = ''
  for (let i = 0; i < names.length; i++) {
    const next = current ? `${current} · ${names[i]}` : names[i]
    if (ctx.measureText(next).width <= width || !current) {
      current = next
      continue
    }
    if (lines.length === maxLines - 1) {
      let last = current
      const more = (n: number) => ` · +${n} más`
      while (last.includes(' · ') && ctx.measureText(last + more(names.length - i)).width > width) {
        last = last.slice(0, last.lastIndexOf(' · '))
        i--
      }
      lines.push(last + more(names.length - i))
      return lines
    }
    lines.push(current)
    current = names[i]
  }
  if (current && lines.length < maxLines) lines.push(current)
  return lines
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`
}

function foilPattern(ctx: CanvasRenderingContext2D, s: number): CanvasPattern {
  const size = Math.round(12 * s)
  const c = new OffscreenCanvas(size, size)
  const g = c.getContext('2d')!
  g.fillStyle = '#111111'
  g.fillRect(0, 0, size, size)
  g.strokeStyle = '#3D3D38'
  g.lineWidth = Math.max(1, s)
  g.beginPath()
  for (const o of [-size, 0, size]) {
    g.moveTo(o, size)
    g.lineTo(o + size, 0)
  }
  g.stroke()
  return ctx.createPattern(c, 'repeat')!
}

/** Símbolo wxlter: W de trazo continuo en un cuadrado (invertido sobre fondo amarillo). */
function drawSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, theme: PosterTheme) {
  const k = size / 100
  const bg = theme === 'negro' ? '#FFDB00' : '#111111'
  const fg = theme === 'negro' ? '#111111' : '#FFDB00'
  ctx.fillStyle = bg
  ctx.fillRect(x, y, size, size)
  ctx.strokeStyle = fg
  ctx.lineWidth = (size < 32 ? 17 : 15) * k
  ctx.lineJoin = 'miter'
  ctx.beginPath()
  ;[[14, 24], [32, 76], [50, 44], [68, 76], [86, 24]].forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(x + px * k, y + py * k)
    else ctx.lineTo(x + px * k, y + py * k)
  })
  ctx.stroke()
}
