import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useUserData, type UserData } from '../lib/data'
import { loadGeo, type Geo } from '../lib/geo'
import { summarizeCountries, type CountrySummary } from '../lib/model'

interface AppData extends UserData {
  uid: string | null // dueño de los datos mostrados
  readOnly: boolean
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

export function AppDataProvider({ uid, readOnly, children }: { uid: string; readOnly: boolean; children: ReactNode }) {
  const { geo, error: geoError } = useGeo()
  const data = useUserData(uid)
  const summaries = useMemo(() => (geo ? summarizeCountries(geo, data.entries) : new Map()), [geo, data.entries])

  if (geoError) return <div className="screen-msg notice notice--error">No se pudieron cargar los mapas: {geoError}. Recarga la página.</div>
  if (!geo) return <div className="screen-msg mono">Cargando mapa…</div>
  return <Ctx.Provider value={{ ...data, uid, readOnly, geo, summaries }}>{children}</Ctx.Provider>
}
