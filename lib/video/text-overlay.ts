/**
 * lib/video/text-overlay.ts
 *
 * Composición de texto sobre imágenes 9:16 (1080×1920) para Reels/Stories
 * con @napi-rs/canvas. Sustituye al enfoque Sharp+SVG (librsvg no mide texto,
 * por lo que no puede hacer word-wrapping y los textos largos se cortaban).
 *
 * - Mide el texto real (ctx.measureText) y hace wrapping automático
 * - Reduce el tamaño de fuente progresivamente si no cabe en 3 líneas
 * - Respeta las safe zones de la UI de Instagram
 * - Gradiente oscuro solo en la franja del texto, texto blanco con sombra
 *
 * Devuelve un buffer PNG 1080×1920 — mismo contrato que la función anterior,
 * FFmpeg no cambia.
 */

import path from 'path'
import sharp from 'sharp'
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas'
import { FUENTES_DISPONIBLES } from './fonts'

export type PosicionTexto = 'arriba' | 'centro' | 'abajo'

// ── Lienzo y safe zones (1080×1920, Reels/Stories) ───────────────────────────
const W = 1080
const H = 1920
const SAFE_TOP = 250     // UI superior: usuario, cámara
const SAFE_BOTTOM = 320  // UI inferior: caption, botones, barra de navegación
const MARGIN_X = 60

const ANCHO_UTIL = W - MARGIN_X * 2          // 960
const MAX_TEXT_W = Math.floor(ANCHO_UTIL * 0.9) // 864 — 90% del ancho útil

const FONT_FAMILY_FALLBACK = 'DejaVu Sans'
const SIZES_PRINCIPAL = [72, 64, 56]
const SIZES_SECUNDARIO = [40, 36, 32]
const MAX_LINEAS = 3
const LINE_HEIGHT = 1.2

// ── Registro de fuentes (una sola vez por proceso) ───────────────────────────
// Se registran todas las del catálogo (lib/video/fonts.ts) desde public/fonts/.
// NO se depende de fuentes del sistema — Vercel no tiene Arial.
let fontsRegistradas = false
const familiasRegistradas = new Set<string>()

function registrarFuentes(): void {
  if (fontsRegistradas) return
  const dir = path.join(process.cwd(), 'public', 'fonts')
  for (const fuente of FUENTES_DISPONIBLES) {
    const okRegular = GlobalFonts.registerFromPath(path.join(dir, fuente.files.regular), fuente.familia)
    const okBold    = GlobalFonts.registerFromPath(path.join(dir, fuente.files.bold), fuente.familia)
    if (okRegular && okBold) {
      familiasRegistradas.add(fuente.familia)
    } else {
      console.warn(`[VIDEO CANVAS] No se pudo registrar la fuente "${fuente.familia}" (regular=${okRegular}, bold=${okBold})`)
    }
  }
  fontsRegistradas = true
}

/** Familia efectiva: la pedida si está registrada, DejaVu Sans si no. */
function resolverFamilia(familia?: string): string {
  if (familia && familiasRegistradas.has(familia)) return familia
  if (familia && familia !== FONT_FAMILY_FALLBACK) {
    console.warn(`[VIDEO CANVAS] Fuente "${familia}" no registrada — fallback a ${FONT_FAMILY_FALLBACK}`)
  }
  return FONT_FAMILY_FALLBACK
}

