import { useState } from 'react'
import { Link } from 'react-router-dom'
import { changePassword, deleteAccount, sendVerification } from '../lib/account'
import { authErrorMessage, useAuth } from '../lib/auth'

export function EmailVerification() {
  const { user } = useAuth()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!user) return null
  return (
    <section className="account-section">
      <div className="account-row account-row--between">
        <h2>Correo</h2>
        {user.emailVerified ? <span className="badge badge--ink">Verificado</span> : <span className="badge">Sin verificar</span>}
      </div>
      <p className="account-copy mono">{user.email}</p>
      {!user.emailVerified && (
        <>
          <p className="account-copy">
            Verificar tu correo te permite recuperar la cuenta si olvidas la contraseña. Después de hacer clic en el
            enlace del correo, recarga esta página.
          </p>
          <button
            type="button"
            className="btn account-link-btn"
            disabled={sent}
            onClick={() => sendVerification(user).then(() => setSent(true), (e) => setError(authErrorMessage(e)))}
          >
            {sent ? 'Correo enviado' : 'Enviar correo de verificación'}
          </button>
          {error && <p className="field-error" role="alert">{error}</p>}
        </>
      )}
    </section>
  )
}

export function ChangePassword() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!user) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (next.length < 6) return setError('La contraseña nueva es muy corta. Usa al menos 6 caracteres.')
    setBusy(true)
    try {
      await changePassword(user, current, next)
      setDone(true)
      setCurrent('')
      setNext('')
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="account-section">
      <h2>Contraseña</h2>
      <form className="account-form" onSubmit={submit}>
        <label className="field">
          <span>Contraseña actual</span>
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className={`field ${error ? 'field--error' : ''}`}>
          <span>Contraseña nueva</span>
          <input type="password" autoComplete="new-password" minLength={6} required value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        {error && <p className="field-error" role="alert">{error}</p>}
        {done && <p className="notice" role="status">Contraseña actualizada.</p>}
        <button type="submit" className="btn account-link-btn" disabled={busy || !current || !next}>
          {busy ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </form>
    </section>
  )
}

const CONFIRM_WORD = 'ELIMINAR'

export function DeleteAccount() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const [password, setPassword] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!user) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await deleteAccount(user, password, setProgress)
      // onAuthStateChanged lleva a la pantalla de login.
    } catch (err) {
      console.error('Eliminar cuenta', err)
      const code = (err as { code?: string })?.code ?? ''
      setError(
        code.startsWith('auth/')
          ? authErrorMessage(err)
          : `No se pudo terminar (${progress ?? 'inicio'}). Revisa tu conexión e inténtalo otra vez: lo ya borrado no vuelve.`,
      )
      setProgress(null)
    }
  }

  return (
    <section className="account-section account-danger">
      <h2>Eliminar cuenta</h2>
      <p className="account-copy">
        Borra para siempre tu mapa: lugares, viajes, fotos, links compartidos y la cuenta. No se puede deshacer.{' '}
        <Link to="/exportar">Descarga una copia JSON</Link> antes si quieres conservar tus datos.
      </p>
      {!open ? (
        <button type="button" className="btn btn--danger account-link-btn" onClick={() => setOpen(true)}>
          Eliminar mi cuenta…
        </button>
      ) : (
        <form className="account-form" onSubmit={submit}>
          <label className="field">
            <span>Escribe {CONFIRM_WORD} para confirmar</span>
            <input value={word} autoComplete="off" onChange={(e) => setWord(e.target.value)} />
          </label>
          <label className={`field ${error ? 'field--error' : ''}`}>
            <span>Tu contraseña</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
          {progress && <p className="notice notice--error" role="status">{progress}</p>}
          <div className="account-row">
            <button type="submit" className="btn btn--danger" disabled={word !== CONFIRM_WORD || !password || !!progress}>
              Eliminar todo
            </button>
            <button type="button" className="btn" disabled={!!progress} onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  )
}
