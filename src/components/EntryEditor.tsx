import { useState } from 'react'
import { newTrip, removePhoto, saveTrip, uploadPhoto } from '../lib/data'
import { MAX_PHOTOS, PhotoThumb, entryPhotos } from './Photos'
import { STATUSES, STATUS_LABEL, formatRange, rangeDays, type DateRange, type Entry, type Trip } from '../lib/model'
import { Markdown } from './ui'
import { t, tn } from '../lib/i18n'
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
  const [photos, setPhotos] = useState<string[]>(() => entryPhotos(entry))
  // Subidas de esta edición: si se cancela, se borran para no dejar fotos huérfanas.
  const [uploaded, setUploaded] = useState<string[]>([])

  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const addRange = () => {
    if (!newRange.start) return setRangeError(t('Falta la fecha de inicio. Elige al menos el día de llegada.'))
    const end = newRange.end || newRange.start
    if (end < newRange.start) return setRangeError(t('La fecha final es anterior a la inicial. Corrige una de las dos.'))
    const dates = [...draft.dates, { start: newRange.start, end, tripId: newRange.tripId || null }].sort((a, b) => a.start.localeCompare(b.start))
    set('dates', dates)
    setNewRange({ start: '', end: '', tripId: newRange.tripId })
    setRangeError(null)
  }

  const onPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    const room = MAX_PHOTOS - photos.length
    const list = [...files].slice(0, room)
    setPhotoError(files.length > room ? t('Máximo {max} fotos por lugar: se subirán solo {n}.', { max: MAX_PHOTOS, n: room }) : null)
    setUploading(true)
    let failed = 0
    for (const file of list) {
      try {
        const path = await uploadPhoto(uid, file)
        setPhotos((p) => [...p, path])
        setUploaded((u) => [...u, path])
      } catch {
        failed++
      }
    }
    if (failed) setPhotoError(tn(failed, 'No se pudo subir {n} foto. Revisa tu conexión y que sea una imagen (JPG, PNG, HEIC, WebP).', 'No se pudieron subir {n} fotos. Revisa tu conexión y que sean imágenes (JPG, PNG, HEIC, WebP).'))
    setUploading(false)
  }

  const removeAt = (i: number) => setPhotos((p) => p.filter((_, j) => j !== i))
  const makeCover = (i: number) => setPhotos((p) => [p[i], ...p.filter((_, j) => j !== i)])

  const cancel = () => {
    for (const path of uploaded) void removePhoto(path)
    onCancel()
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const tags = [...new Set(tagsText.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]
    // Las fotos quitadas de la entrada se borran del almacenamiento.
    for (const path of entryPhotos(entry)) if (!photos.includes(path)) void removePhoto(path)
    for (const path of uploaded) if (!photos.includes(path)) void removePhoto(path)
    onSave({ ...draft, tags, photos, photoPath: photos[0] ?? null })
  }

  return (
    <form className="editor" onSubmit={submit}>
      <fieldset className="editor__status">
        <legend className="label">{t('Estado')}</legend>
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
          <span>{t('Prioridad')}</span>
          <select value={draft.priority ?? ''} onChange={(e) => set('priority', e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('Sin prioridad')}</option>
            <option value="1">{t('Alta')}</option>
            <option value="2">{t('Media')}</option>
            <option value="3">{t('Baja')}</option>
          </select>
        </label>
      )}

      <section className="editor__section">
        <h3 className="label">{t('Fechas')}</h3>
        {draft.dates.length === 0 && <p className="muted mono editor__hint">{t('Sin fechas. Añade una o varias visitas.')}</p>}
        <ul className="editor__dates">
          {draft.dates.map((r, i) => (
            <li key={`${r.start}-${i}`} className="editor__date">
              <span className="editor__date-main">
                <span className="editor__date-range">{formatRange(r)}</span>
                <span className="muted">{tn(rangeDays(r), '{n} día', '{n} días')}</span>
              </span>
              {trips.length > 0 && (
                <select
                  className="editor__date-trip"
                  aria-label={t('Viaje de {fechas}', { fechas: formatRange(r) })}
                  value={r.tripId ?? ''}
                  onChange={(e) => set('dates', draft.dates.map((d, j) => (j === i ? { ...d, tripId: e.target.value || null } : d)))}
                >
                  <option value="">{t('Sin viaje')}</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <button type="button" className="icon-btn editor__date-remove" aria-label={t('Quitar {fechas}', { fechas: formatRange(r) })} onClick={() => set('dates', draft.dates.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="editor__range">
          <label className={`field ${rangeError ? 'field--error' : ''}`}>
            <span>{t('Desde')}</span>
            <input
              type="date"
              value={newRange.start}
              onChange={(e) => {
                const start = e.target.value
                // El fin sigue al inicio: así el selector de «Hasta» abre en el mismo mes, no en hoy.
                const end = !newRange.end || newRange.end < start ? start : newRange.end
                setNewRange({ ...newRange, start, end })
              }}
            />
          </label>
          <label className="field">
            <span>{t('Hasta')}</span>
            <input type="date" value={newRange.end} min={newRange.start} onChange={(e) => setNewRange({ ...newRange, end: e.target.value })} />
          </label>
          <label className="field editor__range-wide">
            <span>{t('Viaje')}</span>
            <select
              value={newRange.tripId ?? ''}
              onChange={(e) => {
                if (e.target.value !== NEW_TRIP) return setNewRange({ ...newRange, tripId: e.target.value || null })
                const name = prompt(t('Nombre del viaje nuevo'))?.trim()
                if (!name) return
                const trip = newTrip(name)
                void saveTrip(uid, trip)
                setNewRange({ ...newRange, tripId: trip.id })
              }}
            >
              <option value="">{t('Sin viaje')}</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              {pendingTrip(newRange.tripId, trips) && <option value={newRange.tripId!}>{t('(nuevo viaje)')}</option>}
              <option value={NEW_TRIP}>{t('+ Nuevo viaje…')}</option>
            </select>
          </label>
          <button type="button" className="btn editor__range-wide" onClick={addRange}>{t('Añadir fecha')}</button>
        </div>
        {rangeError && <p className="field-error">{rangeError}</p>}
      </section>

      <section className="editor__section">
        <div className="editor__row">
          <h3 className="label">{t('Descripción')}</h3>
          <button type="button" className="link-btn" onClick={() => setPreview((p) => !p)}>
            {preview ? t('Editar') : t('Vista previa')}
          </button>
        </div>
        {preview ? (
          <div className="editor__preview">
            {draft.description ? <Markdown source={draft.description} /> : <p className="muted mono">{t('Nada que mostrar.')}</p>}
          </div>
        ) : (
          <label className="field">
            <span className="visually-hidden">{t('Descripción en markdown')}</span>
            <textarea value={draft.description} maxLength={20000} placeholder={t('Markdown: **negrita**, listas, enlaces…')} onChange={(e) => set('description', e.target.value)} />
          </label>
        )}
      </section>

      <div className="editor__grid">
        <label className="field">
          <span>{t('Etiquetas')}</span>
          <input value={tagsText} placeholder={t('playa, trabajo, familia')} onChange={(e) => setTagsText(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('Con quién')}</span>
          <input value={draft.people} placeholder="Ana, Luis" onChange={(e) => set('people', e.target.value)} />
        </label>
      </div>

      <fieldset className="editor__rating">
        <legend className="label">{t('Valoración')}</legend>
        <div className="editor__stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={draft.rating != null && n <= draft.rating ? 'star star--on' : 'star'}
              aria-label={t('{n} de 5', { n })}
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
          <span>{t('% del país (manual)')}</span>
          <input
            type="number"
            min={0}
            max={100}
            placeholder={t('Automático por regiones')}
            value={draft.percentOverride ?? ''}
            onChange={(e) => set('percentOverride', e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value))))}
          />
        </label>
      )}

      <section className="editor__section">
        <h3 className="label">{t('Fotos')} · {photos.length}/{MAX_PHOTOS}</h3>
        {photos.length > 0 && (
          <ul className="photo-grid" role="list">
            {photos.map((path, i) => (
              <li key={path} className="photo-cell">
                <PhotoThumb path={path} />
                <div className="photo-cell__actions">
                  {i === 0 ? (
                    <button type="button" className="photo-cell__cover" disabled>{t('Portada')}</button>
                  ) : (
                    <button type="button" onClick={() => makeCover(i)} aria-label={t('Usar foto {n} como portada', { n: i + 1 })}>★</button>
                  )}
                  <button type="button" onClick={() => removeAt(i)} aria-label={t('Quitar foto {n}', { n: i + 1 })}>{t('Quitar')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="editor__row">
          <label className={photos.length >= MAX_PHOTOS ? 'btn btn--disabled' : 'btn'} aria-disabled={uploading || photos.length >= MAX_PHOTOS}>
            {uploading ? t('Subiendo…') : photos.length ? t('Añadir fotos') : t('Subir fotos')}
            <input
              type="file"
              accept="image/*"
              multiple
              className="visually-hidden"
              disabled={uploading || photos.length >= MAX_PHOTOS}
              onChange={(e) => {
                void onPhotos(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        {photoError && <p className="field-error">{photoError}</p>}
      </section>

      <div className="editor__actions">
        <button type="submit" className="btn btn--primary" disabled={uploading}>{isNew ? t('Guardar') : t('Guardar cambios')}</button>
        <button type="button" className="btn" disabled={uploading} onClick={cancel}>{t('Cancelar')}</button>
        {!isNew && (
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (confirm(t('¿Eliminar la entrada de {name}? No se puede deshacer.', { name: entry.name }))) onDelete()
            }}
          >
            {t('Eliminar')}
          </button>
        )}
      </div>
    </form>
  )
}

