import { signOut } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { useAppData } from '../app/AppData'
import { disableSharing, enableSharing, saveDisplayName } from '../lib/data'
import { auth } from '../lib/firebase'
import './AccountPage.css'

export function AccountPage() {
  const { uid, profile } = useAppData()
  const [name, setName] = useState(profile.displayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
          Quien tenga el link verá tu mapa, lista, viajes y estadísticas, incluidas descripciones, fotos, etiquetas
          y personas. No puede editar nada ni ver tu correo.
        </p>

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

      <section className="account-section">
        <button type="button" className="btn" onClick={() => signOut(auth)}>Cerrar sesión</button>
      </section>
    </div>
  )
}
