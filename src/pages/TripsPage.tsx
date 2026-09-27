import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { WishlistView } from '../components/WishlistView'
import { newTrip, saveTrip } from '../lib/data'
import { mapLink } from '../lib/links'
import { flagEmoji } from '../lib/model'
import { formatTripRange, summarizeTrip } from '../lib/trips'
import './TripsPage.css'

export function TripsPage() {
  const { geo, entries, trips, uid, readOnly, basePath } = useAppData()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'quiero-ir' ? 'quiero-ir' : 'viajes'
  const wishCount = entries.filter((e) => e.status === 'wishlist' || e.status === 'planned').length

  const summaries = useMemo(
    () =>
      trips
        .map((t) => summarizeTrip(geo, t, entries))
        // Más recientes primero; los viajes sin fechas al final.
        .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '') || b.trip.createdAt - a.trip.createdAt),
    [geo, trips, entries],
  )

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const trip = newTrip(name.trim())
    void saveTrip(uid, trip)
    setName('')
    navigate(mapLink(basePath, `viaje=${trip.id}`))
  }

  return (
    <div className="trips-page">
      <div className="trips-page__head">
        <h1>Viajes</h1>
        <span className="label muted">{trips.length} {trips.length === 1 ? 'viaje' : 'viajes'} · {wishCount} por visitar</span>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'viajes'} onClick={() => setParams({})}>Mis viajes</button>
        <button type="button" role="tab" aria-selected={tab === 'quiero-ir'} onClick={() => setParams({ tab: 'quiero-ir' })}>
          Quiero ir {wishCount > 0 && `(${wishCount})`}
        </button>
      </div>

      {tab === 'quiero-ir' ? (
        <WishlistView />
      ) : (
        <>

          {!readOnly && (
            <form className="trips-page__new" onSubmit={create}>
              <label className="field">
                <span>Nuevo viaje</span>
                <input value={name} maxLength={80} placeholder="Europa 2024, Luna de miel…" onChange={(e) => setName(e.target.value)} />
              </label>
              <button type="submit" className="btn btn--primary" disabled={!name.trim()}>Crear viaje</button>
            </form>
          )}

          {summaries.length === 0 ? (
            <p className="notice">
              {readOnly
                ? 'Todavía no hay viajes.'
                : 'Crea un viaje y luego, al añadir fechas a un lugar, elige a qué viaje pertenecen.'}
            </p>
          ) : (
            <ul className="trips-grid">
              {summaries.map((s) => (
                <li key={s.trip.id}>
                  <Link className="trip-card" to={mapLink(basePath, `viaje=${s.trip.id}`)}>
                    <span className="trip-card__head label">{formatTripRange(s.start, s.end)}</span>
                    <span className="trip-card__body">
                      <strong className="trip-card__name">{s.trip.name}</strong>
                      <span className="trip-card__flags" aria-label={s.countryIds.map((id) => geo.countries[id]?.name).join(', ')}>
                        {s.countryIds.map((id) => flagEmoji(geo.countries[id]?.iso2 ?? null)).join(' ') || '—'}
                      </span>
                    </span>
                    <span className="trip-card__foot mono">
                      <span>{s.days} días</span>
                      <span>{s.countryIds.length} países</span>
                      <span>{s.stops.length} paradas</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
