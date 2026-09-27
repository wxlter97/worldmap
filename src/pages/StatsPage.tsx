import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { AchievementList } from '../components/Achievements'
import { Meter, StatCard, formatNumber, formatPercent } from '../components/ui'
import { mapLink } from '../lib/links'
import { useAchievements } from '../lib/achievements'
import { flagEmoji } from '../lib/model'
import { computeStats } from '../lib/stats'
import { t, tn } from '../lib/i18n'
import './StatsPage.css'

export function StatsPage() {
  const { geo, entries, summaries, basePath, readOnly } = useAppData()
  const s = useMemo(() => computeStats(geo, entries, summaries), [geo, entries, summaries])
  const maxDays = s.daysByCountry[0]?.days ?? 1
  const achievements = useAchievements(geo, entries)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'logros' ? 'logros' : 'numeros'
  const unlocked = achievements?.filter((a) => a.unlocked).length ?? 0

  return (
    <div className="stats-page">
      <div className="stats-page__head">
        <h1>{t('Estadísticas')}</h1>
        <span className="label muted">
          {t('Cuenta Vivido + Visitado')}
          {!readOnly && (
            <>
              {' · '}
              <Link to="/exportar" className="link-btn">{t('Exportar póster')}</Link>
            </>
          )}
        </span>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'numeros'} onClick={() => setParams({})}>{t('Números')}</button>
        <button type="button" role="tab" aria-selected={tab === 'logros'} onClick={() => setParams({ tab: 'logros' })}>
          {t('Logros')} {achievements && `${unlocked}/${achievements.length}`}
        </button>
      </div>

      {tab === 'logros' ? (
        achievements ? <AchievementList achievements={achievements} /> : <p className="mono muted">{t('Calculando logros…')}</p>
      ) : (
        <>
          <div className="stats-grid">
            <StatCard label={t('Países ONU')} value={`${s.unCountries}/193`} meta={t('{p} de los países', { p: formatPercent((s.unCountries / 193) * 100) })} />
            <StatCard label={t('Territorios')} value={s.territories} meta={t('dependencias y otros')} />
            <StatCard label={t('Continentes')} value={`${s.continentsBeen}/7`} />
            <StatCard label={t('Superficie')} value={formatPercent(s.worldAreaPercent)} meta={t('del mundo, ponderada por regiones')} />
            <StatCard label={t('Población')} value={formatPercent(s.worldPopulationPercent)} meta={t('vive en países que visitaste')} />
            <StatCard label={t('Ciudades')} value={s.cities} />
            <StatCard label={t('Lugares')} value={s.landmarks} meta={t('{n} Patrimonio UNESCO', { n: s.unesco })} />
            <StatCard label={t('Días de viaje')} value={formatNumber(s.totalDays)} meta={t('días únicos con fecha')} />
          </div>

          <section className="stats-section">
            <h2>{t('Por continente')}</h2>
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
            <h2>{t('Días por país')}</h2>
            {s.daysByCountry.length === 0 ? (
              <p className="notice">{t('Añade fechas a tus visitas para ver cuántos días pasaste en cada país.')}</p>
            ) : (
              <ul className="stats-bars">
                {s.daysByCountry.slice(0, 20).map((d) => (
                  <li key={d.id}>
                    <Link className="stats-bars__name" to={mapLink(basePath, `p=country:${d.id}`)}>
                      {flagEmoji(geo.countries[d.id]?.iso2 ?? null)} {d.name}
                    </Link>
                    <Meter percent={(d.days / maxDays) * 100} label={d.name} />
                    <span className="mono stats-bars__value">{tn(d.days, '{n} día', '{n} días')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {s.byYear.length > 0 && (
            <section className="stats-section">
              <h2>{t('Por año')}</h2>
              <table className="stats-table">
                <thead>
                  <tr>
                    <th className="label">{t('Año')}</th>
                    <th className="label">{t('Países')}</th>
                    <th className="label">{t('Ciudades y lugares')}</th>
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
            <p className="notice">
              {tn(s.wishlist.length, 'Tienes {n} lugar en Quiero ir.', 'Tienes {n} lugares en Quiero ir.')}{' '}
              <Link to={`${basePath}/viajes?tab=quiero-ir`}>{t('Ver lista y sugerencias →')}</Link>
            </p>
          )}
        </>
      )}
    </div>
  )
}
