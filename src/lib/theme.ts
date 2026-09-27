// Tema de la interfaz: automático (según el sistema), claro u oscuro. Preferencia por dispositivo.
import { useEffect, useState } from 'react'

export type ThemePref = 'auto' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'wm:theme'
const EVENT = 'wm-theme'
const media = () => matchMedia('(prefers-color-scheme: dark)')

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function resolveTheme(pref: ThemePref = getThemePref()): Theme {
  return pref === 'auto' ? (media().matches ? 'dark' : 'light') : pref
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  const root = document.documentElement
  if (pref === 'auto') delete root.dataset.theme
  else root.dataset.theme = pref
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolveTheme(pref) === 'dark' ? '#111111' : '#F4F3EF')
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // sin almacenamiento: se aplica solo en esta sesión
  }
  applyTheme(pref)
  dispatchEvent(new Event(EVENT))
}

/** Tema efectivo; se actualiza si cambia la preferencia o el tema del sistema. */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => resolveTheme())
  useEffect(() => {
    const update = () => {
      applyTheme()
      setTheme(resolveTheme())
    }
    const m = media()
    m.addEventListener('change', update)
    addEventListener(EVENT, update)
    return () => {
      m.removeEventListener('change', update)
      removeEventListener(EVENT, update)
    }
  }, [])
  return theme
}
