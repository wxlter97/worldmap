import { useState } from 'react'
import {
  BOOKING_KINDS,
  BOOKING_KIND_LABEL,
  budgetTotals,
  formatMoney,
  newId,
  type Booking,
  type BookingKind,
  type Schedule,
  type TripPlan,
} from '../../lib/plan'
import { formatTripRange } from '../../lib/trips'
import { t } from '../../lib/i18n'
import type { UpdatePlan } from '../../pages/PlannerPage'

interface Props {
  plan: TripPlan
  sched: Schedule
  update: UpdatePlan
}

interface Draft {
  kind: BookingKind
  title: string
  amount: string
  currency: string
  paid: boolean
  date: string
  confirmation: string
  url: string
  stopId: string
}

const toDraft = (b: Booking): Draft => ({
  ...b,
  amount: b.amount == null ? '' : String(b.amount),
  date: b.date ?? '',
  stopId: b.stopId ?? '',
})

const emptyDraft = (currency: string): Draft => ({
  kind: 'lodging', title: '', amount: '', currency, paid: false, date: '', confirmation: '', url: '', stopId: '',
})

export function PlanBudget({ plan, sched, update }: Props) {
  // null = sin formulario; '' = nuevo; id = editando
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(plan.currency))
  const totals = budgetTotals(plan.bookings)
  const stopName = new Map(plan.stops.map((s) => [s.id, s.place.name]))

  const setBookings = (bookings: Booking[]) => update({ ...plan, bookings })
  const open = (b: Booking | null) => {
    setDraft(b ? toDraft(b) : emptyDraft(plan.currency))
    setEditing(b ? b.id : '')
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.title.trim()) return
    const amount = draft.amount.trim() === '' ? null : Number(draft.amount.replace(',', '.'))
    const url = draft.url.trim()
    const booking: Booking = {
      id: editing || newId(),
      kind: draft.kind,
      title: draft.title.trim(),
      amount: amount != null && Number.isFinite(amount) ? amount : null,
      currency: /^[A-Z]{3}$/.test(draft.currency) ? draft.currency : plan.currency,
      paid: draft.paid,
      date: draft.date || null,
      confirmation: draft.confirmation.trim(),
      // Solo enlaces web: nada de javascript: ni otros esquemas.
      url: /^https?:\/\//i.test(url) ? url : url ? `https://${url}` : '',
      stopId: draft.stopId || null,
    }
    setBookings(editing ? plan.bookings.map((b) => (b.id === editing ? booking : b)) : [...plan.bookings, booking])
    setEditing(null)
  }

  const sorted = [...plan.bookings].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || BOOKING_KINDS.indexOf(a.kind) - BOOKING_KINDS.indexOf(b.kind))

  return (
    <div className="planner__panel">
      <section className="planner__section">
        <h2 className="planner__h2">{t('Total')}</h2>
        {totals.length === 0 ? (
          <p className="mono muted planner__small">{t('Añade reservas y gastos con su monto para ver el total.')}</p>
        ) : (
          <div className="plan-totals">
            {totals.map((x) => (
              <div key={x.currency} className="stat">
                <div className="stat__head">{x.currency}</div>
                <div className="plan-totals__body">
                  <strong>{formatMoney(x.total, x.currency)}</strong>
                  <span className="mono">
                    {t('Pagado')} {formatMoney(x.paid, x.currency)} · {t('Pendiente')} {formatMoney(x.total - x.paid, x.currency)}
                  </span>
                  {plan.travelers > 1 && (
                    <span className="mono muted">{t('{amount} por persona', { amount: formatMoney(x.total / plan.travelers, x.currency) })}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {totals.length > 1 && <p className="mono muted planner__small">{t('Los montos en distintas monedas se suman por separado.')}</p>}
      </section>

      <section className="planner__section">
        <div className="planner__section-head">
          <h2 className="planner__h2">{t('Reservas y gastos')}</h2>
          {editing === null && <button type="button" className="btn btn--small btn--primary" onClick={() => open(null)}>+ {t('Añadir')}</button>}
        </div>

        {editing !== null && (
          <form className="plan-booking-form" onSubmit={submit}>
            <label className="field">
              <span>{t('Tipo')}</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as BookingKind })}>
                {BOOKING_KINDS.map((k) => <option key={k} value={k}>{BOOKING_KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="field plan-booking-form__wide">
              <span>{t('Descripción')}</span>
              <input value={draft.title} maxLength={120} autoFocus placeholder={t('Hotel en Lisboa, vuelo MAD–LIS…')} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('Monto')}</span>
              <input inputMode="decimal" value={draft.amount} placeholder="0" onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('Moneda')}</span>
              <input value={draft.currency} maxLength={3} list="planner-currencies" onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
            </label>
            <label className="field">
              <span>{t('Fecha')}</span>
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('Parada')}</span>
              <select value={draft.stopId} onChange={(e) => setDraft({ ...draft, stopId: e.target.value })}>
                <option value="">{t('Todo el viaje')}</option>
                {sched.stops.map((s) => <option key={s.stop.id} value={s.stop.id}>{s.stop.place.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t('Confirmación')}</span>
              <input value={draft.confirmation} maxLength={80} autoCapitalize="characters" onChange={(e) => setDraft({ ...draft, confirmation: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('Enlace')}</span>
              <input type="url" inputMode="url" value={draft.url} maxLength={500} placeholder="https://" onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            </label>
            <label className="plan-check plan-booking-form__wide">
              <input type="checkbox" checked={draft.paid} onChange={(e) => setDraft({ ...draft, paid: e.target.checked })} />
              <span>{t('Pagado')}</span>
            </label>
            <div className="planner__row plan-booking-form__wide">
              <button type="submit" className="btn btn--primary" disabled={!draft.title.trim()}>{t('Guardar')}</button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>{t('Cancelar')}</button>
              {editing && (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => {
                    setBookings(plan.bookings.filter((b) => b.id !== editing))
                    setEditing(null)
                  }}
                >
                  {t('Eliminar')}
                </button>
              )}
            </div>
          </form>
        )}

        {sorted.length > 0 && (
          <ul className="plan-bookings">
            {sorted.map((b) => (
              <li key={b.id} className="plan-booking">
                <span className="badge">{BOOKING_KIND_LABEL[b.kind]}</span>
                <div className="plan-booking__main">
                  <strong>{b.title}</strong>
                  <span className="mono muted">
                    {[b.date ? formatTripRange(b.date, b.date) : null, b.stopId ? stopName.get(b.stopId) : null].filter(Boolean).join(' · ')}
                  </span>
                  {(b.confirmation || b.url) && (
                    <span className="mono plan-booking__meta">
                      {b.confirmation && <span>{t('Conf.')} <b>{b.confirmation}</b></span>}
                      {b.url && <a href={b.url} target="_blank" rel="noopener noreferrer">{t('Abrir enlace')} ↗</a>}
                    </span>
                  )}
                </div>
                <div className="plan-booking__side">
                  {b.amount != null && <strong className="mono">{formatMoney(b.amount, b.currency)}</strong>}
                  <button
                    type="button"
                    className={b.paid ? 'badge badge--faro' : 'badge'}
                    aria-pressed={b.paid}
                    onClick={() => setBookings(plan.bookings.map((x) => (x.id === b.id ? { ...x, paid: !x.paid } : x)))}
                  >
                    {b.paid ? t('Pagado') : t('Por pagar')}
                  </button>
                  <button type="button" className="link-btn" onClick={() => open(b)}>{t('Editar')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
