import { onAuthStateChanged, type User } from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth } from './firebase'

interface AuthState {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: auth.currentUser, loading: true })
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, loading: false })), [])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

/** Traduce los códigos de error de Firebase Auth: qué pasó y cómo arreglarlo. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  const messages: Record<string, string> = {
    'auth/invalid-email': 'El correo no tiene un formato válido. Revisa que incluya @ y dominio.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos. Revísalos o restablece la contraseña.',
    'auth/user-not-found': 'No hay cuenta con ese correo. Crea una cuenta nueva.',
    'auth/wrong-password': 'Contraseña incorrecta. Inténtalo de nuevo o restablécela.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Inicia sesión en su lugar.',
    'auth/weak-password': 'La contraseña es muy corta. Usa al menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a intentar.',
    'auth/network-request-failed': 'Sin conexión. Revisa tu red e inténtalo otra vez.',
    'auth/requires-recent-login': 'Por seguridad, vuelve a escribir tu contraseña actual.',
    'auth/missing-password': 'Falta la contraseña. Escríbela para continuar.',
  }
  return messages[code] ?? 'Algo salió mal. Inténtalo de nuevo.'
}
