// Gera os artefatos derivados da logo (src/assets/logo-branco.png):
// variante colorida pro tema claro + ícones do PWA/favicon (fundo sólido na
// cor primária, logo branca centralizada). Rodar de novo sempre que o
// arquivo de origem ou a cor primária mudar: `npm run generate:icons`.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const SOURCE_LOGO = path.join(ROOT, 'src/assets/logo-branco.png')
const COLOR_LOGO_OUT = path.join(ROOT, 'src/assets/logo-cor.png')
const PUBLIC_DIR = path.join(ROOT, 'public')

// Primária do tema claro (decisão #34, supera a decisão #32): preto suave,
// não preto puro -- ver src/index.css `--primary`. Ícone/logo usam só o
// valor claro (mesmo padrão da decisão #7 original: uma cor só pro ícone,
// independente do tema do dispositivo).
const PRIMARY = { r: 0x11, g: 0x11, b: 0x11, alpha: 1 }

async function makeColorLogo() {
  const { width, height } = await sharp(SOURCE_LOGO).metadata()
  const solid = await sharp({
    create: { width, height, channels: 4, background: PRIMARY },
  })
    .png()
    .toBuffer()

  // dest-in: mantém a cor sólida só onde a logo branca tem alfa --
  // recolore preservando o anti-aliasing original do recorte.
  await sharp(solid)
    .composite([{ input: SOURCE_LOGO, blend: 'dest-in' }])
    .png()
    .toFile(COLOR_LOGO_OUT)
  console.log(`✓ ${path.relative(ROOT, COLOR_LOGO_OUT)}`)
}

/** Ícone "selo": fundo sólido na cor primária (sem transparência -- iOS/
 * Android não lidam bem com alfa em ícone de app) com a logo branca
 * centralizada, ocupando `logoWidthRatio` da largura do canvas. */
async function makeBadgeIcon(size, logoWidthRatio, outPath) {
  const logoWidth = Math.round(size * logoWidthRatio)
  const resizedLogo = await sharp(SOURCE_LOGO)
    .resize({ width: logoWidth })
    .toBuffer()
  const resizedMeta = await sharp(resizedLogo).metadata()

  await sharp({
    create: { width: size, height: size, channels: 4, background: PRIMARY },
  })
    .composite([
      {
        input: resizedLogo,
        left: Math.round((size - resizedMeta.width) / 2),
        top: Math.round((size - resizedMeta.height) / 2),
      },
    ])
    .png()
    .toFile(outPath)
  console.log(`✓ ${path.relative(ROOT, outPath)}`)
}

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true })
  await makeColorLogo()

  // Ícones "any": logo ocupa 70% da largura, resto é a folga natural do
  // letterboxing (logo é bem mais larga que alta).
  await makeBadgeIcon(192, 0.7, path.join(PUBLIC_DIR, 'pwa-192x192.png'))
  await makeBadgeIcon(512, 0.7, path.join(PUBLIC_DIR, 'pwa-512x512.png'))
  await makeBadgeIcon(180, 0.7, path.join(PUBLIC_DIR, 'apple-touch-icon.png'))

  // Maskable: SOs recortam em círculo/squircle -- logo bem menor (50%) pra
  // sobrar folga suficiente na "safe zone" (~80% central recomendada).
  await makeBadgeIcon(512, 0.5, path.join(PUBLIC_DIR, 'maskable-512x512.png'))

  // Favicon: mesmo tratamento em tamanhos pequenos (aba do navegador).
  await makeBadgeIcon(48, 0.7, path.join(PUBLIC_DIR, 'favicon-48x48.png'))
  await makeBadgeIcon(32, 0.7, path.join(PUBLIC_DIR, 'favicon-32x32.png'))
  await makeBadgeIcon(16, 0.7, path.join(PUBLIC_DIR, 'favicon-16x16.png'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
