import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { t } from '../lib/i18n'
import './StatusBar.css'

/** Avisos del sistema: sin conexión / sincronizando, y nueva versión de la app instalada. */
export function StatusBar({ pendingWrites }: { pendingWrites: boolean }) {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => {
      removeEventListener('online', on)
      removeEventListener('offline', off)
    }
  }, [])

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    // Revisa si hay versión nueva cada hora mientras la app está abierta.
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000)
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    const t = setTimeout(() => setOfflineReady(false), 5000)
    return () => clearTimeout(t)
  }, [offlineReady, setOfflineReady])

  const sync = !online
    ? { text: t('Sin conexión · tus cambios se guardan en el dispositivo y se sincronizan al volver'), tone: 'warn' }
    : pendingWrites
      ? { text: t('Sincronizando…'), tone: 'info' }
      : null

  if (!sync && !needRefresh && !offlineReady) return null
  return (
    <div className="statusbar" role="status" aria-live="polite">
      {sync && <div className={`statusbar__item statusbar__item--${sync.tone}`}>{sync.text}</div>}
      {offlineReady && <div className="statusbar__item">{t('Lista para usar sin conexión')}</div>}
      {needRefresh && (
        <div className="statusbar__item statusbar__item--update">
          <span>{t('Hay una versión nueva de la app.')}</span>
          <button type="button" onClick={() => void updateServiceWorker(true)}>{t('Recargar')}</button>
          <button type="button" aria-label={t('Más tarde')} onClick={() => setNeedRefresh(false)}>×</button>
        </div>
      )}
    </div>
  )
}
