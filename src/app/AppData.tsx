import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useProfile, useUserData, type Profile, type UserData } from '../lib/data'
import { loadGeo, type Geo } from '../lib/geo'
import { summarizeCountries, type CountrySummary } from '../lib/model'
import { getLang, t } from '../lib/i18n'

interface AppData extends UserData {
  uid: string // dueño de los datos mostrados
  readOnly: boolean
  basePath: string // '' para el dueño, '/s/{token}' en un link compartido
  sharedTripId: string | null // link de un solo viaje
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
  tripId?: string | null
  children: ReactNode
}

export function AppDataProvider({ uid, readOnly, basePath, tripId = null, children }: ProviderProps) {
  const { geo: rawGeo, error: geoError } = useGeo()
  const raw = useUserData(uid, tripId, !readOnly)
  const profile = useProfile(uid)
  // Nombres de países en el idioma activo (la app se vuelve a montar al cambiar de idioma).
  const geo = useMemo(() => (rawGeo ? localizeGeo(rawGeo) : null), [rawGeo])
  const data = useMemo(() => {
    if (!geo || getLang() === 'es') return raw
    const entries = raw.entries.map((e) => (e.type === 'country' && geo.countries[e.countryId] ? { ...e, name: geo.countries[e.countryId].name } : e))
    return { ...raw, entries }
  }, [raw, geo])
  const summaries = useMemo(() => (geo ? summarizeCountries(geo, data.entries) : new Map()), [geo, data.entries])

  if (geoError) return <div className="screen-msg notice notice--error">{t('No se pudieron cargar los mapas: {error}. Recarga la página.', { error: geoError })}</div>
  if (!geo) return <div className="screen-msg mono">{t('Cargando mapa…')}</div>
  return <Ctx.Provider value={{ ...data, uid, readOnly, basePath, sharedTripId: tripId, profile, geo, summaries }}>{children}</Ctx.Provider>
}

function localizeGeo(geo: Geo): Geo {
  if (getLang() === 'es') return geo
  const countries = Object.fromEntries(Object.entries(geo.countries).map(([id, c]) => [id, { ...c, name: c.nameEn }]))
  return { ...geo, countries }
}
