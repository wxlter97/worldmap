import { NavLink, Outlet } from 'react-router-dom'
import { AchievementToaster } from '../components/Achievements'
import { StatusBar } from '../components/StatusBar'
import { Symbol } from '../components/ui'
import { useAchievements } from '../lib/achievements'
import { useAppData } from './AppData'
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
        <NavLink to={home} className="shell__brand" aria-label="Inicio">
          <Symbol size={30} />
          <span className="shell__wordmark">wxlter<span className="wordmark-dot">.</span></span>
          <span className="label shell__app">mapa</span>
        </NavLink>
        <nav className="shell__nav" aria-label="Principal">
          <NavLink to={home} end>Mapa</NavLink>
          <NavLink to={`${basePath}/lista`}>Lista</NavLink>
          <NavLink to={`${basePath}/viajes`}>Viajes</NavLink>
          <NavLink to={`${basePath}/estadisticas`}>Stats</NavLink>
          {!shared && <NavLink to="/cuenta" className="shell__account">Cuenta</NavLink>}
        </nav>
      </header>
      {shared && (
        <div className="shell__readonly label">
          {sharedTrip
            ? `Viaje «${sharedTrip.name}»${shareName ? ` de ${shareName}` : ''}`
            : shareName
              ? `Mapa de ${shareName}`
              : 'Mapa compartido'}{' '}
          · solo lectura
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
