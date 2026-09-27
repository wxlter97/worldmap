import { useState } from 'react'
import { deleteTrip, saveTrip } from '../lib/data'
import type { Geo } from '../lib/geo'
import { PLACE_TYPE_LABEL, STATUS_LABEL, flagEmoji, formatRange, type Entry } from '../lib/model'
import type { Place } from '../lib/search'
import { formatTripRange, type TripSummary } from '../lib/trips'
import { entryPlace } from './PlacePanel'
import { Markdown } from './ui'
import './PlacePanel.css'

interface Props {
  uid: string | null // null = solo lectura
  geo: Geo
  summary: TripSummary
  entries: Entry[]
  onOpen: (p: Place) => void
  onClose: () => void
  onDeleted: () => void
}

export function TripPanel({ uid, geo, summary, entries, onOpen, onClose, onDeleted }: Props) {
  const { trip, stops } = summary
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(trip.name)
  const [description, setDescription] = useState(trip.description)

  const startEdit = () => {
    setName(trip.name)
    setDescription(trip.description)
    setEditing(true)
  }

  return (
    <article className="panel" aria-labelledby="trip-title">
      <header className="panel__head">
        <div className="panel__title">
          <div>
            <p className="label muted">Viaje · {formatTripRange(summary.start, summary.end)}</p>
            <h2 id="trip-title">{trip.name}</h2>
            <p className="panel__crumbs">{summary.countryIds.map((id) => flagEmoji(geo.countries[id]?.iso2 ?? null)).join(' ')}</p>
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label="Cerrar viaje" onClick={onClose}>×</button>
      </header>

      <section className="panel__section">
        <div className="panel__row mono panel__small">
          <span className="badge badge--ink">{summary.days} días</span>
          <span className="badge">{summary.countryIds.length} países</span>
          <span className="badge">{stops.length} paradas</span>
          {uid && !editing && <button type="button" className="btn btn--small panel__edit" onClick={startEdit}>Editar</button>}
        </div>

        {editing ? (
          <form
            className="panel__trip-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              void saveTrip(uid!, { ...trip, name: name.trim(), description })
              setEditing(false)
            }}
          >
            <label className="field">
              <span>Nombre</span>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Descripción (markdown)</span>
              <textarea value={description} maxLength={20000} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="editor__actions">
              <button type="submit" className="btn btn--primary" disabled={!name.trim()}>Guardar</button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancelar</button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  if (!confirm(`¿Eliminar el viaje «${trip.name}»? Las fechas de sus lugares se conservan, sin viaje.`)) return
                  void deleteTrip(uid!, trip.id, entries)
                  onDeleted()
                }}
              >
                Eliminar viaje
              </button>
            </div>
          </form>
        ) : (
          trip.description && <Markdown source={trip.description} />
        )}
      </section>

      <section className="panel__section">
        <h3 className="panel__h3">Itinerario</h3>
        {stops.length === 0 ? (
          <p className="mono muted panel__small">
            Sin paradas. Abre un lugar, añade una fecha y elige «{trip.name}» en el campo Viaje.
          </p>
        ) : (
          <ol className="itinerary">
            {stops.map((s, i) => (
              <li key={`${s.entry.key}-${s.range.start}-${i}`}>
                <button type="button" onClick={() => onOpen(entryPlace(s.entry))}>
                  <span className="itinerary__n mono">{String(i + 1).padStart(2, '0')}</span>
                  <span className="itinerary__main">
                    <strong>
                      {flagEmoji(geo.countries[s.entry.countryId]?.iso2 ?? null)} {s.entry.name}
                    </strong>
                    <span className="mono muted">
                      {formatRange(s.range)} · {PLACE_TYPE_LABEL[s.entry.type]} · {STATUS_LABEL[s.entry.status]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  )
}
