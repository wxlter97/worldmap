import { signOut } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { ChangePassword, DeleteAccount, EmailVerification } from '../components/AccountSecurity'
import { disableSharing, enableSharing, saveDisplayName, setShowNotes } from '../lib/data'
import { auth } from '../lib/firebase'
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme'
import './AccountPage.css'

export function AccountPage() {
  const { uid, profile, trips } = useAppData()
  const [name, setName] = useState(profile.displayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [themePref, setTheme] = useState<ThemePref>(getThemePref)

  useEffect(() => setName(profile.displayName), [profile.displayName])

  const link = profile.sharing.enabled && profile.sharing.token ? `${location.origin}/s/${profile.sharing.token}` : null

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch {
      setError('No se pudo guardar. Revisa tu conexión: compartir necesita estar en línea.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="account-page">
      <div className="account-page__head">
        <h1>Cuenta</h1>
        <span className="label muted">{auth.currentUser?.email}</span>
      </div>

      <section className="account-section">
        <h2>Nombre</h2>
        <form
          className="account-row"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => saveDisplayName(uid, name.trim(), profile))
          }}
        >
          <label className="field account-row__grow">
            <span>Se muestra en tu link compartido</span>
            <input value={name} maxLength={60} placeholder="Walter" onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={busy || name.trim() === profile.displayName}>Guardar</button>
        </form>
      </section>

      <section className="account-section">
        <div className="account-row account-row--between">
          <h2>Link de solo lectura</h2>
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={profile.sharing.enabled}
            aria-label="Compartir mi mapa"
            disabled={busy}
            onClick={() => void run(() => (profile.sharing.enabled ? disableSharing(uid, profile) : enableSharing(uid, profile)))}
          />
        </div>
        <p className="account-copy">
          Quien tenga el link verá tu mapa, lista, viajes, estadísticas y fotos. No puede editar nada ni ver tu correo.
        </p>
        <label className="account-toggle">
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={!!profile.sharing.showNotes}
            aria-label="Mostrar notas y personas en los links"
            disabled={busy}
            onClick={() => void run(() => setShowNotes(uid, !profile.sharing.showNotes))}
          />
          <span>
            <strong>Mostrar notas y personas</strong>
            <span className="muted"> — descripciones y «con quién» en este link y en los links de viajes.</span>
          </span>
        </label>

        {link ? (
          <>
            <div className="account-link">
              <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Link compartido" />
              <button type="button" className="btn btn--primary" onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>
            </div>
            <div className="account-row">
              <a className="link-btn" href={link} target="_blank" rel="noreferrer">Abrir vista pública ↗</a>
              <button
                type="button"
                className="link-btn"
                disabled={busy}
                onClick={() => {
                  if (confirm('El link actual dejará de funcionar. ¿Generar uno nuevo?')) void run(() => enableSharing(uid, profile))
                }}
              >
                Generar link nuevo
              </button>
            </div>
          </>
        ) : (
          <p className="mono muted account-small">Desactivado. Actívalo para obtener un link.</p>
        )}
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>

      {Object.keys(profile.tripShares ?? {}).length > 0 && (
        <section className="account-section">
          <h2>Viajes compartidos</h2>
          <ul className="account-trips">
            {Object.entries(profile.tripShares ?? {}).map(([tripId, token]) => (
              <li key={tripId}>
                <Link to={`/?viaje=${tripId}`}>{trips.find((t) => t.id === tripId)?.name ?? 'Viaje'}</Link>
                <span className="mono muted">/s/{token}</span>
              </li>
            ))}
          </ul>
          <p className="account-copy">Para dejar de compartir un viaje, ábrelo y usa «Dejar de compartir».</p>
        </section>
      )}

      <section className="account-section">
        <h2>Exportar</h2>
        <p className="account-copy">Póster para imprimir o compartir, CSV para hojas de cálculo y copia de seguridad JSON.</p>
        <Link to="/exportar" className="btn account-link-btn">Ir a Exportar →</Link>
      </section>

      <section className="account-section">
        <h2>Tema</h2>
        <div className="tabs" role="radiogroup" aria-label="Tema de la interfaz">
          {(
            [
              ['auto', 'Automático'],
              ['light', 'Claro'],
              ['dark', 'Oscuro'],
            ] as [ThemePref, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={themePref === id}
              aria-selected={themePref === id}
              onClick={() => {
                setTheme(id)
                setThemePref(id)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="account-copy mono account-small">Automático sigue el tema de tu dispositivo. Se guarda en este dispositivo.</p>
      </section>

      <EmailVerification />
      <ChangePassword />

      <section className="account-section">
        <p className="account-copy">
          <Link to="/privacidad">Privacidad: qué se guarda y quién lo ve</Link>
        </p>
        <button type="button" className="btn account-link-btn" onClick={() => signOut(auth)}>Cerrar sesión</button>
      </section>

      <DeleteAccount />
    </div>
  )
}
