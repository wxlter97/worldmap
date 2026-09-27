import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { PlanBudget } from '../components/planner/PlanBudget'
import { PlanChecklist } from '../components/planner/PlanChecklist'
import { PlanItinerary } from '../components/planner/PlanItinerary'
import { closePlan, savePlanWithEntries } from '../lib/data'
import { mapLink } from '../lib/links'
import { flagEmoji, type Entry } from '../lib/model'
import {
  budgetTotals,
  closingEntries,
  daysBetween,
  emptyPlan,
  formatMoney,
  needsClosing,
  schedule,
  todayIso,
  type TripPlan,
} from '../lib/plan'
import { formatTripRange } from '../lib/trips'
import { t, tn } from '../lib/i18n'
import './PlannerPage.css'

type Tab = 'itinerario' | 'presupuesto' | 'preparacion'
const TABS: { id: Tab; label: string }[] = [
  { id: 'itinerario', label: 'Itinerario' },
  { id: 'presupuesto', label: 'Presupuesto' },
  { id: 'preparacion', label: 'Preparación' },
]

/** Cambia el plan y sincroniza las entradas «Planeado» del mapa. */
export type UpdatePlan = (next: TripPlan, created?: Entry[]) => void

export function PlannerPage() {
  const { tripId = '' } = useParams()
  const { geo, entries, trips, plans, uid, loading } = useAppData()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((x) => x.id === params.get('tab'))?.id ?? 'itinerario') as Tab
  const trip = trips.find((x) => x.id === tripId)
  const stored = plans.get(tripId) ?? null
  const plan = useMemo(() => stored ?? emptyPlan(tripId), [stored, tripId])
  const sched = useMemo(() => schedule(plan), [plan])

  if (!trip) {
    return (
      <div className="planner">
        {loading || !trips.length ? (
          <p className="mono muted">{t('Cargando…')}</p>
        ) : (
          <p className="notice">
            {t('Este viaje no existe o fue eliminado.')} <Link to="/viajes">{t('Ver mis viajes')}</Link>
          </p>
        )}
      </div>
    )
  }

  const update: UpdatePlan = (next, created) => void savePlanWithEntries(uid, next, stored, entries, plans, created)
  const countryIds = [...new Set(plan.stops.map((s) => s.place.countryId))]
  const totals = budgetTotals(plan.bookings)

  return (
    <div className="planner">
      <Link className="planner__back mono" to="/viajes">← {t('Viajes')}</Link>

      <header className="planner__head">
        <div>
          <p className="label muted">{t('Planificador')} · {formatTripRange(sched.start, sched.end)}</p>
          <h1>{trip.name}</h1>
          {countryIds.length > 0 && <p className="planner__flags">{countryIds.map((id) => flagEmoji(geo.countries[id]?.iso2 ?? null)).join(' ')}</p>}
        </div>
        <Countdown start={sched.start} end={sched.end} totalDays={sched.totalDays} />
      </header>

      <div className="planner__summary mono">
        <span className="badge badge--ink">{tn(sched.totalDays, '{n} día', '{n} días')}</span>
        <span className="badge">{tn(plan.stops.length, '{n} parada', '{n} paradas')}</span>
        <span className="badge">{tn(countryIds.length, '{n} país', '{n} países')}</span>
        {totals.map((x) => (
          <span key={x.currency} className="badge">{formatMoney(x.total, x.currency)}</span>
        ))}
        <Link className="btn btn--small planner__map" to={mapLink('', `viaje=${trip.id}`)}>{t('Ver en el mapa')}</Link>
      </div>

      <PlanSettings plan={plan} update={update} />

      {needsClosing(plan) && <ClosingBanner key={plan.tripId} plan={plan} entries={entries} />}

      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setParams(x.id === 'itinerario' ? {} : { tab: x.id }, { replace: true })}>
            {t(x.label)}
            {x.id === 'presupuesto' && plan.bookings.length > 0 && ` (${plan.bookings.length})`}
            {x.id === 'preparacion' && plan.checklist.length > 0 && ` (${plan.checklist.filter((i) => i.done).length}/${plan.checklist.length})`}
          </button>
        ))}
      </div>

      {tab === 'itinerario' && <PlanItinerary geo={geo} entries={entries} plan={plan} sched={sched} update={update} />}
      {tab === 'presupuesto' && <PlanBudget plan={plan} sched={sched} update={update} />}
      {tab === 'preparacion' && <PlanChecklist geo={geo} plan={plan} plans={plans} trips={trips} update={update} />}
    </div>
  )
}

