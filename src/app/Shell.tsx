import { NavLink, Outlet } from 'react-router-dom'
import { AchievementToaster } from '../components/Achievements'
import { StatusBar } from '../components/StatusBar'
import { Symbol } from '../components/ui'
import { useAchievements } from '../lib/achievements'
import { useAppData } from './AppData'
import { getLang, setLang, t } from '../lib/i18n'
import './Shell.css'

/** shareName definido = vista compartida de solo lectura. */
export function Shell({ shareName }: { shareName?: string }) {
  const { basePath, geo, entries, loading, trips, sharedTripId, pendingWrites } = useAppData()
  const sharedTrip = sharedTripId ? trips.find((t) => t.id === sharedTripId) : null
  const achievements = useAchievements(geo, entries)
  const home = basePath || '/'
  const shared = shareName !== undefined
  return (
    <div className="shell">
      <header className="shell__header">
        <NavLink to={home} className="shell__brand" aria-label={t('Inicio')}>
          <Symbol size={30} />
          <span className="shell__wordmark">wxlter<span className="wordmark-dot">.</span></span>
          <span className="label shell__app">{t('mapa')}</span>
        </NavLink>
        <nav className="shell__nav" aria-label={t('Principal')}>
          <NavLink to={home} end>{t('Mapa')}</NavLink>
          <NavLink to={`${basePath}/lista`}>{t('Lista')}</NavLink>
          <NavLink to={`${basePath}/viajes`}>{t('Viajes')}</NavLink>
          <NavLink to={`${basePath}/estadisticas`}>{t('Stats')}</NavLink>
          {!shared && <NavLink to="/cuenta" className="shell__account">{t('Cuenta')}</NavLink>}
        </nav>
      </header>
      {shared && (
        <div className="shell__readonly label">
          <span>
            {sharedTrip
              ? shareName
                ? t('Viaje «{trip}» de {name}', { trip: sharedTrip.name, name: shareName })
                : t('Viaje «{trip}»', { trip: sharedTrip.name })
              : shareName
                ? t('Mapa de {name}', { name: shareName })
                : t('Mapa compartido')}{' '}
            · {t('solo lectura')}
          </span>
          <button type="button" className="shell__lang" onClick={() => setLang(getLang() === 'es' ? 'en' : 'es')}>
            {getLang() === 'es' ? 'English' : 'Español'}
          </button>
        </div>
      )}
      <main className="shell__main">
        <Outlet />
      </main>
      {!shared && !loading && <AchievementToaster achievements={achievements} />}
      <StatusBar pendingWrites={!shared && pendingWrites} />
    </div>
  )
}
