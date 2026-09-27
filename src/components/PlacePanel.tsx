import { useMemo, useState } from 'react'
import { deleteEntry, saveEntry } from '../lib/data'
import { CONTINENTS, type Geo } from '../lib/geo'
import {
  PLACE_TYPE_LABEL,
  STATUS_LABEL,
  emptyEntry,
  entryKey,
  flagEmoji,
  formatRange,
  rangeDays,
  type CountrySummary,
  type Entry,
  type Trip,
} from '../lib/model'
import type { Place } from '../lib/search'
import { EntryEditor, PhotoPreview } from './EntryEditor'
import { SearchBox } from './SearchBox'
import { Markdown, Meter, Stars, formatNumber, formatPercent } from './ui'
import './PlacePanel.css'

interface Props {
  uid: string | null // null = solo lectura (link compartido)
  geo: Geo
  place: Place
  entries: Entry[]
  trips: Trip[]
  summaries: Map<string, CountrySummary>
  onOpen: (p: Place) => void
  onClose: () => void
  onStartPick?: (countryId: string) => void
}

const languageNames = new Intl.DisplayNames(['es'], { type: 'language' })
const langName = (code: string) => {
  try {
    return languageNames.of(code) ?? code
  } catch {
    return code
  }
}

export function PlacePanel({ uid, geo, place, entries, trips, summaries, onOpen, onClose, onStartPick }: Props) {
  const key = entryKey(place.type, place.id)
  const entry = entries.find((e) => e.key === key) ?? null
  const [editing, setEditing] = useState<Entry | null>(null)
  const country = geo.countries[place.countryId]
  const region = place.regionId ? geo.regions[place.regionId] : null
  const summary = place.type === 'country' ? summaries.get(place.id) : undefined
  const readOnly = !uid

  // Al cambiar de lugar se cierra el editor.
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setEditing(null)
  }

  const startEdit = () =>
    setEditing(
      entry ??
        emptyEntry(place.type, place.id, {
          name: place.name,
          countryId: place.countryId,
          regionId: place.regionId,
          lon: place.lon,
          lat: place.lat,
        }),
    )

  const children = useMemo(
    () =>
      place.type === 'country'
        ? entries.filter((e) => e.countryId === place.id && e.type !== 'country').sort((a, b) => a.name.localeCompare(b.name, 'es'))
        : [],
    [entries, place],
  )

  return (
    <article className="panel" aria-labelledby="panel-title">
      <header className="panel__head">
        <div className="panel__title">
          <span className="panel__flag" aria-hidden="true">{flagEmoji(country?.iso2 ?? null)}</span>
          <div>
            <p className="label muted">
              {place.type === 'country' && country?.kind === 'territory' ? 'Territorio' : PLACE_TYPE_LABEL[place.type]}
              {place.source === 'unesco' && ' · Patrimonio UNESCO'}
              {place.source === 'wonder' && ' · Maravilla del mundo'}
            </p>
            <h2 id="panel-title">{place.name}</h2>
            {place.type !== 'country' && country && (
              <p className="panel__crumbs mono">
                {region && place.type !== 'region' && <>{region.name} · </>}
                <button type="button" className="link-btn" onClick={() => onOpen(countryPlace(geo, country.id))}>{country.name}</button>
              </p>
            )}
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>×</button>
      </header>

      {summary && (
        <section className="panel__section">
          <div className="panel__percent">
            <span className="stat__value">{formatPercent(summary.percent)}</span>
            <span className="label muted">{summary.percentIsManual ? 'del país · manual' : 'del país · por regiones'}</span>
          </div>
          <Meter percent={summary.percent} label={`Porcentaje de ${place.name} visitado`} />
          {summary.status && !entry && (
            <p className="mono panel__derived">
              Estado derivado: <span className="badge badge--faro">{STATUS_LABEL[summary.status]}</span>
            </p>
          )}
        </section>
      )}

      {editing ? (
        <section className="panel__section">
          <EntryEditor
            uid={uid!}
            entry={editing}
            isNew={!entry}
            trips={trips}
            onCancel={() => setEditing(null)}
            onSave={(e) => {
              void saveEntry(uid!, e)
              setEditing(null)
            }}
            onDelete={() => {
              void deleteEntry(uid!, key)
              setEditing(null)
            }}
          />
        </section>
      ) : entry ? (
        <EntryView entry={entry} trips={trips} onEdit={readOnly ? undefined : startEdit} />
      ) : (
        !readOnly && (
          <section className="panel__section">
            <button type="button" className="btn btn--primary" onClick={startEdit}>Añadir a mi mapa</button>
          </section>
        )
      )}

      {place.type === 'country' && country && (
        <>
          <section className="panel__section">
            <h3 className="panel__h3">Ciudades y lugares</h3>
            {children.length === 0 && <p className="mono muted panel__small">Aún no hay ciudades ni lugares en {country.name}.</p>}
            <ul className="panel__list">
              {children.map((e) => (
                <li key={e.key}>
                  <button type="button" onClick={() => onOpen(entryPlace(e))}>
                    <span>
                      <strong>{e.name}</strong>
                      <span className="mono muted"> · {PLACE_TYPE_LABEL[e.type]}</span>
                    </span>
                    <span className="badge">{STATUS_LABEL[e.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!readOnly && (
              <>
                <SearchBox
                  geo={geo}
                  entries={entries}
                  countryId={country.id}
                  types={['city', 'landmark', 'region', 'custom']}
                  placeholder={`Añadir ciudad, región o lugar en ${country.name}…`}
                  onPick={onOpen}
                />
                {onStartPick && (
                  <button type="button" className="link-btn" onClick={() => onStartPick(country.id)}>
                    + Marcar un lugar propio en el mapa
                  </button>
                )}
              </>
            )}
          </section>
          <CountryFacts geo={geo} countryId={country.id} />
        </>
      )}
    </article>
  )
}

function EntryView({ entry, trips, onEdit }: { entry: Entry; trips: Trip[]; onEdit?: () => void }) {
  const totalDays = entry.dates.reduce((n, r) => n + rangeDays(r), 0)
  return (
    <section className="panel__section panel__entry">
      <div className="panel__row">
        <span className="badge badge--ink">{STATUS_LABEL[entry.status]}</span>
        {entry.status === 'wishlist' && entry.priority && (
          <span className="badge">Prioridad {['', 'alta', 'media', 'baja'][entry.priority]}</span>
        )}
        <Stars value={entry.rating} />
        {onEdit && <button type="button" className="btn btn--small panel__edit" onClick={onEdit}>Editar</button>}
      </div>
      {entry.photoPath && <PhotoPreview path={entry.photoPath} />}
      {entry.dates.length > 0 && (
        <div>
          <h3 className="label">Fechas · {totalDays} días</h3>
          <ul className="panel__dates mono">
            {entry.dates.map((r, i) => (
              <li key={i}>
                {formatRange(r)}
                {r.tripId && trips.find((t) => t.id === r.tripId) && <span className="badge">{trips.find((t) => t.id === r.tripId)!.name}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {entry.description && <Markdown source={entry.description} />}
      {(entry.people || entry.tags.length > 0) && (
        <div className="panel__row">
          {entry.people && <span className="mono panel__small">Con: {entry.people}</span>}
          {entry.tags.map((t) => (
            <span key={t} className="badge">#{t}</span>
          ))}
        </div>
      )}
    </section>
  )
}

function CountryFacts({ geo, countryId }: { geo: Geo; countryId: string }) {
  const c = geo.countries[countryId]
  const facts: [string, string | null][] = [
    ['Continente', CONTINENTS[c.continent]],
    ['Capital', c.capital],
    ['Depende de', c.sovereign ? geo.countries[c.sovereign]?.name ?? c.sovereign : null],
    ['Población', c.population ? formatNumber(c.population) : null],
    ['Superficie', c.areaKm2 ? `${formatNumber(c.areaKm2)} km²` : null],
    ['Moneda', c.currency ? `${c.currency.name} (${c.currency.code})` : null],
    ['Idiomas', c.languages.length ? c.languages.map(langName).join(', ') : null],
    ['Prefijo', c.phone ? `+${c.phone.replace(/^\+/, '')}` : null],
  ]
  return (
    <section className="panel__section">
      <h3 className="panel__h3">Datos</h3>
      <dl className="facts">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="label muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </section>
  )
}

export function countryPlace(geo: Geo, id: string): Place {
  const c = geo.countries[id]
  return { type: 'country', id, name: c?.name ?? id, countryId: id, regionId: null, lon: c?.center[0] ?? null, lat: c?.center[1] ?? null }
}

export function regionPlace(geo: Geo, id: string): Place {
  const r = geo.regions[id]
  return { type: 'region', id, name: r?.name ?? id, countryId: r?.country ?? '', regionId: id, lon: null, lat: null }
}

export function entryPlace(e: Entry): Place {
  return { type: e.type, id: e.placeId, name: e.name, countryId: e.countryId, regionId: e.regionId, lon: e.lon, lat: e.lat }
}
