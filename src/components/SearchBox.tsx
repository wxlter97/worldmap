import { useEffect, useId, useRef, useState } from 'react'
import type { Geo } from '../lib/geo'
import { PLACE_TYPE_LABEL, STATUS_LABEL, flagEmoji, type Entry, type PlaceType } from '../lib/model'
import { normalize, searchPlaces, type Place } from '../lib/search'
import { t } from '../lib/i18n'
import './SearchBox.css'

interface Props {
  geo: Geo
  entries: Entry[]
  onPick: (place: Place) => void
  countryId?: string | null // limita la búsqueda a un país
  types?: PlaceType[]
  placeholder?: string
  autoFocus?: boolean
}

const FILTERS: { label: string; types: PlaceType[] | null }[] = [
  { label: 'Todo', types: null }, // etiquetas traducidas al pintar
  { label: 'Países', types: ['country'] },
  { label: 'Ciudades', types: ['city'] },
  { label: 'Lugares', types: ['landmark', 'custom'] },
  { label: 'Regiones', types: ['region'] },
]

export function SearchBox({ geo, entries, onPick, countryId, types, placeholder, autoFocus }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(0)
  const [results, setResults] = useState<Place[]>([])
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const activeTypes = types ?? FILTERS[filter].types
  const byKey = new Map(entries.map((e) => [e.key, e]))

  useEffect(() => {
    let cancelled = false
    const q = normalize(query)
    const typeSet = activeTypes ? new Set(activeTypes) : undefined
    const t = setTimeout(async () => {
      // Lugares propios primero, luego el nomenclátor mundial.
      const own: Place[] = entries
        .filter((e) => e.type === 'custom' && q.length >= 2 && normalize(e.name).includes(q))
        .filter((e) => (!typeSet || typeSet.has('custom')) && (!countryId || e.countryId === countryId))
        .map((e) => ({ type: 'custom', id: e.placeId, name: e.name, countryId: e.countryId, regionId: e.regionId, lon: e.lon, lat: e.lat }))
      const world = await searchPlaces(geo, query, { types: typeSet, countryId, limit: 30 })
      if (!cancelled) {
        setResults([...own, ...world])
        setActive(0)
      }
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [geo, entries, query, countryId, activeTypes?.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (p: Place) => {
    onPick(p)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className="search">
      <label className="visually-hidden" htmlFor={listId + '-input'}>{t('Buscar')}</label>
      <input
        ref={inputRef}
        id={listId + '-input'}
        className="input search__input"
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder ?? t('Buscar país, ciudad, lugar…')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1))
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
          else if (e.key === 'Enter' && results[active]) pick(results[active])
          else if (e.key === 'Escape') setOpen(false)
          else return
          e.preventDefault()
        }}
      />
      {!types && open && query.length >= 2 && (
        <div className="search__filters" role="group" aria-label={t('Filtrar por tipo')}>
          {FILTERS.map((f, i) => (
            <button
              key={t(f.label)}
              type="button"
              className={i === filter ? 'badge badge--ink' : 'badge'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setFilter(i)}
            >
              {t(f.label)}
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && (
        <ul className="search__results" id={listId} role="listbox">
          {results.length === 0 && <li className="search__empty">{t('Sin resultados para «{query}».', { query })}</li>}
          {results.map((p, i) => {
            const entry = byKey.get(`${p.type}:${p.id}`)
            const country = geo.countries[p.countryId]
            const region = p.regionId ? geo.regions[p.regionId] : null
            return (
              <li
                key={`${p.type}:${p.id}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="search__item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="search__flag" aria-hidden="true">{flagEmoji(country?.iso2 ?? null)}</span>
                <span className="search__text">
                  <strong>{p.name}</strong>
                  <span className="search__meta">
                    {PLACE_TYPE_LABEL[p.type]}
                    {p.source === 'unesco' && ' · UNESCO'}
                    {p.source === 'wonder' && ` · ${t('Maravilla')}`}
                    {p.type !== 'country' && country && ` · ${[region?.name, country.name].filter(Boolean).join(', ')}`}
                  </span>
                </span>
                {entry && <span className="badge badge--faro">{STATUS_LABEL[entry.status]}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
