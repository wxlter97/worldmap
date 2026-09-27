// Genera localmente la tarjeta de un link compartido contra el emulador (con `npm run emulators` y `npm run dev`):
//   npx tsx scripts/og-preview.mts <token> [salida.png]
import { writeFileSync } from 'node:fs'

process.env.FIRESTORE_REST_BASE ??= 'http://localhost:8080/v1/projects/demo-worldmap/databases/(default)/documents'
process.env.PUBLIC_ORIGIN ??= 'http://localhost:5173'
const { GET: og } = await import('../api/og.ts')
const { GET: page } = await import('../api/share-page.ts')

const [token = '', out = 'og-preview.png'] = process.argv.slice(2)
const img = await og(new Request(`${process.env.PUBLIC_ORIGIN}/api/og?t=${token}`))
writeFileSync(out, Buffer.from(await img.arrayBuffer()))
const html = await (await page(new Request(`${process.env.PUBLIC_ORIGIN}/s/${token}`))).text()
console.log(`Imagen: ${out}`)
console.log(html.split('\n').filter((l) => /og:(title|description)/.test(l)).map((l) => l.trim()).join('\n'))
