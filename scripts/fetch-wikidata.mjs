// Consulta Wikidata: sitios UNESCO (whs.json) y nombres en español de ciudades GeoNames (city-names-es.json).
// Se ejecuta desde data-raw/.
import fs from 'node:fs'

const ENDPOINT = 'https://query.wikidata.org/sparql'
const UA = 'worldmap-build/0.1 (https://map.wxlter.dev)'

async function sparql(query) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query }),
    })
    if (res.ok) return (await res.json()).results.bindings
    if (attempt >= 4) throw new Error(`Wikidata ${res.status}`)
    await new Promise((r) => setTimeout(r, 5000 * attempt))
  }
}

const whs = await sparql(`SELECT ?site ?whs ?es ?en ?lat ?lon ?iso2 WHERE {
  ?site wdt:P757 ?whs ; p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] .
  OPTIONAL { ?site rdfs:label ?es FILTER(lang(?es)="es") }
  OPTIONAL { ?site rdfs:label ?en FILTER(lang(?en)="en") }
  OPTIONAL { ?site wdt:P17/wdt:P297 ?iso2 } }`)
fs.writeFileSync('whs.json', JSON.stringify(whs))
console.log('UNESCO rows:', whs.length)

const ids = fs.readFileSync('cities15000.txt', 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[0])
const names = {}
for (let i = 0; i < ids.length; i += 2000) {
  const values = ids.slice(i, i + 2000).map((id) => `"${id}"`).join(' ')
  const rows = await sparql(`SELECT ?gn ?es WHERE { VALUES ?gn { ${values} } ?item wdt:P1566 ?gn ; rdfs:label ?es FILTER(lang(?es)="es") }`)
  for (const r of rows) names[r.gn.value] ??= r.es.value
  process.stdout.write(`\rciudades ${Math.min(i + 2000, ids.length)}/${ids.length}`)
}
fs.writeFileSync('city-names-es.json', JSON.stringify(names))
console.log('\nnombres es:', Object.keys(names).length)
