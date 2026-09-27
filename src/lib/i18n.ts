// Traducción mínima: el español es el idioma fuente y la clave; EN es un diccionario.
// t('Hay {n} lugares', { n: 3 }) → en inglés busca la misma clave en EN.
import { useEffect, useState } from 'react'
import { EN } from './i18n-en'

export type Lang = 'es' | 'en'

const KEY = 'wm:lang'
const EVENT = 'wm-lang'

function detect(): Lang {
  if (typeof navigator === 'undefined') return 'es' // Node (pruebas, funciones)
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'es' || v === 'en') return v
  } catch {
    // sin almacenamiento: se usa el idioma del navegador
  }
  return (navigator.languages?.[0] ?? navigator.language ?? 'es').toLowerCase().startsWith('es') ? 'es' : 'en'
}

let current: Lang = detect()
if (typeof document !== 'undefined') applyDocument()

function applyDocument() {
  document.documentElement.lang = current
  document.title = t('Mapa · wxlter.')
}

export const getLang = () => current
/** Locale para Intl (fechas, números, nombres de idiomas). */
export const locale = () => (current === 'es' ? 'es' : 'en-GB')

export function setLang(lang: Lang) {
  current = lang
  applyDocument()
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // se aplica solo en esta sesión
  }
  dispatchEvent(new Event(EVENT))
}

export function t(es: string, vars?: Record<string, string | number>): string {
  let s = current === 'en' ? (EN[es] ?? es) : es
  if (import.meta.env?.DEV && current === 'en' && !(es in EN)) console.warn('[i18n] falta traducción:', es)
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** Singular/plural: tn(3, '{n} país', '{n} países'). */
export const tn = (n: number, one: string, many: string, vars?: Record<string, string | number>) =>
  t(n === 1 ? one : many, { n: n.toLocaleString(locale()), ...vars })

/** Idioma actual como estado de React (para volver a montar la app al cambiarlo). */
export function useLang(): Lang {
  const [lang, set] = useState(current)
  useEffect(() => {
    const on = () => set(current)
    addEventListener(EVENT, on)
    return () => removeEventListener(EVENT, on)
  }, [])
  return lang
}

/** Objeto de etiquetas en español que devuelve la traducción al leer cada clave. */
export function translated<K extends string>(labels: Record<K, string>): Record<K, string> {
  return new Proxy(labels, { get: (obj, key) => (typeof key === 'string' && key in obj ? t(obj[key as K]) : undefined) })
}
