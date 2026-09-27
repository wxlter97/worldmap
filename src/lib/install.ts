// Instalación de la PWA. Chrome/Edge/Android disparan `beforeinstallprompt` (se guarda para lanzarlo con un botón);
// Safari (iOS y macOS) no lo tiene: ahí se muestran instrucciones.
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const EVENT = 'wm-install'
const DISMISS_KEY = 'wm:install-dismissed'
const DISMISS_DAYS = 14

let deferred: BeforeInstallPromptEvent | null = null
let installed = false

if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // la app muestra su propio aviso
    deferred = e as BeforeInstallPromptEvent
    dispatchEvent(new Event(EVENT))
  })
  addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    dispatchEvent(new Event(EVENT))
  })
}

export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iOS/iPadOS Safari: sin evento de instalación, se instala con Compartir → «Agregar a inicio». */
export function isIosSafari(): boolean {
  const ua = navigator.userAgent
  // Android/Chrome también dicen «Safari» en su agente de usuario: se descartan explícitamente.
  if (/Android|Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\//.test(ua)) return false
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && /Safari/.test(ua)
}

/** Safari de macOS: se instala desde Archivo → «Agregar al Dock». */
export function isMacSafari(): boolean {
  const ua = navigator.userAgent
  return /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua) && navigator.maxTouchPoints <= 1
}

export type InstallMode = 'prompt' | 'ios' | 'mac-safari' | 'none'

export function installMode(): InstallMode {
  if (installed || isStandalone()) return 'none'
  if (deferred) return 'prompt'
  if (isIosSafari()) return 'ios'
  if (isMacSafari()) return 'mac-safari'
  return 'none'
}

/** Lanza el diálogo nativo. Devuelve true si el usuario aceptó. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const e = deferred
  deferred = null
  await e.prompt()
  const { outcome } = await e.userChoice
  dispatchEvent(new Event(EVENT))
  return outcome === 'accepted'
}

export function wasDismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
    return Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // sin almacenamiento: el aviso vuelve a salir en la próxima visita
  }
  dispatchEvent(new Event(EVENT))
}

/** Estado reactivo: cómo se puede instalar ahora mismo. */
export function useInstall(): InstallMode {
  const [mode, setMode] = useState<InstallMode>(installMode)
  useEffect(() => {
    const update = () => setMode(installMode())
    addEventListener(EVENT, update)
    const standalone = matchMedia('(display-mode: standalone)')
    standalone.addEventListener('change', update)
    return () => {
      removeEventListener(EVENT, update)
      standalone.removeEventListener('change', update)
    }
  }, [])
  return mode
}
