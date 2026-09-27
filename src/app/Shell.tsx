import { signOut } from 'firebase/auth'
import { NavLink, Outlet } from 'react-router-dom'
import { Symbol } from '../components/ui'
import { auth } from '../lib/firebase'
import './Shell.css'

export function Shell({ readOnlyOwner }: { readOnlyOwner?: string }) {
  const base = readOnlyOwner ? `/s/${readOnlyOwner}` : ''
  return (
    <div className="shell">
      <header className="shell__header">
        <NavLink to={base || '/'} className="shell__brand" aria-label="Inicio">
          <Symbol size={30} />
          <span className="shell__wordmark">wxlter.</span>
          <span className="label shell__app">mapa</span>
        </NavLink>
        <nav className="shell__nav" aria-label="Principal">
          <NavLink to={base || '/'} end>Mapa</NavLink>
          <NavLink to={`${base}/lista`}>Lista</NavLink>
          <NavLink to={`${base}/estadisticas`}>Stats</NavLink>
          {!readOnlyOwner && (
            <button type="button" className="shell__out" onClick={() => signOut(auth)}>Salir</button>
          )}
        </nav>
      </header>
      {readOnlyOwner && <div className="shell__readonly label">Solo lectura · mapa compartido</div>}
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  )
}
