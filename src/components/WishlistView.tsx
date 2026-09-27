import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../app/AppData'
import { mapLink } from '../lib/links'
import { PLACE_TYPE_LABEL, flagEmoji, type Entry } from '../lib/model'
import { combineWith, ideas, useGazetteer } from '../lib/suggestions'
import { SuggestionList } from './Suggestions'
import './WishlistView.css'

const GROUPS: { title: string; match: (e: Entry) => boolean }[] = [
  { title: 'Planeado', match: (e) => e.status === 'planned' },
  { title: 'Prioridad alta', match: (e) => e.status === 'wishlist' && e.priority === 1 },
  { title: 'Prioridad media', match: (e) => e.status === 'wishlist' && e.priority === 2 },
  { title: 'Prioridad baja', match: (e) => e.status === 'wishlist' && e.priority === 3 },
  { title: 'Sin prioridad', match: (e) => e.status === 'wishlist' && !e.priority },
]

export function WishlistView() {
  const { geo, entries, summaries, basePath, readOnly, uid } = useAppData()
  const gz = useGazetteer()
  const owner = readOnly ? null : uid
  const list = useMemo(() => entries.filter((e) => e.status === 'wishlist' || e.status === 'planned'), [entries])
  const ideaList = useMemo(() => (gz ? ideas(geo, entries, summaries, gz) : []), [geo, entries, summaries, gz])

  return (
    <div className="wishlist">
      {list.length === 0 ? (
        <p className="notice">
          Tu lista está vacía. Marca un lugar como <strong>Quiero ir</strong> o <strong>Planeado</strong>, o añade una de las ideas de abajo con «+».
        </p>
      ) : (
        GROUPS.map((g) => {
          const items = list.filter(g.match).sort((a, b) => a.name.localeCompare(b.name, 'es'))
          if (!items.length) return null
          return (
            <section key={g.title} className="wishlist__group">
              <h2>
                {g.title} <span className="label muted">{items.length}</span>
              </h2>
              <ul className="wishlist__items">
                {items.map((e) => (
                  <li key={e.key} className="wish">
                    <Link className="wish__head" to={mapLink(basePath, `p=${encodeURIComponent(e.key)}`)}>
                      <span className="wish__flag" aria-hidden="true">{flagEmoji(geo.countries[e.countryId]?.iso2 ?? null)}</span>
                      <span>
                        <strong>{e.name}</strong>
                        <span className="mono muted">
                          {PLACE_TYPE_LABEL[e.type]}
                          {e.type !== 'country' && ` · ${geo.countries[e.countryId]?.name ?? ''}`}
                          {e.tags.length > 0 && ` · #${e.tags.join(' #')}`}
                        </span>
                      </span>
                    </Link>
                    <div className="wish__combine">
                      <span className="label muted">Combínalo con</span>
                      {gz ? (
                        <SuggestionList geo={geo} suggestions={combineWith(geo, e, entries, summaries, gz, 4)} basePath={basePath} uid={owner} />
                      ) : (
                        <p className="mono muted">Buscando lugares cercanos…</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}

      {ideaList.length > 0 && (
        <section className="wishlist__ideas">
          <h2>Ideas</h2>
          {ideaList.map((idea) => (
            <div key={idea.title} className="idea">
              <h3>{idea.title}</h3>
              <p className="muted">{idea.description}</p>
              <SuggestionList geo={geo} suggestions={idea.suggestions} basePath={basePath} uid={owner} />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
