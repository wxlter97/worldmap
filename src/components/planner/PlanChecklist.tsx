import { useState } from 'react'
import type { Geo } from '../../lib/geo'
import type { Trip } from '../../lib/model'
import { CHECK_GROUPS, CHECK_GROUP_LABEL, mergeChecklist, newId, suggestedChecklist, type CheckGroup, type CheckItem, type TripPlan } from '../../lib/plan'
import { t } from '../../lib/i18n'
import type { UpdatePlan } from '../../pages/PlannerPage'

interface Props {
  geo: Geo
  plan: TripPlan
  plans: Map<string, TripPlan>
  trips: Trip[]
  update: UpdatePlan
}

export function PlanChecklist({ geo, plan, plans, trips, update }: Props) {
  const [text, setText] = useState('')
  const [group, setGroup] = useState<CheckGroup>('luggage')
  const setList = (checklist: CheckItem[]) => update({ ...plan, checklist })
  const done = plan.checklist.filter((i) => i.done).length
  // Otros viajes con lista: se copian como plantilla (sin marcar).
  const sources = trips.filter((x) => x.id !== plan.tripId && (plans.get(x.id)?.checklist.length ?? 0) > 0)

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setList([...plan.checklist, { id: newId(), group, text: text.trim(), done: false }])
    setText('')
  }

  return (
    <div className="planner__panel">
      <section className="planner__section">
        <div className="planner__section-head">
          <h2 className="planner__h2">{t('Preparación')}</h2>
          {plan.checklist.length > 0 && <span className="mono">{done}/{plan.checklist.length}</span>}
        </div>
        {plan.checklist.length > 0 && (
          <div className="plan-progress" role="progressbar" aria-valuemin={0} aria-valuemax={plan.checklist.length} aria-valuenow={done}>
            <i style={{ width: `${(done / plan.checklist.length) * 100}%` }} />
          </div>
        )}
        <div className="planner__row">
          <button type="button" className="btn btn--small" onClick={() => setList(mergeChecklist(plan.checklist, suggestedChecklist(geo, plan)))}>
            {plan.checklist.length ? t('Añadir lista sugerida') : t('Usar lista sugerida')}
          </button>
          {sources.length > 0 && (
            <select
              className="input plan-copy"
              value=""
              aria-label={t('Copiar la lista de otro viaje')}
              onChange={(e) => {
                const src = plans.get(e.target.value)
                if (src) setList(mergeChecklist(plan.checklist, src.checklist))
              }}
            >
              <option value="">{t('Copiar de otro viaje…')}</option>
              {sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
        </div>
      </section>

      {CHECK_GROUPS.map((g) => {
        const items = plan.checklist.filter((i) => i.group === g)
        if (!items.length) return null
        return (
          <section key={g} className="planner__section">
            <h3 className="label">{CHECK_GROUP_LABEL[g]}</h3>
            <ul className="plan-checklist">
              {items.map((i) => (
                <li key={i.id} className={i.done ? 'plan-act plan-act--done' : 'plan-act'}>
                  <label>
                    <input type="checkbox" checked={i.done} onChange={() => setList(plan.checklist.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))} />
                    <span className="plan-act__text">{i.text}</span>
                  </label>
                  <button type="button" className="icon-btn" aria-label={t('Quitar «{item}»', { item: i.text })} onClick={() => setList(plan.checklist.filter((x) => x.id !== i.id))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <form className="plan-check-form" onSubmit={add}>
        <label className="field">
          <span>{t('Grupo')}</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as CheckGroup)}>
            {CHECK_GROUPS.map((g) => <option key={g} value={g}>{CHECK_GROUP_LABEL[g]}</option>)}
          </select>
        </label>
        <label className="field plan-check-form__text">
          <span>{t('Nuevo ítem')}</span>
          <input value={text} maxLength={200} placeholder={t('Cámara, guía, reservar tour…')} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" className="btn btn--primary" disabled={!text.trim()}>{t('Añadir')}</button>
      </form>
    </div>
  )
}
