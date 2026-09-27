import { useRef, useState } from 'react'
import type { Geo } from '../../lib/geo'
import { PLACE_TYPE_LABEL, emptyEntry, flagEmoji, type Entry } from '../../lib/model'
import {
  estimateLeg,
  formatHours,
  haversineKm,
  newId,
  planDays,
  planPlace,
  stopCoords,
  stopKey,
  type Activity,
  type PlanDay,
  type PlanStop,
  type Schedule,
  type ScheduledStop,
  type TripPlan,
} from '../../lib/plan'
import type { Place } from '../../lib/search'
import { formatTripRange } from '../../lib/trips'
import { locale, t, tn } from '../../lib/i18n'
import type { UpdatePlan } from '../../pages/PlannerPage'
import { SearchBox } from '../SearchBox'

interface Props {
  geo: Geo
  entries: Entry[]
  plan: TripPlan
  sched: Schedule
  update: UpdatePlan
}

export function PlanItinerary({ geo, entries, plan, sched, update }: Props) {
  const addStop = (p: Place) => {
    const stop: PlanStop = { id: newId(), place: planPlace(p), nights: p.type === 'landmark' || p.type === 'custom' ? 0 : 2, activities: [] }
    const key = stopKey(stop)
    // Un lugar nuevo aparece en el mapa como «Planeado».
    const created = entries.some((e) => e.key === key)
      ? []
      : [{ ...emptyEntry(p.type, p.id, { name: p.name, countryId: p.countryId, regionId: p.regionId, lon: p.lon, lat: p.lat }), status: 'planned' as const }]
    update({ ...plan, stops: [...plan.stops, stop] }, created)
  }

  return (
    <div className="planner__panel">
      <section className="planner__section">
        <h2 className="planner__h2">{t('Paradas')}</h2>
        {plan.stops.length === 0 ? (
          <p className="mono muted planner__small">{t('Añade la primera parada: una ciudad, un país, una región o un lugar.')}</p>
        ) : (
          <StopList geo={geo} plan={plan} sched={sched} update={update} />
        )}
        <div className="planner__add-stop">
          <SearchBox geo={geo} entries={entries} onPick={addStop} placeholder={t('Añadir parada: ciudad, país, lugar…')} />
        </div>
      </section>

      {sched.totalDays > 0 && (
        <section className="planner__section">
          <h2 className="planner__h2">{t('Día a día')}</h2>
          {!plan.start && <p className="mono muted planner__small">{t('Elige la fecha de salida para ver las fechas de cada día.')}</p>}
          <ol className="plan-days">
            {planDays(sched).map((d) => (
              <DayCard key={d.index} day={d} plan={plan} update={update} />
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function StopList({ geo, plan, sched, update }: Omit<Props, 'entries'>) {
  const listRef = useRef<HTMLOListElement>(null)
  // Orden provisional mientras se arrastra una parada.
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null)
  const byId = new Map(sched.stops.map((s) => [s.stop.id, s]))
  const ordered = drag ? drag.order.map((id) => byId.get(id)!).filter(Boolean) : sched.stops

  const setStops = (stops: PlanStop[]) => update({ ...plan, stops })
  const move = (from: number, to: number) => {
    if (to < 0 || to >= plan.stops.length) return
    const stops = [...plan.stops]
    const [s] = stops.splice(from, 1)
    stops.splice(to, 0, s)
    setStops(stops)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || !listRef.current) return
    const items = [...listRef.current.querySelectorAll<HTMLElement>('li[data-id]')].filter((el) => el.dataset.id !== drag.id)
    const index = items.filter((el) => {
      const r = el.getBoundingClientRect()
      return r.top + r.height / 2 < e.clientY
    }).length
    const order = drag.order.filter((id) => id !== drag.id)
    order.splice(index, 0, drag.id)
    if (order.join() !== drag.order.join()) setDrag({ ...drag, order })
  }
  const endDrag = () => {
    if (!drag) return
    if (drag.order.join() !== plan.stops.map((s) => s.id).join()) {
      const map = new Map(plan.stops.map((s) => [s.id, s]))
      setStops(drag.order.map((id) => map.get(id)!))
    }
    setDrag(null)
  }

  return (
    <ol className="plan-stops" ref={listRef} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {ordered.map((s, i) => {
        const prev = ordered[i - 1]
        return (
          <StopRow
            key={s.stop.id}
            geo={geo}
            s={s}
            n={i}
            count={ordered.length}
            leg={prev ? legBetween(geo, prev, s) : null}
            dragging={drag?.id === s.stop.id}
            onDragStart={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setDrag({ id: s.stop.id, order: plan.stops.map((x) => x.id) })
            }}
            onNights={(nights) => setStops(plan.stops.map((x) => (x.id === s.stop.id ? { ...x, nights } : x)))}
            onMove={(d) => move(s.index, s.index + d)}
            onRemove={() => setStops(plan.stops.filter((x) => x.id !== s.stop.id))}
          />
        )
      })}
    </ol>
  )
}

function legBetween(geo: Geo, a: ScheduledStop, b: ScheduledStop) {
  const pa = stopCoords(geo, a.stop.place)
  const pb = stopCoords(geo, b.stop.place)
  if (!pa || !pb) return null
  const km = haversineKm(pa, pb)
  return km < 1 ? null : estimateLeg(km)
}

interface RowProps {
  geo: Geo
  s: ScheduledStop
  n: number
  count: number
  leg: ReturnType<typeof legBetween>
  dragging: boolean
  onDragStart: (e: React.PointerEvent<HTMLButtonElement>) => void
  onNights: (n: number) => void
  onMove: (delta: number) => void
  onRemove: () => void
}

function StopRow({ geo, s, n, count, leg, dragging, onDragStart, onNights, onMove, onRemove }: RowProps) {
  const p = s.stop.place
  const region = p.regionId && p.type !== 'region' ? geo.regions[p.regionId]?.name : null
  return (
    <>
      {leg && (
        <li className="plan-leg mono" aria-label={t('Trayecto')}>
          <span aria-hidden="true">{leg.mode === 'flight' ? '✈' : '↓'}</span>
          {Math.round(leg.km).toLocaleString(locale())} km · {formatHours(leg.hours)} {leg.mode === 'flight' ? t('en avión') : t('por tierra')}
        </li>
      )}
      <li className={dragging ? 'plan-stop plan-stop--drag' : 'plan-stop'} data-id={s.stop.id}>
        <button type="button" className="plan-stop__handle" aria-label={t('Arrastrar para reordenar')} onPointerDown={onDragStart}>
          ⋮⋮
        </button>
        <span className="plan-stop__n mono">{String(n + 1).padStart(2, '0')}</span>
        <div className="plan-stop__main">
          <strong>{flagEmoji(geo.countries[p.countryId]?.iso2 ?? null)} {p.name}</strong>
          <span className="mono muted">
            {[PLACE_TYPE_LABEL[p.type], region, s.arriveDate ? formatTripRange(s.arriveDate, s.departDate) : null].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="plan-stop__nights" role="group" aria-label={t('Noches en {place}', { place: p.name })}>
          <button type="button" aria-label={t('Una noche menos')} disabled={s.stop.nights <= 0} onClick={() => onNights(s.stop.nights - 1)}>−</button>
          <span className="mono">{s.stop.nights === 0 ? t('de paso') : tn(s.stop.nights, '{n} noche', '{n} noches')}</span>
          <button type="button" aria-label={t('Una noche más')} disabled={s.stop.nights >= 90} onClick={() => onNights(s.stop.nights + 1)}>+</button>
        </div>
        <div className="plan-stop__actions">
          <button type="button" className="icon-btn" aria-label={t('Subir')} disabled={n === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" className="icon-btn" aria-label={t('Bajar')} disabled={n === count - 1} onClick={() => onMove(1)}>↓</button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('Quitar {place}', { place: p.name })}
            onClick={() => {
              if (!s.stop.activities.length || confirm(t('¿Quitar {place} y sus actividades?', { place: p.name }))) onRemove()
            }}
          >
            ×
          </button>
        </div>
      </li>
    </>
  )
}

function fmtDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })
}

function DayCard({ day, plan, update }: { day: PlanDay; plan: TripPlan; update: UpdatePlan }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [time, setTime] = useState('')
  // En un día de traslado se elige a qué parada pertenece la actividad (por defecto, a la de llegada).
  const [stopId, setStopId] = useState(day.stops.at(-1)?.stop.id ?? '')
  const names = day.stops.map((s) => s.stop.place.name)

  const setActivities = (id: string, fn: (a: Activity[]) => Activity[]) =>
    update({ ...plan, stops: plan.stops.map((s) => (s.id === id ? { ...s, activities: fn(s.activities) } : s)) })

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const target = day.stops.find((s) => s.stop.id === stopId) ?? day.stops.at(-1)
    if (!text.trim() || !target) return
    const activity: Activity = { id: newId(), day: day.index - target.arrive, time: time || null, text: text.trim(), done: false }
    setActivities(target.stop.id, (a) => [...a, activity])
    setText('')
    setTime('')
  }

  return (
    <li className="plan-day">
      <header className="plan-day__head">
        <span className="label">{t('Día {n}', { n: day.index + 1 })}{day.date && ` · ${fmtDay(day.date)}`}</span>
        <strong>{names.join(' → ')}</strong>
      </header>
      {day.activities.length > 0 && (
        <ul className="plan-acts">
          {day.activities.map(({ stop, activity: a }) => (
            <li key={a.id} className={a.done ? 'plan-act plan-act--done' : 'plan-act'}>
              <label>
                <input
                  type="checkbox"
                  checked={a.done}
                  onChange={() => setActivities(stop.stop.id, (list) => list.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)))}
                />
                {a.time && <span className="mono plan-act__time">{a.time}</span>}
                <span className="plan-act__text">{a.text}</span>
                {day.stops.length > 1 && <span className="mono muted plan-act__stop">{stop.stop.place.name}</span>}
              </label>
              <button
                type="button"
                className="icon-btn"
                aria-label={t('Quitar actividad')}
                onClick={() => setActivities(stop.stop.id, (list) => list.filter((x) => x.id !== a.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className="plan-act-form" onSubmit={add}>
          <label className="field plan-act-form__time">
            <span>{t('Hora')}</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field plan-act-form__text">
            <span>{t('Actividad')}</span>
            <input value={text} maxLength={200} autoFocus placeholder={t('Museo, tour, cena…')} onChange={(e) => setText(e.target.value)} />
          </label>
          {day.stops.length > 1 && (
            <label className="field plan-act-form__stop">
              <span>{t('Parada')}</span>
              <select value={stopId} onChange={(e) => setStopId(e.target.value)}>
                {day.stops.map((s) => <option key={s.stop.id} value={s.stop.id}>{s.stop.place.name}</option>)}
              </select>
            </label>
          )}
          <div className="planner__row plan-act-form__actions">
            <button type="submit" className="btn btn--primary btn--small" disabled={!text.trim()}>{t('Añadir')}</button>
            <button type="button" className="btn btn--small" onClick={() => setAdding(false)}>{t('Listo')}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="link-btn plan-day__add" onClick={() => setAdding(true)}>+ {t('Actividad')}</button>
      )}
    </li>
  )
}
