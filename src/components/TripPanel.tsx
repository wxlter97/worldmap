import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { deleteTrip, disableTripShare, enableTripShare, saveTrip } from '../lib/data'
import type { Geo } from '../lib/geo'
import { PLACE_TYPE_LABEL, STATUS_LABEL, flagEmoji, formatRange, type Entry } from '../lib/model'
import type { Place } from '../lib/search'
import { schedule } from '../lib/plan'
import { formatTripRange, type TripSummary } from '../lib/trips'
import { entryPlace } from './PlacePanel'
import { Markdown } from './ui'
import { t, tn } from '../lib/i18n'
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
  const { plans } = useAppData()
  const plan = uid ? plans.get(trip.id) : undefined
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
            <p className="label muted">{t('Viaje')} · {formatTripRange(summary.start, summary.end)}</p>
            <h2 id="trip-title">{trip.name}</h2>
            <p className="panel__crumbs">{summary.countryIds.map((id) => flagEmoji(geo.countries[id]?.iso2 ?? null)).join(' ')}</p>
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label={t('Cerrar viaje')} onClick={onClose}>×</button>
      </header>

      <section className="panel__section">
        <div className="panel__row mono panel__small">
          <span className="badge badge--ink">{tn(summary.days, '{n} día', '{n} días')}</span>
          <span className="badge">{tn(summary.countryIds.length, '{n} país', '{n} países')}</span>
          <span className="badge">{tn(summary.plannedStops ?? stops.length, '{n} parada', '{n} paradas')}</span>
          {uid && !editing && <button type="button" className="btn btn--small panel__edit" onClick={startEdit}>{t('Editar')}</button>}
          {uid && !editing && <Link className="btn btn--small btn--primary" to={`/viajes/${trip.id}`}>{t('Planificador')}</Link>}
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
              <span>{t('Nombre')}</span>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>{t('Descripción (markdown)')}</span>
              <textarea value={description} maxLength={20000} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="editor__actions">
              <button type="submit" className="btn btn--primary" disabled={!name.trim()}>{t('Guardar')}</button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>{t('Cancelar')}</button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  if (!confirm(t('¿Eliminar el viaje «{name}»? Las fechas de sus lugares se conservan, sin viaje.', { name: trip.name }))) return
                  void deleteTrip(uid!, trip.id, entries, plans)
                  onDeleted()
                }}
              >
                {t('Eliminar viaje')}
              </button>
            </div>
          </form>
        ) : (
          trip.description && <Markdown source={trip.description} />
        )}
      </section>

      {uid && <TripShare uid={uid} summary={summary} entries={entries} />}

      <section className="panel__section">
        <h3 className="panel__h3">{t('Itinerario')}</h3>
        {stops.length === 0 && plan?.stops.length ? (
          <ol className="itinerary">
            {schedule(plan).stops.map((s, i) => (
              <li key={s.stop.id}>
                <button type="button" onClick={() => onOpen({ ...s.stop.place })}>
                  <span className="itinerary__n mono">{String(i + 1).padStart(2, '0')}</span>
                  <span className="itinerary__main">
                    <strong>{flagEmoji(geo.countries[s.stop.place.countryId]?.iso2 ?? null)} {s.stop.place.name}</strong>
                    <span className="mono muted">
                      {s.arriveDate ? formatTripRange(s.arriveDate, s.departDate) : tn(s.stop.nights, '{n} noche', '{n} noches')} · {STATUS_LABEL.planned}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : stops.length === 0 ? (
          <p className="mono muted panel__small">
            {t('Sin paradas. Abre un lugar, añade una fecha y elige «{name}» en el campo Viaje.', { name: trip.name })}
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

function TripShare({ uid, summary, entries }: { uid: string; summary: TripSummary; entries: Entry[] }) {
  const { profile } = useAppData()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const token = profile.tripShares?.[summary.trip.id]
  const link = token ? `${location.origin}/s/${token}` : null

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch {
      setError(t('No se pudo actualizar el link. Revisa tu conexión: compartir necesita estar en línea.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel__section">
      <h3 className="panel__h3">{t('Compartir este viaje')}</h3>
      <p className="panel__small muted">
        {t('Un link que muestra solo este viaje: sus lugares, fechas y fotos.')}{' '}
        {profile.sharing.showNotes ? t('Incluye notas y personas.') : t('Sin notas ni personas (cámbialo en Cuenta).')}
      </p>
      {link ? (
        <>
          <div className="panel__share">
            <input className="input" readOnly value={link} aria-label={t('Link del viaje')} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigator.clipboard.writeText(link).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })}
            >
              {copied ? t('Copiado') : t('Copiar')}
            </button>
          </div>
          <button type="button" className="link-btn" disabled={busy} onClick={() => run(() => disableTripShare(uid, summary.trip.id, profile))}>
            {t('Dejar de compartir')}
          </button>
        </>
      ) : (
        <button type="button" className="btn" disabled={busy} onClick={() => run(() => enableTripShare(uid, summary.trip, entries, profile))}>
          {busy ? t('Creando…') : t('Crear link del viaje')}
        </button>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  )
}
