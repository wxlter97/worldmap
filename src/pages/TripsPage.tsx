import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { WishlistView } from '../components/WishlistView'
import { newTrip, savePlan, saveTrip } from '../lib/data'
import { mapLink } from '../lib/links'
import { STATUS_LABEL, flagEmoji } from '../lib/model'
import { daysBetween, emptyPlan, todayIso } from '../lib/plan'
import { formatTripRange, summarizeTrip } from '../lib/trips'
import { t, tn } from '../lib/i18n'
import './TripsPage.css'

export function TripsPage() {
  const { geo, entries, trips, plans, uid, readOnly, basePath } = useAppData()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'quiero-ir' ? 'quiero-ir' : 'viajes'
  const wishCount = entries.filter((e) => e.status === 'wishlist' || e.status === 'planned').length

  const summaries = useMemo(
    () =>
      trips
        .map((t) => summarizeTrip(geo, t, entries, plans.get(t.id)))
        // Más recientes primero; los viajes sin fechas al final.
        .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '') || b.trip.createdAt - a.trip.createdAt),
    [geo, trips, entries, plans],
  )

  // «Planear» abre el planificador; «Registrar» lleva al mapa para asignar fechas pasadas.
  const create = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) return
    const plan = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') !== 'past'
    const trip = newTrip(name.trim())
    void saveTrip(uid, trip)
    if (plan) void savePlan(uid, emptyPlan(trip.id))
    setName('')
    navigate(plan ? `/viajes/${trip.id}` : mapLink(basePath, `viaje=${trip.id}`))
  }
  const today = todayIso()

  return (
    <div className="trips-page">
      <div className="trips-page__head">
        <h1>{t('Viajes')}</h1>
        <span className="label muted">{tn(trips.length, '{n} viaje', '{n} viajes')} · {t('{n} por visitar', { n: wishCount })}</span>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'viajes'} onClick={() => setParams({})}>{t('Mis viajes')}</button>
        <button type="button" role="tab" aria-selected={tab === 'quiero-ir'} onClick={() => setParams({ tab: 'quiero-ir' })}>
          {STATUS_LABEL.wishlist} {wishCount > 0 && `(${wishCount})`}
        </button>
      </div>

      {tab === 'quiero-ir' ? (
        <WishlistView />
      ) : (
        <>

          {!readOnly && (
            <form className="trips-page__new" onSubmit={create}>
              <label className="field">
                <span>{t('Nuevo viaje')}</span>
                <input value={name} maxLength={80} placeholder={t('Europa 2024, Luna de miel…')} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="trips-page__new-actions">
                <button type="submit" value="plan" className="btn btn--primary" disabled={!name.trim()}>{t('Planear viaje')}</button>
                <button type="submit" value="past" className="btn" disabled={!name.trim()}>{t('Registrar viaje pasado')}</button>
              </div>
            </form>
          )}

          {summaries.length === 0 ? (
            <p className="notice">
              {readOnly
                ? t('Todavía no hay viajes.')
                : t('Planea tu próximo viaje, o registra uno pasado y, al añadir fechas a un lugar, elige a qué viaje pertenecen.')}
            </p>
          ) : (
            <ul className="trips-grid">
              {summaries.map((s) => (
                <li key={s.trip.id}>
                  <Link className="trip-card" to={!readOnly && plans.has(s.trip.id) ? `/viajes/${s.trip.id}` : mapLink(basePath, `viaje=${s.trip.id}`)}>
                    <span className="trip-card__head label">
                      <span>{formatTripRange(s.start, s.end)}</span>
                      {s.start && s.start > today ? (
                        <span className="trip-card__soon">{tn(daysBetween(today, s.start), 'en {n} día', 'en {n} días')}</span>
                      ) : s.start && s.end && s.start <= today && today <= s.end ? (
                        <span className="trip-card__soon">{t('en curso')}</span>
                      ) : null}
                    </span>
                    <span className="trip-card__body">
                      <strong className="trip-card__name">{s.trip.name}</strong>
                      <span className="trip-card__flags" aria-label={s.countryIds.map((id) => geo.countries[id]?.name).join(', ')}>
                        {s.countryIds.map((id) => flagEmoji(geo.countries[id]?.iso2 ?? null)).join(' ') || '—'}
                      </span>
                    </span>
                    <span className="trip-card__foot mono">
                      <span>{tn(s.days, '{n} día', '{n} días')}</span>
                      <span>{tn(s.countryIds.length, '{n} país', '{n} países')}</span>
                      <span>{tn(s.plannedStops ?? s.stops.length, '{n} parada', '{n} paradas')}</span>
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
