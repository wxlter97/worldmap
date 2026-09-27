// Genera los PNG del PWA a partir de design/app-mapa.svg.
import sharp from 'sharp'
const src = new URL('../design/app-mapa.svg', import.meta.url).pathname
const out = new URL('../public/icons/', import.meta.url).pathname
for (const [name, size] of [['icon-180', 180], ['icon-192', 192], ['icon-512', 512], ['icon-512-maskable', 512]]) {
  await sharp(src).resize(size, size).png().toFile(`${out}${name}.png`)
}
