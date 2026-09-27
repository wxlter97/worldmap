import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppData } from '../app/AppData'
import { backupToJson, download, entriesToCsv, parseBackup, restoreBackup, today, type Backup } from '../lib/exporters'
import { buildJourney, journeyArcs } from '../lib/journey'
import { POSTER_FORMATS, POSTER_THEMES, renderPoster, type PosterTheme } from '../lib/poster'
import { computeStats } from '../lib/stats'
import './ExportPage.css'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function ExportPage() {
  const { geo, entries, trips, summaries, profile, uid } = useAppData()
  const stats = useMemo(() => computeStats(geo, entries, summaries), [geo, entries, summaries])

  // --- Póster ---
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [formatId, setFormatId] = useState(POSTER_FORMATS[0].id)
  const [theme, setTheme] = useState<PosterTheme>('papel')
  const [withLines, setWithLines] = useState(false)
  const [rendering, setRendering] = useState(false)
  const format = POSTER_FORMATS.find((f) => f.id === formatId)!

  const arcs = useMemo(() => {
    const coords = buildJourney(geo, entries).map((st) => [st.lon, st.lat] as [number, number])
    return journeyArcs(coords)
  }, [geo, entries])
  const years = useMemo<[string, string] | null>(() => {
    const ys = entries.flatMap((e) => e.dates.flatMap((d) => [d.start.slice(0, 4), (d.end || d.start).slice(0, 4)])).sort()
    return ys.length ? [ys[0], ys.at(-1)!] : null
  }, [entries])

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return
    setRendering(true)
    // Se dibuja en un canvas aparte y se copia al final: evita ver el póster a medio pintar.
    const work = document.createElement('canvas')
    renderPoster(work, { geo, summaries, stats, name: profile.displayName, years, arcs: withLines ? arcs : null, theme, format })
      .then(() => {
        if (cancelled) return
        canvas.width = work.width
        canvas.height = work.height
        canvas.getContext('2d')!.drawImage(work, 0, 0)
      })
      .finally(() => !cancelled && setRendering(false))
    return () => {
      cancelled = true
    }
  }, [geo, summaries, stats, profile.displayName, years, arcs, withLines, theme, format])

  const downloadPoster = () =>
    canvasRef.current?.toBlob((blob) => blob && download(`mapa-wxlter-${format.id}-${today()}.png`, blob), 'image/png')

  // --- Restaurar ---
  const [pending, setPending] = useState<Backup | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    setImportError(null)
    setImported(null)
    setPending(null)
    if (!file) return
    const result = parseBackup(await file.text())
    if ('error' in result) setImportError(result.error)
    else setPending(result.backup)
  }

  const runImport = async () => {
    if (!pending) return
    setImporting(true)
    try {
      await restoreBackup(uid, pending)
      setImported(`Importados ${plural(pending.entries.length, 'lugar', 'lugares')} y ${plural(pending.trips.length, 'viaje', 'viajes')}.`)
      setPending(null)
    } catch {
      setImportError('No se pudo importar. Revisa tu conexión e inténtalo otra vez: lo ya escrito se conserva.')
    } finally {
      setImporting(false)
    }
  }

  const existing = new Set(entries.map((e) => e.key))
  const overwrites = pending ? pending.entries.filter((e) => existing.has(e.key)).length : 0

  return (
    <div className="export-page">
      <div className="export-page__head">
        <h1>Exportar</h1>
        <span className="label muted">Póster · CSV · copia de seguridad</span>
      </div>

      <section className="export-section">
        <h2>Póster</h2>
        <div className="poster">
          <div className="poster__controls">
            <label className="field">
              <span>Formato</span>
              <select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                {POSTER_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Estilo</span>
              <div className="tabs" role="radiogroup" aria-label="Estilo del póster">
                {POSTER_THEMES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} aria-selected={theme === t.id} onClick={() => setTheme(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="export-toggle">
              <button type="button" className="toggle" role="switch" aria-checked={withLines} aria-label="Incluir líneas de viaje" onClick={() => setWithLines(!withLines)} />
              <span className="mono">Líneas de viaje</span>
            </label>
            {!profile.displayName && (
              <p className="mono muted export-small">Añade tu nombre en Cuenta para que aparezca en el póster.</p>
            )}
            <button type="button" className="btn btn--primary" onClick={downloadPoster} disabled={rendering}>
              {rendering ? 'Dibujando…' : 'Descargar PNG'}
            </button>
          </div>
          <div className="poster__preview">
            <canvas ref={canvasRef} aria-label="Vista previa del póster" />
          </div>
        </div>
      </section>

      <section className="export-section">
        <h2>Datos</h2>
        <p className="export-copy">
          <strong>CSV</strong> para Excel o Google Sheets: una fila por visita, con fechas, viaje, etiquetas y notas.{' '}
          <strong>JSON</strong> es la copia de seguridad completa: sirve para restaurar tu mapa.
        </p>
        <div className="export-row">
          <button type="button" className="btn" onClick={() => download(`mapa-wxlter-${today()}.csv`, entriesToCsv(geo, entries, trips))}>
            Descargar CSV
          </button>
          <button type="button" className="btn" onClick={() => download(`mapa-wxlter-copia-${today()}.json`, backupToJson(entries, trips))}>
            Descargar copia JSON
          </button>
        </div>
      </section>

      <section className="export-section">
        <h2>Restaurar copia</h2>
        <p className="export-copy">
          Importa un JSON exportado desde aquí. Los lugares y viajes con la misma clave se sobrescriben; el resto de tu
          mapa no se toca. Las fotos solo se ven si la copia viene de esta misma cuenta.
        </p>
        <label className="btn export-file">
          Elegir archivo JSON
          <input type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {importError && <p className="notice notice--error" role="alert">{importError}</p>}
        {imported && <p className="notice" role="status">{imported}</p>}
        {pending && (
          <div className="notice export-confirm">
            <p>
              La copia del {new Date(pending.exportedAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })} tiene{' '}
              <strong>{plural(pending.entries.length, 'lugar', 'lugares')}</strong> y <strong>{plural(pending.trips.length, 'viaje', 'viajes')}</strong>.
              {overwrites > 0 && ` ${overwrites === 1 ? '1 lugar ya existe y se reemplazará.' : `${overwrites} lugares ya existen y se reemplazarán.`}`}
            </p>
            <div className="export-row">
              <button type="button" className="btn btn--primary" disabled={importing} onClick={runImport}>
                {importing ? 'Importando…' : 'Importar'}
              </button>
              <button type="button" className="btn" disabled={importing} onClick={() => setPending(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
