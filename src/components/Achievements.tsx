import { useEffect, useRef, useState } from 'react'
import type { Achievement, AchievementGroup } from '../lib/achievements'
import { locale, t } from '../lib/i18n'
import './Achievements.css'

/**
 * Ícono de la serie wxlter: fondo ink, banda faro que sube desde el pie y un glifo que se invierte
 * donde la banda lo cruza (mix-blend-mode: difference). Aquí la altura de la banda es el progreso.
 */
export function BandIcon({ glyph, progress, size = 64 }: { glyph: string; progress: number; size?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100)
  return (
    <span className="band-icon" style={{ width: size, height: size, fontSize: size * (glyph.length > 2 ? 0.34 : glyph.length > 1 ? 0.42 : 0.56) }} aria-hidden="true">
      <span className="band-icon__band" style={{ height: `${pct}%` }} />
      <span className="band-icon__glyph">{glyph}</span>
    </span>
  )
}

const GROUPS: AchievementGroup[] = ['Países', 'Continentes', 'Regiones del mundo', 'Ciudades', 'Lugares', 'Tiempo']

const formatDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })

export function AchievementList({ achievements }: { achievements: Achievement[] }) {
  return (
    <div className="achievements">
      {GROUPS.map((group) => {
        const items = achievements.filter((a) => a.def.group === group)
        const done = items.filter((a) => a.unlocked).length
        return (
          <section key={group} className="achievements__group">
            <h3>
              {t(group)} <span className="label muted">{done}/{items.length}</span>
            </h3>
            <ul className="achievements__grid">
              {items.map((a) => (
                <li key={a.def.id} className={a.unlocked ? 'ach ach--done' : 'ach'}>
                  <BandIcon glyph={a.def.glyph} progress={a.value / a.def.target} />
                  <div className="ach__text">
                    <strong>{t(a.def.title)}</strong>
                    <span className="ach__desc">{t(a.def.description)}</span>
                    <span className="ach__meta mono">
                      {a.unlocked
                        ? a.unlockedAt
                          ? `${t('Desbloqueado')} · ${formatDate(a.unlockedAt)}`
                          : t('Desbloqueado')
                        : `${Math.min(a.value, a.def.target)}/${a.def.target}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** Avisa cuando se desbloquea un logro nuevo (no al cargar la app con logros ya conseguidos). */
export function AchievementToaster({ achievements }: { achievements: Achievement[] | null }) {
  const known = useRef<Set<string> | null>(null)
  const [toasts, setToasts] = useState<Achievement[]>([])

  useEffect(() => {
    if (!achievements) return
    const unlocked = new Set(achievements.filter((a) => a.unlocked).map((a) => a.def.id))
    if (known.current) {
      const fresh = achievements.filter((a) => a.unlocked && !known.current!.has(a.def.id))
      if (fresh.length) setToasts((t) => [...t, ...fresh].slice(-3))
    }
    known.current = unlocked
  }, [achievements])

  useEffect(() => {
    if (!toasts.length) return
    const timer = setTimeout(() => setToasts((t) => t.slice(1)), 6000)
    return () => clearTimeout(timer)
  }, [toasts])

  if (!toasts.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((a) => (
        <div key={a.def.id} className="toast">
          <BandIcon glyph={a.def.glyph} progress={1} size={48} />
          <span className="toast__text">
            <span className="label">{t('Logro desbloqueado')}</span>
            <strong>{t(a.def.title)}</strong>
          </span>
          <button type="button" aria-label={t('Cerrar aviso')} onClick={() => setToasts((t) => t.filter((x) => x !== a))}>×</button>
        </div>
      ))}
    </div>
  )
}
