import { useEffect, useState } from 'react'
import { newTrip, photoUrl, removePhoto, saveTrip, uploadPhoto } from '../lib/data'
import { STATUSES, STATUS_LABEL, formatRange, rangeDays, type DateRange, type Entry, type Trip } from '../lib/model'
import { Markdown } from './ui'
import './EntryEditor.css'

const NEW_TRIP = '__new__'
// El viaje recién creado puede tardar un instante en llegar por la suscripción.
const pendingTrip = (id: string | null | undefined, trips: Trip[]) => !!id && !trips.some((t) => t.id === id)

interface Props {
  uid: string
  entry: Entry
  isNew: boolean
  trips: Trip[]
  defaultTripId?: string | null // viaje abierto en el mapa: se preselecciona para fechas nuevas
  onSave: (e: Entry) => void
  onDelete: () => void
  onCancel: () => void
}

export function EntryEditor({ uid, entry, isNew, trips, defaultTripId = null, onSave, onDelete, onCancel }: Props) {
  const [draft, setDraft] = useState<Entry>(entry)
  const [tagsText, setTagsText] = useState(entry.tags.join(', '))
  const [preview, setPreview] = useState(false)
  const [newRange, setNewRange] = useState<DateRange>({ start: '', end: '', tripId: defaultTripId })
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const addRange = () => {
    if (!newRange.start) return setRangeError('Falta la fecha de inicio. Elige al menos el día de llegada.')
    const end = newRange.end || newRange.start
    if (end < newRange.start) return setRangeError('La fecha final es anterior a la inicial. Corrige una de las dos.')
    const dates = [...draft.dates, { start: newRange.start, end, tripId: newRange.tripId || null }].sort((a, b) => a.start.localeCompare(b.start))
    set('dates', dates)
    setNewRange({ start: '', end: '', tripId: newRange.tripId })
    setRangeError(null)
  }

  const onPhoto = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setPhotoError(null)
    try {
      const path = await uploadPhoto(uid, file)
      if (draft.photoPath) void removePhoto(draft.photoPath)
      set('photoPath', path)
    } catch {
      setPhotoError('No se pudo subir la foto. Revisa tu conexión y que sea una imagen (JPG, PNG, HEIC, WebP).')
    } finally {
      setUploading(false)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const tags = [...new Set(tagsText.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]
    onSave({ ...draft, tags })
  }

  return (
    <form className="editor" onSubmit={submit}>
      <fieldset className="editor__status">
        <legend className="label">Estado</legend>
        <div className="tabs" role="radiogroup">
          {STATUSES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={draft.status === s} aria-selected={draft.status === s} onClick={() => set('status', s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </fieldset>

      {draft.status === 'wishlist' && (
        <label className="field">
          <span>Prioridad</span>
          <select value={draft.priority ?? ''} onChange={(e) => set('priority', e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sin prioridad</option>
            <option value="1">Alta</option>
            <option value="2">Media</option>
            <option value="3">Baja</option>
          </select>
        </label>
      )}

      <section className="editor__section">
        <h3 className="label">Fechas</h3>
        {draft.dates.length === 0 && <p className="muted mono editor__hint">Sin fechas. Añade una o varias visitas.</p>}
        <ul className="editor__dates">
          {draft.dates.map((r, i) => (
            <li key={`${r.start}-${i}`}>
              <span>
                {formatRange(r)} <span className="muted">· {rangeDays(r)} d</span>
              </span>
              {trips.length > 0 && (
                <select
                  className="editor__date-trip"
                  aria-label={`Viaje de ${formatRange(r)}`}
                  value={r.tripId ?? ''}
                  onChange={(e) => set('dates', draft.dates.map((d, j) => (j === i ? { ...d, tripId: e.target.value || null } : d)))}
                >
                  <option value="">Sin viaje</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <button type="button" className="icon-btn" aria-label={`Quitar ${formatRange(r)}`} onClick={() => set('dates', draft.dates.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="editor__range">
          <label className={`field ${rangeError ? 'field--error' : ''}`}>
            <span>Desde</span>
            <input type="date" value={newRange.start} onChange={(e) => setNewRange({ ...newRange, start: e.target.value })} />
          </label>
          <label className="field">
            <span>Hasta</span>
            <input type="date" value={newRange.end} min={newRange.start} onChange={(e) => setNewRange({ ...newRange, end: e.target.value })} />
          </label>
          <label className="field">
            <span>Viaje</span>
            <select
              value={newRange.tripId ?? ''}
              onChange={(e) => {
                if (e.target.value !== NEW_TRIP) return setNewRange({ ...newRange, tripId: e.target.value || null })
                const name = prompt('Nombre del viaje nuevo')?.trim()
                if (!name) return
                const trip = newTrip(name)
                void saveTrip(uid, trip)
                setNewRange({ ...newRange, tripId: trip.id })
              }}
            >
              <option value="">Sin viaje</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              {pendingTrip(newRange.tripId, trips) && <option value={newRange.tripId!}>(nuevo viaje)</option>}
              <option value={NEW_TRIP}>+ Nuevo viaje…</option>
            </select>
          </label>
          <button type="button" className="btn" onClick={addRange}>Añadir fecha</button>
        </div>
        {rangeError && <p className="field-error">{rangeError}</p>}
      </section>

      <section className="editor__section">
        <div className="editor__row">
          <h3 className="label">Descripción</h3>
          <button type="button" className="link-btn" onClick={() => setPreview((p) => !p)}>
            {preview ? 'Editar' : 'Vista previa'}
          </button>
        </div>
        {preview ? (
          <div className="editor__preview">
            {draft.description ? <Markdown source={draft.description} /> : <p className="muted mono">Nada que mostrar.</p>}
          </div>
        ) : (
          <label className="field">
            <span className="visually-hidden">Descripción en markdown</span>
            <textarea value={draft.description} maxLength={20000} placeholder="Markdown: **negrita**, listas, enlaces…" onChange={(e) => set('description', e.target.value)} />
          </label>
        )}
      </section>

      <div className="editor__grid">
        <label className="field">
          <span>Etiquetas</span>
          <input value={tagsText} placeholder="playa, trabajo, familia" onChange={(e) => setTagsText(e.target.value)} />
        </label>
        <label className="field">
          <span>Con quién</span>
          <input value={draft.people} placeholder="Ana, Luis" onChange={(e) => set('people', e.target.value)} />
        </label>
      </div>

      <fieldset className="editor__rating">
        <legend className="label">Valoración</legend>
        <div className="editor__stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={draft.rating != null && n <= draft.rating ? 'star star--on' : 'star'}
              aria-label={`${n} de 5`}
              aria-pressed={draft.rating === n}
              onClick={() => set('rating', draft.rating === n ? null : n)}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      {draft.type === 'country' && (
        <label className="field">
          <span>% del país (manual)</span>
          <input
            type="number"
            min={0}
            max={100}
            placeholder="Automático por regiones"
            value={draft.percentOverride ?? ''}
            onChange={(e) => set('percentOverride', e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value))))}
          />
        </label>
      )}

      <section className="editor__section">
        <h3 className="label">Foto</h3>
        {draft.photoPath && <PhotoPreview path={draft.photoPath} />}
        <div className="editor__row">
          <label className="btn">
            {uploading ? 'Subiendo…' : draft.photoPath ? 'Cambiar foto' : 'Subir foto'}
            <input type="file" accept="image/*" className="visually-hidden" disabled={uploading} onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          {draft.photoPath && (
            <button type="button" className="link-btn" onClick={() => set('photoPath', null)}>Quitar foto</button>
          )}
        </div>
        {photoError && <p className="field-error">{photoError}</p>}
      </section>

      <div className="editor__actions">
        <button type="submit" className="btn btn--primary" disabled={uploading}>{isNew ? 'Guardar' : 'Guardar cambios'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        {!isNew && (
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (confirm(`¿Eliminar la entrada de ${entry.name}? No se puede deshacer.`)) onDelete()
            }}
          >
            Eliminar
          </button>
        )}
      </div>
    </form>
  )
}

export function PhotoPreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    photoUrl(path).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null))
    return () => {
      alive = false
    }
  }, [path])
  return <div className="photo">{url ? <img src={url} alt="" loading="lazy" /> : <span className="mono muted">Cargando foto…</span>}</div>
}
