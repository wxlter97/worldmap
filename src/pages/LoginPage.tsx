import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { useState } from 'react'
import { authErrorMessage } from '../lib/auth'
import { ensureProfile } from '../lib/data'
import { auth, usingEmulators } from '../lib/firebase'
import { Symbol } from '../components/ui'
import './LoginPage.css'

type Mode = 'signin' | 'signup' | 'reset'

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email)
        setInfo('Te enviamos un correo para restablecer la contraseña. Revisa también la carpeta de spam.')
      } else if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await ensureProfile(cred.user.uid, cred.user.email)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <section className="login__brand on-faro">
        <div className="login__lockup">
          <Symbol size={56} />
          <span className="login__wordmark">wxlter<span>.</span></span>
        </div>
        <p className="label">Mapa de viajes</p>
        <h1 className="login__title">Cada país, cada ciudad, cada fecha.</h1>
      </section>

      <section className="login__form-wrap">
        <form className="login__form" onSubmit={submit} noValidate>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => setMode('signin')}>Entrar</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>Crear cuenta</button>
          </div>

          <label className={`field ${error ? 'field--error' : ''}`}>
            <span>Correo</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          {mode !== 'reset' && (
            <label className={`field ${error ? 'field--error' : ''}`}>
              <span>Contraseña</span>
              <input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}

          {error && <p className="field-error" role="alert">{error}</p>}
          {info && <p className="notice" role="status">{info}</p>}

          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar correo'}
          </button>

          {mode === 'signin' && (
            <button type="button" className="link-btn" onClick={() => setMode('reset')}>Olvidé mi contraseña</button>
          )}
          {mode === 'reset' && (
            <button type="button" className="link-btn" onClick={() => setMode('signin')}>Volver a entrar</button>
          )}
          {usingEmulators && <p className="mono muted login__env">Modo local · emuladores de Firebase</p>}
        </form>
      </section>
    </main>
  )
}
