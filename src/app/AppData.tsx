import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useProfile, useUserData, type Profile, type UserData } from '../lib/data'
import { loadGeo, type Geo } from '../lib/geo'
import { summarizeCountries, type CountrySummary } from '../lib/model'

interface AppData extends UserData {
  uid: string // dueño de los datos mostrados
  readOnly: boolean
  basePath: string // '' para el dueño, '/s/{token}' en un link compartido
  profile: Profile
  geo: Geo
  summaries: Map<string, CountrySummary>
}

const Ctx = createContext<AppData | null>(null)

export function useAppData() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppData fuera de AppDataProvider')
  return v
}

export function useGeo() {
  const [geo, setGeo] = useState<Geo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    loadGeo().then(setGeo, (e: Error) => setError(e.message))
  }, [])
  return { geo, error }
}

interface ProviderProps {
  uid: string
  readOnly: boolean
  basePath: string
  children: ReactNode
}

export function AppDataProvider({ uid, readOnly, basePath, children }: ProviderProps) {
  const { geo, error: geoError } = useGeo()
  const data = useUserData(uid)
  const profile = useProfile(uid)
  const summaries = useMemo(() => (geo ? summarizeCountries(geo, data.entries) : new Map()), [geo, data.entries])

  if (geoError) return <div className="screen-msg notice notice--error">No se pudieron cargar los mapas: {geoError}. Recarga la página.</div>
  if (!geo) return <div className="screen-msg mono">Cargando mapa…</div>
  return <Ctx.Provider value={{ ...data, uid, readOnly, basePath, profile, geo, summaries }}>{children}</Ctx.Provider>
}
