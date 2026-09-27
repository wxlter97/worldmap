import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { Meter, StatCard, formatNumber, formatPercent } from '../components/ui'
import { mapLink } from '../lib/links'
import { flagEmoji } from '../lib/model'
import { computeStats } from '../lib/stats'
import './StatsPage.css'

export function StatsPage() {
  const { geo, entries, summaries, basePath } = useAppData()
  const s = useMemo(() => computeStats(geo, entries, summaries), [geo, entries, summaries])
  const maxDays = s.daysByCountry[0]?.days ?? 1

  return (
    <div className="stats-page">
      <div className="stats-page__head">
        <h1>Estadísticas</h1>
        <span className="label muted">Cuenta Vivido + Visitado</span>
      </div>

      <div className="stats-grid">
        <StatCard label="Países ONU" value={`${s.unCountries}/193`} meta={`${formatPercent((s.unCountries / 193) * 100)} de los países`} />
        <StatCard label="Territorios" value={s.territories} meta="dependencias y otros" />
        <StatCard label="Continentes" value={`${s.continentsBeen}/7`} />
        <StatCard label="Superficie" value={formatPercent(s.worldAreaPercent)} meta="del mundo, ponderada por regiones" />
        <StatCard label="Población" value={formatPercent(s.worldPopulationPercent)} meta="vive en países que visitaste" />
        <StatCard label="Ciudades" value={s.cities} />
        <StatCard label="Lugares" value={s.landmarks} meta={`${s.unesco} Patrimonio UNESCO`} />
        <StatCard label="Días de viaje" value={formatNumber(s.totalDays)} meta="días únicos con fecha" />
      </div>

      <section className="stats-section">
        <h2>Por continente</h2>
        <ul className="stats-bars">
          {s.continents.map((c) => (
            <li key={c.id}>
              <span className="stats-bars__name">{c.name}</span>
              <Meter percent={c.total ? (c.been / c.total) * 100 : 0} label={c.name} />
              <span className="mono stats-bars__value">{c.been}/{c.total}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stats-section">
        <h2>Días por país</h2>
        {s.daysByCountry.length === 0 ? (
          <p className="notice">Añade fechas a tus visitas para ver cuántos días pasaste en cada país.</p>
        ) : (
          <ul className="stats-bars">
            {s.daysByCountry.slice(0, 20).map((d) => (
              <li key={d.id}>
                <Link className="stats-bars__name" to={mapLink(basePath, `p=country:${d.id}`)}>
                  {flagEmoji(geo.countries[d.id]?.iso2 ?? null)} {d.name}
                </Link>
                <Meter percent={(d.days / maxDays) * 100} label={d.name} />
                <span className="mono stats-bars__value">{formatNumber(d.days)} d</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {s.byYear.length > 0 && (
        <section className="stats-section">
          <h2>Por año</h2>
          <table className="stats-table">
            <thead>
              <tr>
                <th className="label">Año</th>
                <th className="label">Países</th>
                <th className="label">Ciudades y lugares</th>
              </tr>
            </thead>
            <tbody>
              {s.byYear.map((y) => (
                <tr key={y.year}>
                  <td className="mono">{y.year}</td>
                  <td>{y.countries}</td>
                  <td>{y.places}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {s.wishlist.length > 0 && (
        <section className="stats-section">
          <h2>Quiero ir</h2>
          <ul className="stats-wish">
            {s.wishlist.map((e) => (
              <li key={e.key}>
                <Link to={mapLink(basePath, `p=${encodeURIComponent(e.key)}`)}>
                  {flagEmoji(geo.countries[e.countryId]?.iso2 ?? null)} {e.name}
                </Link>
                {e.priority && <span className="badge">{['', 'Alta', 'Media', 'Baja'][e.priority]}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
