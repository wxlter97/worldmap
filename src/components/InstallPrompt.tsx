import { useState } from 'react'
import { t } from '../lib/i18n'
import { dismissInstall, promptInstall, useInstall, wasDismissedRecently, type InstallMode } from '../lib/install'
import './InstallPrompt.css'

function Instructions({ mode }: { mode: InstallMode }) {
  if (mode === 'ios') return <>{t('Toca Compartir y luego «Agregar a inicio».')}</>
  if (mode === 'mac-safari') return <>{t('En el menú Archivo, elige «Agregar al Dock».')}</>
  return null
}

/** Aviso al entrar: sugiere instalar la app (o cómo hacerlo en Safari). Se oculta 14 días si se descarta. */
export function InstallPrompt() {
  const mode = useInstall()
  const [hidden, setHidden] = useState(wasDismissedRecently)
  if (mode === 'none' || hidden) return null

  const close = () => {
    dismissInstall()
    setHidden(true)
  }

  return (
    <div className="install" role="dialog" aria-labelledby="install-title">
      <img className="install__icon" src="/icons/icon-192.png" alt="" width={48} height={48} />
      <div className="install__text">
        <strong id="install-title">{t('Instala Mapa')}</strong>
        <span>
          {mode === 'prompt' ? t('Ábrelo como una app, desde tu pantalla de inicio y sin conexión.') : <Instructions mode={mode} />}
        </span>
      </div>
      <div className="install__actions">
        {mode === 'prompt' && (
          <button type="button" className="install__primary" onClick={() => void promptInstall().then((ok) => ok && setHidden(true))}>
            {t('Instalar')}
          </button>
        )}
        <button type="button" className="install__secondary" onClick={close}>
          {mode === 'prompt' ? t('Ahora no') : t('Entendido')}
        </button>
      </div>
    </div>
  )
}

/** Sección de Cuenta: botón permanente para instalar (aunque se haya descartado el aviso). */
export function InstallSection() {
  const mode = useInstall()
  return (
    <section className="account-section">
      <h2>{t('App')}</h2>
      {mode === 'none' ? (
        <p className="account-copy">
          {t('La app ya está instalada en este dispositivo, o este navegador no permite instalarla. Prueba con Chrome, Edge o Safari.')}
        </p>
      ) : mode === 'prompt' ? (
        <>
          <p className="account-copy">{t('Ábrelo como una app, desde tu pantalla de inicio y sin conexión.')}</p>
          <button type="button" className="btn btn--primary account-link-btn" onClick={() => void promptInstall()}>
            {t('Instalar la app')}
          </button>
        </>
      ) : (
        <p className="account-copy">
          <Instructions mode={mode} />
        </p>
      )}
    </section>
  )
}
