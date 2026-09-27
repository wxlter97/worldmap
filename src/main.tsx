import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './styles/tokens.css'
import './styles/base.css'
import { AppDataProvider } from './app/AppData'
import { Shell } from './app/Shell'
import { AuthProvider, useAuth } from './lib/auth'
import { firebaseConfigured } from './lib/firebase'
import { ListPage } from './pages/ListPage'
import { LoginPage } from './pages/LoginPage'
import { MapPage } from './pages/MapPage'
import { StatsPage } from './pages/StatsPage'

function App() {
  const { user, loading } = useAuth()
  if (!firebaseConfigured) {
    return (
      <p className="screen-msg notice notice--error">
        Falta la configuración de Firebase. Copia <code>.env.example</code> a <code>.env.local</code> y rellena los valores.
      </p>
    )
  }
  if (loading) return <p className="screen-msg mono">Cargando…</p>
  if (!user) return <LoginPage />
  return (
    <AppDataProvider uid={user.uid} readOnly={false}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<MapPage />} />
          <Route path="lista" element={<ListPage />} />
          <Route path="estadisticas" element={<StatsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppDataProvider>
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
