import { Link } from 'react-router-dom'
import { Symbol } from '../components/ui'
import { getLang, setLang, t } from '../lib/i18n'
import './PrivacyPage.css'

export function PrivacyPage() {
  const en = getLang() === 'en'
  return (
    <div className="privacy">
      <header className="privacy__header">
        <Link to="/" className="privacy__brand" aria-label={t('Volver al mapa')}>
          <Symbol size={30} />
          <span className="shell__wordmark">wxlter<span className="wordmark-dot">.</span></span>
          <span className="label muted">{t('mapa')}</span>
        </Link>
        <button type="button" className="link-btn" onClick={() => setLang(en ? 'es' : 'en')}>
          {en ? 'Español' : 'English'}
        </button>
      </header>
      <main className="privacy__main">{en ? <PrivacyEn /> : <PrivacyEs />}</main>
    </div>
  )
}

function PrivacyEs() {
  return (
    <>
      <p className="label muted">Última actualización: septiembre de 2026</p>
      <h1>Privacidad</h1>
      <p className="privacy__lead">Tu mapa es tuyo. Esto es lo que se guarda, dónde, y quién puede verlo.</p>

      <h2>Qué se guarda</h2>
      <ul>
        <li><strong>Tu cuenta:</strong> correo y contraseña (cifrada), gestionados por Firebase Authentication de Google.</li>
        <li><strong>Tu mapa:</strong> lugares, fechas, viajes, descripciones, etiquetas, valoraciones, personas y tu nombre visible.</li>
        <li><strong>Tus fotos:</strong> se reducen y convierten a WebP en tu dispositivo antes de subirlas.</li>
      </ul>

      <h2>Dónde</h2>
      <p>
        En Google Cloud (Firebase Firestore y Cloud Storage), región de Estados Unidos. La app guarda además una copia
        en tu dispositivo para funcionar sin conexión, y recuerda preferencias de interfaz (modo raspar, líneas de viaje,
        tema, idioma) en el almacenamiento local del navegador.
      </p>

      <h2>Quién lo ve</h2>
      <ul>
        <li><strong>Solo tú</strong>, mientras no actives un link compartido.</li>
        <li>
          <strong>Link de solo lectura del mapa:</strong> quien lo tenga ve tu mapa, lista, viajes, estadísticas y fotos.
          Las descripciones y las personas solo se muestran si activas «Mostrar notas». Nunca se muestra tu correo.
        </li>
        <li><strong>Link de un viaje:</strong> muestra solo los lugares y fotos de ese viaje.</li>
        <li>Al compartir un link, la vista previa (nombre, número de países y mapa) se genera en nuestro servidor.</li>
        <li>Puedes desactivar o regenerar cualquier link en Cuenta; el anterior deja de funcionar al instante.</li>
      </ul>

      <h2>Qué no se hace</h2>
      <ul>
        <li>No hay publicidad, ni analítica de terceros, ni cookies de seguimiento.</li>
        <li>Tus datos no se venden ni se comparten con nadie.</li>
      </ul>

      <h2>Tus derechos</h2>
      <ul>
        <li><strong>Llevarte tus datos:</strong> en Exportar descargas todo en JSON o CSV cuando quieras.</li>
        <li><strong>Borrarlo todo:</strong> en Cuenta → Eliminar cuenta se borran para siempre lugares, viajes, fotos, links y la cuenta.</li>
      </ul>

      <h2>Contacto</h2>
      <p>
        Walter Castillo — <a href="mailto:walter@wxlter.dev">walter@wxlter.dev</a>
      </p>
    </>
  )
}

function PrivacyEn() {
  return (
    <>
      <p className="label muted">Last updated: September 2026</p>
      <h1>Privacy</h1>
      <p className="privacy__lead">Your map is yours. This is what is stored, where, and who can see it.</p>

      <h2>What is stored</h2>
      <ul>
        <li><strong>Your account:</strong> email and password (encrypted), handled by Google's Firebase Authentication.</li>
        <li><strong>Your map:</strong> places, dates, trips, descriptions, tags, ratings, people and your display name.</li>
        <li><strong>Your photos:</strong> resized and converted to WebP on your device before upload.</li>
      </ul>

      <h2>Where</h2>
      <p>
        On Google Cloud (Firebase Firestore and Cloud Storage), in the United States. The app also keeps a copy on your
        device so it works offline, and remembers interface preferences (scratch mode, travel lines, theme, language) in
        the browser's local storage.
      </p>

      <h2>Who sees it</h2>
      <ul>
        <li><strong>Only you</strong>, unless you turn on a shared link.</li>
        <li>
          <strong>Read-only map link:</strong> anyone with it sees your map, list, trips, stats and photos. Descriptions
          and people only show if you turn on «Show notes». Your email is never shown.
        </li>
        <li><strong>Trip link:</strong> shows only that trip's places and photos.</li>
        <li>When you share a link, the preview (name, number of countries and map) is generated on our server.</li>
        <li>You can turn off or regenerate any link in Account; the old one stops working immediately.</li>
      </ul>

      <h2>What we don't do</h2>
      <ul>
        <li>No ads, no third-party analytics, no tracking cookies.</li>
        <li>Your data is never sold or shared with anyone.</li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li><strong>Take your data:</strong> in Export you can download everything as JSON or CSV at any time.</li>
        <li><strong>Delete everything:</strong> Account → Delete account permanently removes places, trips, photos, links and the account.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Walter Castillo — <a href="mailto:walter@wxlter.dev">walter@wxlter.dev</a>
      </p>
    </>
  )
}
