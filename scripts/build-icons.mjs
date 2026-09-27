// Genera los PNG del PWA a partir de design/app-mapa*.svg.
import sharp from 'sharp'
const dir = (p) => new URL(p, import.meta.url).pathname
const main = dir('../design/app-mapa.svg')
const mono = dir('../design/app-mapa-monochrome.svg')
const out = dir('../public/icons/')
for (const [name, size] of [['icon-180', 180], ['icon-192', 192], ['icon-512', 512], ['icon-512-maskable', 512]]) {
  await sharp(main).resize(size, size).flatten({ background: '#111111' }).png().toFile(`${out}${name}.png`)
}
await sharp(mono).resize(512, 512).png().toFile(`${out}icon-512-monochrome.png`)