function Countdown({ start, end, totalDays }: { start: string | null; end: string | null; totalDays: number }) {
  if (!start || !end) return null
  const today = todayIso()
  let big: string
  let small: string
  if (today < start) {
    const n = daysBetween(today, start)
    big = String(n)
    small = n === 1 ? t('día para salir') : t('días para salir')
  } else if (today <= end) {
    big = `${daysBetween(start, today) + 1}/${totalDays}`
    small = t('día del viaje')
  } else {
    return null
  }
  return (
    <div className="planner__countdown">
      <strong>{big}</strong>
      <span className="label">{small}</span>
    </div>
  )
}

function PlanSettings({ plan, update }: { plan: TripPlan; update: UpdatePlan }) {
  const { geo } = useAppData()
  const [currency, setCurrency] = useState(plan.currency)
  const currencies = useMemo(
    () => [...new Set(Object.values(geo.countries).map((c) => c.currency?.code).filter((c): c is string => !!c))].sort(),
    [geo],
  )
  const commitCurrency = () => {
    const code = currency.trim().toUpperCase()
    if (/^[A-Z]{3}$/.test(code) && code !== plan.currency) update({ ...plan, currency: code })
    else setCurrency(plan.currency)
  }
  return (
    <div className="planner__settings">
      <label className="field">
        <span>{t('Salida')}</span>
        <input type="date" value={plan.start ?? ''} onChange={(e) => update({ ...plan, start: e.target.value || null, closed: false })} />
      </label>
      <label className="field">
        <span>{t('Viajeros')}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={plan.travelers}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value))
            if (n >= 1 && n <= 50) update({ ...plan, travelers: n })
          }}
        />
      </label>
      <label className="field">
        <span>{t('Moneda')}</span>
        <input
          value={currency}
          maxLength={3}
          list="planner-currencies"
          autoCapitalize="characters"
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          onBlur={commitCurrency}
          onKeyDown={(e) => e.key === 'Enter' && commitCurrency()}
        />
        <datalist id="planner-currencies">
          {currencies.map((c) => <option key={c} value={c} />)}
        </datalist>
      </label>
    </div>
  )
}

/** Pasada la fecha de fin: propone marcar las paradas como visitadas con sus fechas. */
function ClosingBanner({ plan, entries }: { plan: TripPlan; entries: Entry[] }) {
  const { uid, geo } = useAppData()
  const sched = schedule(plan)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(() => new Set(plan.stops.map((s) => s.id)))
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <section className="notice planner__closing" aria-labelledby="closing-title">
      <strong id="closing-title">{t('Este viaje terminó el {date}.', { date: formatTripRange(sched.end, sched.end) })}</strong>
      <p>{t('¿Marcamos sus paradas como visitadas? Se añaden al mapa con sus fechas y este viaje.')}</p>
      {open ? (
        <>
          <ul className="planner__closing-list">
            {sched.stops.map((s) => (
              <li key={s.stop.id}>
                <label>
                  <input type="checkbox" checked={picked.has(s.stop.id)} onChange={() => toggle(s.stop.id)} />
                  <span>
                    {flagEmoji(geo.countries[s.stop.place.countryId]?.iso2 ?? null)} {s.stop.place.name}
                    <span className="mono muted"> · {formatTripRange(s.arriveDate, s.departDate)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="planner__row">
            <button type="button" className="btn btn--primary" disabled={!picked.size} onClick={() => void closePlan(uid, plan, closingEntries(plan, entries, picked))}>
              {tn(picked.size, 'Marcar {n} como visitada', 'Marcar {n} como visitadas')}
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>{t('Cancelar')}</button>
          </div>
        </>
      ) : (
        <div className="planner__row">
          <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>{t('Revisar paradas')}</button>
          <button type="button" className="btn" onClick={() => void closePlan(uid, plan, [])}>{t('No, dejarlo así')}</button>
        </div>
      )}
    </section>
  )
}
