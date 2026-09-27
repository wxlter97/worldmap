import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { mapLink } from '../lib/links'
import { BEEN_STATUSES, PLACE_TYPE_LABEL, STATUS_LABEL, flagEmoji, formatRange, rangeDays, type DateRange, type Entry } from '../lib/model'
import { uniqueDays } from '../lib/stats'
import { PhotoThumb, entryPhotos } from './Photos'
import { locale, t, tn } from '../lib/i18n'
import './Timeline.css'

interface Item {
  entry: Entry
  range: DateRange
}

const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString(locale(), { month: 'long' }).replace(/^./, (c) => c.toUpperCase())

/** Diario de viajes: cada visita con fecha, por año y mes; lo planeado a futuro aparece primero. */
export function Timeline() {
  const { geo, entries, trips, basePath } = useAppData()
  const today = new Date().toLocaleDateString('sv')
  const tripName = new Map(trips.map((t) => [t.id, t.name]))

  const { upcoming, years, undated } = useMemo(() => {
    const items: Item[] = []
    for (const e of entries) for (const range of e.dates) if (e.status !== 'wishlist') items.push({ entry: e, range })
    items.sort((a, b) => b.range.start.localeCompare(a.range.start))
    const upcoming = items.filter((i) => i.range.start > today).reverse()
    const past = items.filter((i) => i.range.start <= today)
    const years = new Map<string, Item[]>()
    for (const i of past) {
      const y = i.range.start.slice(0, 4)
      if (!years.has(y)) years.set(y, [])
      years.get(y)!.push(i)
    }
    const undated = entries.filter((e) => e.dates.length === 0 && e.status !== 'wishlist').length
    return { upcoming, years, undated }
  }, [entries, today])

  const row = (i: Item, k: number) => {
    const country = geo.countries[i.entry.countryId]
    const cover = entryPhotos(i.entry)[0]
    return (
      <li key={`${i.entry.key}-${i.range.start}-${k}`}>
        <Link className="tl-item" to={mapLink(basePath, `p=${encodeURIComponent(i.entry.key)}`)}>
          <span className="tl-item__date mono">{formatRange(i.range)}</span>
          <span className="tl-item__main">
            <strong>
              <span aria-hidden="true">{flagEmoji(country?.iso2 ?? null)}</span> {i.entry.name}
            </strong>
            <span className="mono muted">
              {PLACE_TYPE_LABEL[i.entry.type]}
              {i.entry.type !== 'country' && country && ` · ${country.name}`} · {tn(rangeDays(i.range), '{n} día', '{n} días')}
              {!BEEN_STATUSES.has(i.entry.status) && ` · ${STATUS_LABEL[i.entry.status]}`}
            </span>
            {i.range.tripId && tripName.get(i.range.tripId) && <span className="badge">{tripName.get(i.range.tripId)}</span>}
          </span>
          {cover && <span className="tl-item__photo"><PhotoThumb path={cover} /></span>}
        </Link>
      </li>
    )
  }

  if (!upcoming.length && !years.size) {
    return <p className="notice">{t('Aún no hay visitas con fecha. Añade fechas a tus lugares para ver tu diario de viajes.')}</p>
  }

  return (
    <div className="timeline">
      {upcoming.length > 0 && (
        <section className="tl-year tl-year--upcoming">
          <h2>{t('Próximamente')}</h2>
          <ul className="tl-list">{upcoming.map(row)}</ul>
        </section>
      )}
      {[...years].map(([year, items]) => {
        const countries = new Set(items.filter((i) => BEEN_STATUSES.has(i.entry.status)).map((i) => i.entry.countryId))
        const months = new Map<string, Item[]>()
        for (const i of items) {
          const m = i.range.start.slice(0, 7)
          if (!months.has(m)) months.set(m, [])
          months.get(m)!.push(i)
        }
        return (
          <section key={year} className="tl-year">
            <div className="tl-year__head">
              <h2>{year}</h2>
              <span className="mono muted">
                {tn(countries.size, '{n} país', '{n} países')} · {tn(items.length, '{n} visita', '{n} visitas')} ·{' '}
                {tn(uniqueDays(items.map((i) => i.range)), '{n} día', '{n} días')}
              </span>
            </div>
            {[...months].map(([ym, list]) => (
              <div key={ym} className="tl-month">
                <h3 className="label">{monthName(ym)}</h3>
                <ul className="tl-list">{list.map(row)}</ul>
              </div>
            ))}
          </section>
        )
      })}
      {undated > 0 && (
        <p className="mono muted tl-undated">
          {tn(undated, '{n} lugar sin fechas no aparece aquí.', '{n} lugares sin fechas no aparecen aquí.')}
        </p>
      )}
    </div>
  )
}
