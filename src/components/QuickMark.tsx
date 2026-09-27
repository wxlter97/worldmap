import { useMemo, useState } from 'react'
import { deleteEntry, saveEntry } from '../lib/data'
import { CONTINENTS, type ContinentId, type Geo } from '../lib/geo'
import { BEEN_STATUSES, STATUS_LABEL, emptyEntry, entryKey, flagEmoji, type CountrySummary, type Entry, type Status } from '../lib/model'
import { normalize } from '../lib/search'
import { t, tn } from '../lib/i18n'
import './QuickMark.css'

export const QUICK_STATUSES: Status[] = ['visited', 'lived', 'wishlist']

/** Una entrada de país sin nada más que el estado: se puede quitar sin perder información. */
const isBare = (e: Entry) =>
  e.dates.length === 0 && !e.description && !e.photoPath && !e.photos?.length && e.tags.length === 0 && !e.rating && !e.people && e.percentOverride == null

export type ToggleResult = 'added' | 'removed' | 'updated' | 'kept'

/** Marca/desmarca un país con el estado elegido. Nunca borra una entrada con fechas, notas o fotos. */
export function toggleCountry(uid: string, geo: Geo, entries: Entry[], countryId: string, status: Status): ToggleResult {
  const key = entryKey('country', countryId)
  const own = entries.find((e) => e.key === key)
  if (!own) {
    const c = geo.countries[countryId]
    const entry = emptyEntry('country', countryId, { name: c.name, countryId, regionId: null, lon: null, lat: null })
    void saveEntry(uid, { ...entry, status })
    return 'added'
  }
  if (own.status !== status) {
    void saveEntry(uid, { ...own, status })
    return 'updated'
  }
  if (!isBare(own)) return 'kept'
  void deleteEntry(uid, key)
  return 'removed'
}

interface Props {
  uid: string
  geo: Geo
  entries: Entry[]
  summaries: Map<string, CountrySummary>
  status: Status
  onStatus: (s: Status) => void
  message: string | null
  onDone: () => void
}

export function QuickMarkPanel({ uid, geo, entries, summaries, status, onStatus, message, onDone }: Props) {
  const [query, setQuery] = useState('')
  const [continent, setContinent] = useState<ContinentId>('NA')
  const [localMsg, setLocalMsg] = useState<string | null>(null)

  const countries = useMemo(() => {
    const q = normalize(query)
    return Object.values(geo.countries)
      .filter((c) => (q ? normalize(c.name).includes(q) || normalize(c.nameEn).includes(q) : c.continent === continent))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [geo, query, continent])

  const marked = [...summaries.values()].filter((s) => s.ownEntry?.status === status).length

  const toggle = (id: string) => {
    const r = toggleCountry(uid, geo, entries, id, status)
    setLocalMsg(r === 'kept' ? t('{country} tiene fechas o notas: ábrelo en el mapa para quitarlo.', { country: geo.countries[id].name }) : null)
  }

  return (
    <section className="quick" aria-labelledby="quick-title">
      <header className="quick__head">
        <div>
          <p className="label muted">{t('Marcado rápido')}</p>
          <h2 id="quick-title">{t('Toca países en el mapa')}</h2>
        </div>
        <button type="button" className="btn btn--primary" onClick={onDone}>{t('Listo')}</button>
      </header>

      <div className="quick__body">
        <div className="field">
          <span>{t('Marcar como')}</span>
          <div className="tabs" role="radiogroup" aria-label={t('Estado para marcar')}>
            {QUICK_STATUSES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={status === s} aria-selected={status === s} onClick={() => onStatus(s)}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <p className="mono quick__hint">
          {t('Un toque marca, otro toque desmarca.')} {tn(marked, '{n} país marcado como {status}.', '{n} países marcados como {status}.', { status: STATUS_LABEL[status] })}
        </p>
        {(localMsg ?? message) && <p className="notice" role="status">{localMsg ?? message}</p>}

        <label className="field">
          <span>{t('Buscar en la lista')}</span>
          <input type="search" value={query} placeholder={t('País o territorio…')} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {!query && (
          <div className="quick__continents" role="group" aria-label={t('Continente')}>
            {(Object.keys(CONTINENTS) as ContinentId[]).map((c) => (
              <button key={c} type="button" className={c === continent ? 'badge badge--ink' : 'badge'} onClick={() => setContinent(c)}>
                {CONTINENTS[c]}
              </button>
            ))}
          </div>
        )}

        <ul className="quick__list">
          {countries.map((c) => {
            const s = summaries.get(c.id)
            const own = s?.ownEntry
            const checked = own?.status === status
            const derived = !own && s?.status && BEEN_STATUSES.has(s.status)
            return (
              <li key={c.id}>
                <label className={checked ? 'quick__row quick__row--on' : 'quick__row'}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} />
                  <span aria-hidden="true">{flagEmoji(c.iso2)}</span>
                  <span className="quick__name">
                    {c.name}
                    {c.kind === 'territory' && <span className="mono muted"> · {t('territorio')}</span>}
                  </span>
                  {own && !checked && <span className="badge">{STATUS_LABEL[own.status]}</span>}
                  {derived && <span className="badge">{t('Por ciudades')}</span>}
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
