import { useEffect, useRef } from 'react'
import type { Geo } from '../lib/geo'
import type { JourneyStop } from '../lib/journey'
import { flagEmoji } from '../lib/model'
import { locale, t, tn } from '../lib/i18n'
import './ReplayBar.css'

export interface ReplayState {
  t: number // posición en paradas (0 … n-1), fraccional durante un tramo
  playing: boolean
  speed: 1 | 2 | 4
}

interface Props {
  geo: Geo
  stops: JourneyStop[]
  state: ReplayState
  countriesSoFar: number
  onChange: (s: ReplayState) => void
  onClose: () => void
}

const STOPS_PER_SECOND = 0.8
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function ReplayBar({ geo, stops, state, countriesSoFar, onChange, onClose }: Props) {
  const last = stops.length - 1
  const stateRef = useRef(state)
  stateRef.current = state

  // Bucle de animación: avanza t según el tiempo real y la velocidad.
  useEffect(() => {
    if (!state.playing) return
    let raf = 0
    let timer = 0
    let prev = performance.now()
    const tick = (now: number) => {
      const s = stateRef.current
      const dt = (now - prev) / 1000
      prev = now
      // Con movimiento reducido se salta de parada en parada sin interpolar.
      const reduced = reducedMotion()
      const next = reduced ? Math.min(last, Math.floor(s.t) + 1) : Math.min(last, s.t + dt * STOPS_PER_SECOND * s.speed)
      onChange({ ...s, t: next, playing: next < last })
      if (next >= last) return
      if (reduced) timer = window.setTimeout(() => (raf = requestAnimationFrame(tick)), 900 / s.speed)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
    // El bucle se reinicia solo al pausar/reanudar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.playing, last])

  const stop = stops[Math.min(last, Math.floor(state.t))]
  const date = stop ? new Date(`${stop.date}T00:00:00`) : null

  return (
    <div className="replay" role="region" aria-label={t('Repetición de viajes')}>
      <button
        type="button"
        className="replay__play"
        aria-label={state.playing ? t('Pausar') : t('Reproducir')}
        onClick={() => onChange({ ...state, playing: !state.playing, t: !state.playing && state.t >= last ? 0 : state.t })}
      >
        {state.playing ? '❚❚' : '▶'}
      </button>

      <div className="replay__now" aria-live="polite">
        <span className="replay__year">{date?.getFullYear()}</span>
        <span className="replay__date mono">
          {date?.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}
          {stop && <> · {flagEmoji(geo.countries[stop.countryId]?.iso2 ?? null)} {stop.name}</>}
        </span>
      </div>

      <label className="replay__scrub">
        <span className="visually-hidden">{t('Posición en el recorrido')}</span>
        <input
          type="range"
          min={0}
          max={last}
          step={0.01}
          value={state.t}
          onChange={(e) => onChange({ ...state, t: Number(e.target.value), playing: false })}
        />
        <span className="replay__count mono">
          {Math.floor(state.t) + 1}/{stops.length} · {tn(countriesSoFar, '{n} país', '{n} países')}
        </span>
      </label>

      <div className="replay__speed" role="group" aria-label={t('Velocidad')}>
        {([1, 2, 4] as const).map((sp) => (
          <button key={sp} type="button" aria-pressed={state.speed === sp} onClick={() => onChange({ ...state, speed: sp })}>
            {sp}×
          </button>
        ))}
      </div>

      <button type="button" className="replay__close" aria-label={t('Cerrar repetición')} onClick={onClose}>×</button>
    </div>
  )
}
