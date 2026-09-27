import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { Timeline } from '../components/Timeline'
import { Stars } from '../components/ui'
import { CONTINENTS, type ContinentId } from '../lib/geo'
import { PLACE_TYPE_LABEL, STATUSES, STATUS_LABEL, flagEmoji, formatRange, type PlaceType, type Status } from '../lib/model'
import { mapLink } from '../lib/links'
import { searchEntries } from '../lib/search'
import { t } from '../lib/i18n'
import './ListPage.css'

type Sort = 'recent' | 'name' | 'date' | 'rating'

export function ListPage() {
  const { geo, entries, basePath } = useAppData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [type, setType] = useState<PlaceType | ''>('')
  const [continent, setContinent] = useState<ContinentId | ''>('')
  const [year, setYear] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const [params, setParams] = useSearchParams()
  const view = params.get('vista') === 'tiempo' ? 'tiempo' : 'lista'

  const years = useMemo(
    () => [...new Set(entries.flatMap((e) => e.dates.flatMap((d) => [d.start.slice(0, 4), d.end.slice(0, 4)])))].sort().reverse(),
    [entries],
  )
  const tags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort(), [entries])

  const results = useMemo(() => {
    const firstDate = (e: (typeof entries)[number]) => e.dates[0]?.start ?? ''
    const list = searchEntries(entries, query).filter(
      (e) =>
        (!status || e.status === status) &&
        (!type || e.type === type) &&
        (!continent || geo.countries[e.countryId]?.continent === continent) &&
        (!year || e.dates.some((d) => d.start.slice(0, 4) <= year && d.end.slice(0, 4) >= year)) &&
        (!tag || e.tags.includes(tag)),
    )
    const sorters: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      recent: (a, b) => b.updatedAt - a.updatedAt,
      name: (a, b) => a.name.localeCompare(b.name, 'es'),
      date: (a, b) => firstDate(b).localeCompare(firstDate(a)),
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    }
    return list.sort(sorters[sort])
  }, [entries, query, status, type, continent, year, tag, sort, geo])

  return (
    <div className="list-page">
      <div className="list-page__head">
        <h1>{t('Mis lugares')}</h1>
        <span className="label muted">{t('{n} de {total}', { n: results.length, total: entries.length })}</span>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'lista'} onClick={() => setParams({})}>{t('Lista')}</button>
        <button type="button" role="tab" aria-selected={view === 'tiempo'} onClick={() => setParams({ vista: 'tiempo' })}>{t('Línea de tiempo')}</button>
      </div>

      {view === 'tiempo' ? (
        <Timeline />
      ) : (
        <>

          <div className="list-page__filters">
            <label className="field list-page__q">
              <span>{t('Buscar')}</span>
              <input type="search" value={query} placeholder={t('Nombre, descripción, etiqueta, persona…')} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label className="field">
              <span>{t('Estado')}</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as Status | '')}>
                <option value="">{t('Todos')}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t('Tipo')}</span>
              <select value={type} onChange={(e) => setType(e.target.value as PlaceType | '')}>
                <option value="">{t('Todos')}</option>
                {(Object.keys(PLACE_TYPE_LABEL) as PlaceType[]).map((t) => <option key={t} value={t}>{PLACE_TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t('Continente')}</span>
              <select value={continent} onChange={(e) => setContinent(e.target.value as ContinentId | '')}>
                <option value="">{t('Todos')}</option>
                {(Object.keys(CONTINENTS) as ContinentId[]).map((c) => <option key={c} value={c}>{CONTINENTS[c]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t('Año')}</span>
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">{t('Todos')}</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            {tags.length > 0 && (
              <label className="field">
                <span>{t('Etiqueta')}</span>
                <select value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="">{t('Todas')}</option>
                  {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              <span>{t('Orden')}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">{t('Editado recientemente')}</option>
                <option value="date">{t('Fecha de visita')}</option>
                <option value="name">{t('Nombre')}</option>
                <option value="rating">{t('Valoración')}</option>
              </select>
            </label>
          </div>

          {entries.length === 0 ? (
            <p className="notice">{t('Todavía no hay lugares.')} <Link to={basePath || '/'}>{t('Ve al mapa y busca el primero.')}</Link></p>
          ) : results.length === 0 ? (
            <p className="notice">{t('Ningún lugar coincide con los filtros. Quita alguno para ver más.')}</p>
          ) : (
            <ul className="list-page__list">
              {results.map((e) => {
                const country = geo.countries[e.countryId]
                return (
                  <li key={e.key}>
                    <Link to={mapLink(basePath, `p=${encodeURIComponent(e.key)}`)} className="list-card">
                      <span className="list-card__flag" aria-hidden="true">{flagEmoji(country?.iso2 ?? null)}</span>
                      <span className="list-card__main">
                        <strong>{e.name}</strong>
                        <span className="mono muted">
                          {PLACE_TYPE_LABEL[e.type]}
                          {e.type !== 'country' && country && ` · ${country.name}`}
                          {e.dates[0] && ` · ${formatRange(e.dates[0])}`}
                          {e.dates.length > 1 && ` (+${e.dates.length - 1})`}
                        </span>
                      </span>
                      <Stars value={e.rating} />
                      <span className={e.status === 'lived' || e.status === 'visited' ? 'badge badge--faro' : 'badge'}>{STATUS_LABEL[e.status]}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