// ── Word-wrapping con medición real ──────────────────────────────────────────
function wrapText(ctx: SKRSContext2D, texto: string, maxWidth: number): string[] {
  const palabras = texto.trim().split(/\s+/)
  const lineas: string[] = []
  let actual = ''

  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra
    if (ctx.measureText(candidata).width <= maxWidth || !actual) {
      actual = candidata
    } else {
      lineas.push(actual)
      actual = palabra
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

/**
 * Busca el mayor tamaño de fuente (de la lista) cuyo wrapping quepa en
 * MAX_LINEAS. Si ni el menor cabe, se queda con el menor y recorta a
 * MAX_LINEAS con elipsis — el texto nunca desborda el lienzo.
 */
function ajustarTexto(
  ctx    : SKRSContext2D,
  texto  : string,
  sizes  : number[],
  weight : 'bold' | 'normal',
  familia: string,
): { fontSize: number; lineas: string[] } {
  for (const size of sizes) {
    ctx.font = `${weight === 'bold' ? 'bold ' : ''}${size}px "${familia}"`
    const lineas = wrapText(ctx, texto, MAX_TEXT_W)
    if (lineas.length <= MAX_LINEAS) return { fontSize: size, lineas }
  }
  // Ni el tamaño menor cabe en MAX_LINEAS: recortar con elipsis
  const size = sizes[sizes.length - 1]
  ctx.font = `${weight === 'bold' ? 'bold ' : ''}${size}px "${familia}"`
  const lineas = wrapText(ctx, texto, MAX_TEXT_W).slice(0, MAX_LINEAS)
  let ultima = lineas[MAX_LINEAS - 1]
  while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > MAX_TEXT_W) {
    ultima = ultima.slice(0, -1).trimEnd()
  }
  lineas[MAX_LINEAS - 1] = `${ultima}…`
  return { fontSize: size, lineas }
}

interface BloqueTexto {
  lineas    : string[]
  fontSize  : number
  lineH     : number
  weight    : 'bold' | 'normal'
  color     : string
}

/**
 * Aplica los textos sobre una imagen 9:16 y devuelve el PNG compuesto.
 *
 * @param imageBuf        imagen base (cualquier tamaño — se recorta a 1080×1920 cover)
 * @param textoPrincipal  frase principal (bold, hasta 3 líneas con auto-ajuste 72→64→56)
 * @param textoSecundario frase secundaria opcional (regular, 40→36→32)
 * @param posicion        'arriba' | 'centro' | 'abajo' del área útil entre safe zones
 * @param fontFamily      familia del catálogo (lib/video/fonts.ts) — fallback DejaVu Sans
 */
export async function aplicarOverlayTextoCanvas(
  imageBuf       : Buffer,
  textoPrincipal : string,
  textoSecundario?: string,
  posicion       : PosicionTexto = 'centro',
  slideIndex     : number = 0,
  fontFamily?    : string,
): Promise<Buffer> {
  registrarFuentes()
  const familia = resolverFamilia(fontFamily)

  // 1. Normalizar la imagen base a 1080×1920 (cover) con sharp
  const basePng = await sharp(imageBuf)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(await loadImage(basePng), 0, 0, W, H)

  // 2. Medir y ajustar los bloques de texto
  const bloques: BloqueTexto[] = []

  const principal = ajustarTexto(ctx, textoPrincipal.trim(), SIZES_PRINCIPAL, 'bold', familia)
  bloques.push({
    lineas  : principal.lineas,
    fontSize: principal.fontSize,
    lineH   : Math.round(principal.fontSize * LINE_HEIGHT),
    weight  : 'bold',
    color   : '#ffffff',
  })

  if (textoSecundario?.trim()) {
    const secundario = ajustarTexto(ctx, textoSecundario.trim(), SIZES_SECUNDARIO, 'normal', familia)
    bloques.push({
      lineas  : secundario.lineas,
      fontSize: secundario.fontSize,
      lineH   : Math.round(secundario.fontSize * LINE_HEIGHT),
      weight  : 'normal',
      color   : '#dde0e8',
    })
  }

  // Separación entre principal y secundario, proporcional al tamaño principal
  const gapBloques = bloques.length > 1 ? Math.round(principal.fontSize * 0.5) : 0
  const altoTotal = bloques.reduce((acc, b) => acc + b.lineas.length * b.lineH, 0) + gapBloques

  // 3. Posición vertical del bloque dentro del área útil (entre safe zones)
  const utilTop = SAFE_TOP + 30
  const utilBottom = H - SAFE_BOTTOM - 30
  const utilAlto = utilBottom - utilTop

  let blockTop: number
  if (posicion === 'arriba') {
    blockTop = utilTop
  } else if (posicion === 'abajo') {
    blockTop = utilBottom - altoTotal
  } else {
    blockTop = utilTop + Math.round((utilAlto - altoTotal) / 2)
  }
  // Clamp defensivo: nunca invadir las safe zones aunque el bloque sea muy alto
  blockTop = Math.max(utilTop, Math.min(blockTop, utilBottom - altoTotal))

  // 4. Gradiente oscuro solo en la franja del texto, con degradado suave
  const padGradiente = 90
  const gTop = Math.max(0, blockTop - padGradiente)
  const gBottom = Math.min(H, blockTop + altoTotal + padGradiente)
  const gradiente = ctx.createLinearGradient(0, gTop, 0, gBottom)
  gradiente.addColorStop(0, 'rgba(0,0,0,0)')
  gradiente.addColorStop(0.22, 'rgba(0,0,0,0.55)')
  gradiente.addColorStop(0.78, 'rgba(0,0,0,0.55)')
  gradiente.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradiente
  ctx.fillRect(0, gTop, W, gBottom - gTop)

  // 5. Dibujar los textos, centrados, con sombra suave
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.shadowColor = 'rgba(0,0,0,0.65)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 3

  let y = blockTop
  for (let idx = 0; idx < bloques.length; idx++) {
    const bloque = bloques[idx]
    if (idx > 0) y += gapBloques
    ctx.font = `${bloque.weight === 'bold' ? 'bold ' : ''}${bloque.fontSize}px "${familia}"`
    ctx.fillStyle = bloque.color
    for (const linea of bloque.lineas) {
      ctx.fillText(linea, W / 2, y)
      y += bloque.lineH
    }
  }

  console.log(
    `[VIDEO CANVAS] Slide ${slideIndex} — pos=${posicion} font="${familia}" top=${blockTop} alto=${altoTotal} ` +
    `principal=${principal.fontSize}px/${principal.lineas.length}L` +
    (bloques.length > 1 ? ` sec=${bloques[1].fontSize}px/${bloques[1].lineas.length}L` : ''),
  )

  return canvas.toBuffer('image/png')
}
