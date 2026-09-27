import { Link } from 'react-router-dom'
import { Symbol } from '../components/ui'
import './PrivacyPage.css'

export function PrivacyPage() {
  return (
    <div className="privacy">
      <header className="privacy__header">
        <Link to="/" className="privacy__brand" aria-label="Volver al mapa">
          <Symbol size={30} />
          <span className="shell__wordmark">wxlter<span className="wordmark-dot">.</span></span>
          <span className="label muted">mapa</span>
        </Link>
      </header>
      <main className="privacy__main">
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
          tema) en el almacenamiento local del navegador.
        </p>

        <h2>Quién lo ve</h2>
        <ul>
          <li><strong>Solo tú</strong>, mientras no actives un link compartido.</li>
          <li>
            <strong>Link de solo lectura del mapa:</strong> quien lo tenga ve tu mapa, lista, viajes, estadísticas y fotos.
            Las descripciones y las personas solo se muestran si activas «Mostrar notas». Nunca se muestra tu correo.
          </li>
          <li><strong>Link de un viaje:</strong> muestra solo los lugares y fotos de ese viaje.</li>
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
      </main>
    </div>
  )
}
