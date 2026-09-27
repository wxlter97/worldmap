import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo } from 'react'

/** Símbolo wxlter: W de trazo continuo en un cuadrado. */
export function Symbol({ size = 34, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" fill={inverted ? '#FFDB00' : '#111111'} />
      <polyline
        points="14,24 32,76 50,44 68,76 86,24"
        fill="none"
        stroke={inverted ? '#111111' : '#FFDB00'}
        strokeWidth={size < 32 ? 17 : 15}
        strokeLinejoin="miter"
      />
    </svg>
  )
}

export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(source, { async: false, breaks: true })), [source])
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
}

export function Stars({ value }: { value: number | null }) {
  if (!value) return null
  return (
    <span className="mono" aria-label={`${value} de 5`}>
      {'■'.repeat(value)}
      <span className="muted">{'□'.repeat(5 - value)}</span>
    </span>
  )
}

export function StatCard({ label, value, meta }: { label: string; value: string | number; meta?: string }) {
  return (
    <div className="stat">
      <div className="stat__head">{label}</div>
      <div className="stat__body">
        <div className="stat__value">{value}</div>
        {meta && <div className="stat__meta">{meta}</div>}
      </div>
    </div>
  )
}

export function Meter({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label={label}>
      <span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

export const formatPercent = (p: number) => (p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`)
export const formatNumber = (n: number) => n.toLocaleString('es')
