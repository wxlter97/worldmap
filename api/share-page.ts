// /s/{token}: devuelve la app (index.html) con etiquetas Open Graph para que WhatsApp, X, etc.
// muestren una tarjeta con el mapa. Los bots no ejecutan JavaScript; los usuarios reciben la SPA normal.
import { escapeHtml, loadShare } from './_lib/share.js'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = process.env.PUBLIC_ORIGIN ?? url.origin
  // Vercel reescribe /s/{token} → /api/share-page?t={token}; se acepta cualquiera de las dos formas.
  const token = url.searchParams.get('t') ?? url.pathname.match(/^\/s\/([^/]+)/)?.[1] ?? ''

  const [html, share] = await Promise.all([fetch(`${origin}/index.html`).then((r) => r.text()), loadShare(token).catch(() => null)])

  let title = 'Mapa de viajes · wxlter.'
  let description = 'Países, ciudades y lugares visitados.'
  if (share) {
    const n = share.countryIds.length
    const countries = `${n} ${n === 1 ? 'país' : 'países'}`
    title = share.tripName
      ? `${share.tripName}${share.displayName ? ` · ${share.displayName}` : ''}`
      : `${share.displayName ? `Mapa de ${share.displayName}` : 'Mapa de viajes'} · ${countries}`
    description = share.tripName ? `${countries} · ${share.places} lugares` : `${countries} · ${share.places} ciudades y lugares`
  }

  const image = `${origin}/api/og?t=${encodeURIComponent(token)}`
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Mapa · wxlter." />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(`${origin}/s/${token}`)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="robots" content="noindex" />`,
  ].join('\n    ')

  const page = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace('</head>', `    ${tags}\n  </head>`)

  return new Response(page, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=300' },
  })
}
