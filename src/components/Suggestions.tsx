import { Link } from 'react-router-dom'
import { saveEntry } from '../lib/data'
import type { Geo } from '../lib/geo'
import { mapLink } from '../lib/links'
import { PLACE_TYPE_LABEL, emptyEntry, flagEmoji } from '../lib/model'
import type { Suggestion } from '../lib/suggestions'
import { t } from '../lib/i18n'
import './Suggestions.css'

interface Props {
  geo: Geo
  suggestions: Suggestion[]
  basePath: string
  uid: string | null // null = solo lectura: sin botón de añadir
}

/** Lista de sugerencias: el nombre abre el lugar en el mapa; «+» lo añade a «Quiero ir». */
export function SuggestionList({ geo, suggestions, basePath, uid }: Props) {
  if (!suggestions.length) return <p className="mono muted sugg-empty">{t('Nada que sugerir por ahora.')}</p>
  return (
    <ul className="sugg">
      {suggestions.map(({ place, reason }) => (
        <li key={`${place.type}:${place.id}`} className="sugg__item">
          <Link className="sugg__link" to={mapLink(basePath, `p=${encodeURIComponent(`${place.type}:${place.id}`)}`)}>
            <span aria-hidden="true">{flagEmoji(geo.countries[place.countryId]?.iso2 ?? null)}</span>
            <span className="sugg__text">
              <strong>{place.name}</strong>
              <span className="mono">{PLACE_TYPE_LABEL[place.type]} · {reason}</span>
            </span>
          </Link>
          {uid && (
            <button
              type="button"
              className="sugg__add"
              aria-label={t('Añadir {name} a Quiero ir', { name: place.name })}
              title={t('Añadir a Quiero ir')}
              onClick={() => {
                const entry = emptyEntry(place.type, place.id, {
                  name: place.name, countryId: place.countryId, regionId: place.regionId, lon: place.lon, lat: place.lat,
                })
                void saveEntry(uid, { ...entry, status: 'wishlist' })
              }}
            >
              +
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
