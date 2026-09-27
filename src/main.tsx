import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import './styles/tokens.css'
import './styles/base.css'
import { AppDataProvider } from './app/AppData'
import { Shell } from './app/Shell'
import { AuthProvider, useAuth } from './lib/auth'
import { ensureProfile, resolveShare, type ShareInfo } from './lib/data'
import { firebaseConfigured } from './lib/firebase'
import { AccountPage } from './pages/AccountPage'
import { ExportPage } from './pages/ExportPage'
import { ListPage } from './pages/ListPage'
import { LoginPage } from './pages/LoginPage'
import { MapPage } from './pages/MapPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { StatsPage } from './pages/StatsPage'
import { TripsPage } from './pages/TripsPage'

/** Rutas comunes a la app privada y a la vista compartida. */
function DataRoutes({ shareName }: { shareName?: string }) {
  return (
    <Routes>
      <Route element={<Shell shareName={shareName} />}>
        <Route index element={<MapPage />} />
        <Route path="lista" element={<ListPage />} />
        <Route path="viajes" element={<TripsPage />} />
        <Route path="estadisticas" element={<StatsPage />} />
        {shareName === undefined && <Route path="cuenta" element={<AccountPage />} />}
        {shareName === undefined && <Route path="exportar" element={<ExportPage />} />}
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  )
}

function PrivateApp() {
  const { user, loading } = useAuth()
  useEffect(() => {
    if (user) void ensureProfile(user.uid)
  }, [user])
  if (loading) return <p className="screen-msg mono">Cargando…</p>
  if (!user) return <LoginPage />
  return (
    <AppDataProvider uid={user.uid} readOnly={false} basePath="">
      <DataRoutes />
    </AppDataProvider>
  )
}

function SharedApp() {
  const { token = '' } = useParams()
  const [share, setShare] = useState<ShareInfo | null | undefined>(undefined)
  useEffect(() => {
    resolveShare(token).then(setShare, () => setShare(null))
  }, [token])

  if (share === undefined) return <p className="screen-msg mono">Cargando mapa compartido…</p>
  if (share === null) {
    return (
      <div className="screen-msg notice notice--error">
        Este link ya no está activo. Pide a quien te lo envió un link nuevo. <Link to="/">Ir a mi mapa</Link>
      </div>
    )
  }
  return (
    <AppDataProvider uid={share.uid} readOnly basePath={`/s/${token}`} tripId={share.tripId ?? null}>
      <DataRoutes shareName={share.displayName} />
    </AppDataProvider>
  )
}

function App() {
  if (!firebaseConfigured) {
    return (
      <p className="screen-msg notice notice--error">
        Falta la configuración de Firebase. Copia <code>.env.example</code> a <code>.env.local</code> y rellena los valores.
      </p>
    )
  }
  return (
    <Routes>
      <Route path="/privacidad" element={<PrivacyPage />} />
      <Route path="/s/:token/*" element={<SharedApp />} />
      <Route path="/*" element={<PrivateApp />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
