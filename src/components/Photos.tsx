import { useCallback, useEffect, useState } from 'react'
import { photoUrl } from '../lib/data'
import type { Entry } from '../lib/model'
import { t } from '../lib/i18n'
import './Photos.css'

export const MAX_PHOTOS = 12

/** Fotos de una entrada; las antiguas solo tenían photoPath. */
export const entryPhotos = (e: Pick<Entry, 'photos' | 'photoPath'>): string[] => e.photos ?? (e.photoPath ? [e.photoPath] : [])

function usePhotoUrl(path: string) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    photoUrl(path).then((u) => alive && setUrl(u), () => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [path])
  return { url, failed }
}

export function PhotoThumb({ path, onClick, label }: { path: string; onClick?: () => void; label?: string }) {
  const { url, failed } = usePhotoUrl(path)
  const content = url ? <img src={url} alt="" loading="lazy" /> : <span className="mono muted">{failed ? t('No disponible') : '…'}</span>
  return onClick ? (
    <button type="button" className="thumb" onClick={onClick} aria-label={label ?? t('Ver foto')}>
      {content}
    </button>
  ) : (
    <span className="thumb">{content}</span>
  )
}

/** Galería de solo lectura: portada grande + miniaturas; al tocar se abre el visor. */
export function PhotoGallery({ photos, title }: { photos: string[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!photos.length) return null
  return (
    <>
      <div className={photos.length === 1 ? 'gallery gallery--single' : 'gallery'}>
        {photos.map((p, i) => (
          <PhotoThumb key={p} path={p} onClick={() => setOpen(i)} label={t('Ver foto {n} de {total}', { n: i + 1, total: photos.length })} />
        ))}
      </div>
      {open != null && <Lightbox photos={photos} index={open} title={title} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  )
}

function Lightbox({ photos, index, title, onIndex, onClose }: { photos: string[]; index: number; title: string; onIndex: (i: number) => void; onClose: () => void }) {
  const { url } = usePhotoUrl(photos[index])
  const go = useCallback((d: number) => onIndex((index + d + photos.length) % photos.length), [index, photos.length, onIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [go, onClose])

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={t('Fotos de {title}', { title })} onClick={onClose}>
      <div className="lightbox__bar" onClick={(e) => e.stopPropagation()}>
        <span className="mono">
          {title} · {index + 1}/{photos.length}
        </span>
        <button type="button" autoFocus aria-label={t('Cerrar')} onClick={onClose}>×</button>
      </div>
      <div className="lightbox__stage">
        {url ? <img src={url} alt={t('{title}, foto {n}', { title, n: index + 1 })} onClick={(e) => e.stopPropagation()} /> : <span className="mono">{t('Cargando…')}</span>}
      </div>
      {photos.length > 1 && (
        <>
          <button type="button" className="lightbox__nav lightbox__nav--prev" aria-label={t('Foto anterior')} onClick={(e) => (e.stopPropagation(), go(-1))}>←</button>
          <button type="button" className="lightbox__nav lightbox__nav--next" aria-label={t('Foto siguiente')} onClick={(e) => (e.stopPropagation(), go(1))}>→</button>
        </>
      )}
    </div>
  )
}
