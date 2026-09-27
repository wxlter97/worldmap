import { NavLink, Outlet } from 'react-router-dom'
import { Symbol } from '../components/ui'
import { useAppData } from './AppData'
import './Shell.css'

/** shareName definido = vista compartida de solo lectura. */
export function Shell({ shareName }: { shareName?: string }) {
  const { basePath } = useAppData()
  const home = basePath || '/'
  const shared = shareName !== undefined
  return (
    <div className="shell">
      <header className="shell__header">
        <NavLink to={home} className="shell__brand" aria-label="Inicio">
          <Symbol size={30} />
          <span className="shell__wordmark">wxlter.</span>
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
          {shareName ? `Mapa de ${shareName}` : 'Mapa compartido'} · solo lectura
        </div>
      )}
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  )
}
