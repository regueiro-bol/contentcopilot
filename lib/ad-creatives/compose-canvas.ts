/**
 * lib/ad-creatives/compose-canvas.ts
 *
 * Composición de creatividades sociales estáticas con @napi-rs/canvas.
 * Sustituye a lib/ad-creatives/compose.ts (Sharp + SVG), cuyo texto se cortaba
 * en 1x1/1.91x1 porque librsvg no mide texto (sin word-wrap real ni auto-shrink).
 *
 * Aquí:
 *   - measureText → wrapping real + auto-shrink de fuente por bloque
 *   - safe zones y región de texto propias de cada ratio (1x1, 9x16, 1.91x1)
 *   - clamp: el texto NUNCA se sale de su zona (recorta con elipsis en el peor caso)
 *   - gradiente/scrim solo bajo el texto, con tinte del color primario de marca
 *   - logo + botón de CTA con el color secundario
 *
 * Mismo contrato de salida que el compositor anterior (Buffer PNG), más el
 * campo opcional `subheadline`.
 */

import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas'
import { FUENTES_DISPONIBLES } from '@/lib/video/fonts'

export type AdFormat = '1x1' | '9x16' | '1.91x1'

export interface ComposeParams {
  backgroundImageUrl: string
  headline:           string
  subheadline?:       string | null
  body?:              string | null
  cta?:               string | null
  logoBuffer?:        Buffer | null
  primaryHex:         string
  secondaryHex:       string
  format:             AdFormat
  fontBuffer?:        Buffer | null
}

// ── Fuentes ──────────────────────────────────────────────────────────────────
const FALLBACK_FAMILY = 'DejaVu Sans'
let catalogRegistered = false
const registeredFamilies = new Set<string>()

/** Registra el catálogo (una vez) y, si hay fuente de marca, la registra con
 *  un nombre único por contenido (evita bleed entre clientes en lambdas calientes). */
function ensureFonts(fontBuffer?: Buffer | null): string {
  if (!catalogRegistered) {
    const dir = path.join(process.cwd(), 'public', 'fonts')
    for (const f of FUENTES_DISPONIBLES) {
      const okR = GlobalFonts.registerFromPath(path.join(dir, f.files.regular), f.familia)
      const okB = GlobalFonts.registerFromPath(path.join(dir, f.files.bold), f.familia)
      if (okR && okB) registeredFamilies.add(f.familia)
    }
    catalogRegistered = true
  }

  if (fontBuffer && fontBuffer.length > 0) {
    const hash   = crypto.createHash('sha1').update(fontBuffer).digest('hex').slice(0, 10)
    const family = `AdBrand_${hash}`
    if (registeredFamilies.has(family)) return family
    try {
      if (GlobalFonts.register(fontBuffer, family)) {
        registeredFamilies.add(family)
        return family
      }
    } catch { /* fuente inválida — fallback */ }
  }
  return FALLBACK_FAMILY
}

// ── Configuración por formato ────────────────────────────────────────────────
type TextRegion = 'bottom' | 'left'

interface FormatConfig {
  width:            number
  height:           number
  margin:           number
  region:           TextRegion
  headlineSizes:    number[]
  subSizes:         number[]
  bodySizes:        number[]
  ctaSize:          number
  maxHeadlineLines: number
  maxSubLines:      number
  maxBodyLines:     number
  /** ancho de la columna de texto como fracción del ancho (solo región 'left') */
  colWidthFrac:     number
  /** inset inferior reservado (UI de la app en Stories) además del margen */
  safeBottom:       number
  logoMaxH:         number
}

const FORMAT_CONFIG: Record<AdFormat, FormatConfig> = {
  '1x1': {
    width: 1080, height: 1080, margin: 80, region: 'bottom',
    headlineSizes: [76, 68, 60, 52], subSizes: [38, 34, 30], bodySizes: [32, 28, 24], ctaSize: 30,
    maxHeadlineLines: 3, maxSubLines: 2, maxBodyLines: 2, colWidthFrac: 1, safeBottom: 0, logoMaxH: 90,
  },
  '9x16': {
    width: 1080, height: 1920, margin: 60, region: 'bottom',
    headlineSizes: [84, 76, 68, 60], subSizes: [44, 40, 36], bodySizes: [36, 32, 28], ctaSize: 34,
    maxHeadlineLines: 3, maxSubLines: 2, maxBodyLines: 3, colWidthFrac: 1, safeBottom: 300, logoMaxH: 96,
  },
  '1.91x1': {
    width: 1200, height: 628, margin: 60, region: 'left',
    headlineSizes: [58, 50, 44, 38], subSizes: [28, 24], bodySizes: [26, 22], ctaSize: 28,
    maxHeadlineLines: 2, maxSubLines: 1, maxBodyLines: 1, colWidthFrac: 0.56, safeBottom: 0, logoMaxH: 64,
  },
}

// ── Helpers de color ─────────────────────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex.startsWith('#') ? hex.slice(1) : hex).padEnd(6, '0')
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  }
}

/** Color de texto con contraste sobre un fondo (WCAG-ish) */
function contrastColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.55 ? '#1a1a1a' : '#FFFFFF'
}

// ── Medición / wrapping / ajuste ─────────────────────────────────────────────
function wrapText(ctx: SKRSContext2D, texto: string, maxWidth: number): string[] {
  const palabras = texto.trim().split(/\s+/)
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const cand = actual ? `${actual} ${palabra}` : palabra
    if (ctx.measureText(cand).width <= maxWidth || !actual) actual = cand
    else { lineas.push(actual); actual = palabra }
  }
  if (actual) lineas.push(actual)
  return lineas
}

interface FitResult { size: number; lines: string[]; lineH: number }

/** Mayor tamaño cuyo wrapping cabe en maxLines; si ni el menor cabe, recorta con elipsis. */
function fitBlock(
  ctx: SKRSContext2D, texto: string, sizes: number[],
  weight: 'bold' | 'normal', family: string, maxWidth: number, maxLines: number,
): FitResult {
  for (const size of sizes) {
    ctx.font = `${weight === 'bold' ? 'bold ' : ''}${size}px "${family}"`
    const lines = wrapText(ctx, texto, maxWidth)
    if (lines.length <= maxLines) return { size, lines, lineH: Math.round(size * 1.2) }
  }
  const size = sizes[sizes.length - 1]
  ctx.font = `${weight === 'bold' ? 'bold ' : ''}${size}px "${family}"`
  const lines = wrapText(ctx, texto, maxWidth).slice(0, maxLines)
  let ultima = lines[maxLines - 1] ?? ''
  while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > maxWidth) {
    ultima = ultima.slice(0, -1).trimEnd()
  }
  if (lines.length) lines[maxLines - 1] = `${ultima}…`
  return { size, lines, lineH: Math.round(size * 1.2) }
}

interface Bloque { fit: FitResult; weight: 'bold' | 'normal'; color: string; opacity: number }

function alturaBloques(bloques: Bloque[], gap: number): number {
  return bloques.reduce((acc, b) => acc + b.fit.lines.length * b.fit.lineH, 0)
    + gap * Math.max(0, bloques.length - 1)
}

// ── Rounded rect (por si roundRect no está disponible) ───────────────────────
function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// ─────────────────────────────────────────────────────────────────────────────
// Composición principal
// ─────────────────────────────────────────────────────────────────────────────
export async function composeCreativeCanvas(params: ComposeParams): Promise<Buffer> {
  const {
    backgroundImageUrl, headline, subheadline, body, cta,
    logoBuffer, primaryHex, secondaryHex, format, fontBuffer,
  } = params

  const family = ensureFonts(fontBuffer)
  const cfg = FORMAT_CONFIG[format]
  const { width: W, height: H } = cfg

  // 1. Fondo cover
  const bgResp = await fetch(backgroundImageUrl)
  if (!bgResp.ok) throw new Error(`Error descargando fondo: ${bgResp.status}`)
  const bgBuf = Buffer.from(await bgResp.arrayBuffer())
  const basePng = await sharp(bgBuf).resize(W, H, { fit: 'cover', position: 'centre' }).png().toBuffer()

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(await loadImage(basePng), 0, 0, W, H)

  // 2. Geometría de la columna de texto
  const maxWidth = cfg.region === 'left'
    ? Math.round(W * cfg.colWidthFrac) - cfg.margin - Math.round(cfg.margin / 2)
    : W - cfg.margin * 2

  // 3. Ajustar bloques (headline obligatorio; el resto opcional)
  const headlineFit = fitBlock(ctx, headline.trim() || ' ', cfg.headlineSizes, 'bold', family, maxWidth, cfg.maxHeadlineLines)
  const bloques: Bloque[] = [{ fit: headlineFit, weight: 'bold', color: '#FFFFFF', opacity: 1 }]

  if (subheadline?.trim()) {
    bloques.push({ fit: fitBlock(ctx, subheadline.trim(), cfg.subSizes, 'normal', family, maxWidth, cfg.maxSubLines), weight: 'normal', color: '#FFFFFF', opacity: 0.95 })
  }
  if (body?.trim()) {
    bloques.push({ fit: fitBlock(ctx, body.trim(), cfg.bodySizes, 'normal', family, maxWidth, cfg.maxBodyLines), weight: 'normal', color: '#F0F2F6', opacity: 0.9 })
  }

  const gapBloques = Math.round(headlineFit.size * 0.35)
  const ctaH = cta?.trim() ? cfg.ctaSize + 30 : 0
  const ctaGap = cta?.trim() ? Math.round(headlineFit.size * 0.4) : 0

  // 4. Zona disponible y anclaje según región
  let regionTop: number
  let regionBottom: number
  if (cfg.region === 'left') {
    regionTop = cfg.margin
    regionBottom = H - cfg.margin
  } else {
    regionTop = Math.round(H * 0.42)
    regionBottom = H - cfg.margin - cfg.safeBottom
  }
  const disponible = regionBottom - regionTop

  // 5. Si no cabe, soltar body y luego subheadline (mantener headline + cta)
  const totalCon = () => alturaBloques(bloques, gapBloques) + ctaGap + ctaH
  while (totalCon() > disponible && bloques.length > 1) {
    bloques.pop()
  }

  const totalTextH = totalCon()

  // 6. Posición del bloque
  let blockTop: number
  if (cfg.region === 'left') {
    blockTop = Math.max(regionTop, regionTop + Math.round((disponible - totalTextH) / 2))
  } else {
    blockTop = Math.max(regionTop, regionBottom - totalTextH)
  }

  // 7. Scrim/gradiente de legibilidad SOLO bajo el texto
  const { r: pr, g: pg, b: pb } = hexToRgb(primaryHex)
  if (cfg.region === 'left') {
    const gradW = Math.round(W * (cfg.colWidthFrac + 0.08))
    const grad = ctx.createLinearGradient(0, 0, gradW, 0)
    grad.addColorStop(0, `rgba(${Math.round(pr * 0.25)},${Math.round(pg * 0.25)},${Math.round(pb * 0.25)},0.92)`)
    grad.addColorStop(0.7, `rgba(${Math.round(pr * 0.25)},${Math.round(pg * 0.25)},${Math.round(pb * 0.25)},0.55)`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, gradW, H)
  } else {
    const pad = 100
    const gTop = Math.max(0, blockTop - pad)
    const grad = ctx.createLinearGradient(0, gTop, 0, H)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(0.35, `rgba(${Math.round(pr * 0.22)},${Math.round(pg * 0.22)},${Math.round(pb * 0.22)},0.55)`)
    grad.addColorStop(1, `rgba(${Math.round(pr * 0.28)},${Math.round(pg * 0.28)},${Math.round(pb * 0.28)},0.9)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, gTop, W, H - gTop)
  }

  // 8. Dibujar texto (con sombra suave)
  const textX = cfg.margin
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 2

  let y = blockTop
  for (let i = 0; i < bloques.length; i++) {
    if (i > 0) y += gapBloques
    const b = bloques[i]
    ctx.font = `${b.weight === 'bold' ? 'bold ' : ''}${b.fit.size}px "${family}"`
    ctx.globalAlpha = b.opacity
    ctx.fillStyle = b.color
    for (const linea of b.fit.lines) {
      ctx.fillText(linea, textX, y)
      y += b.fit.lineH
    }
  }
  ctx.globalAlpha = 1
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // 9. Botón CTA
  if (cta?.trim()) {
    y += ctaGap - gapBloques
    ctx.font = `bold ${cfg.ctaSize}px "${family}"`
    const tw = ctx.measureText(cta.trim()).width
    const btnW = Math.min(tw + 56, maxWidth)
    const btnH = cfg.ctaSize + 30
    ctx.fillStyle = `#${(secondaryHex.startsWith('#') ? secondaryHex.slice(1) : secondaryHex).padEnd(6, '0')}`
    roundRect(ctx, textX, y, btnW, btnH, 10)
    ctx.fill()
    ctx.fillStyle = contrastColor(secondaryHex)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(cta.trim(), textX + btnW / 2, y + btnH / 2 + 1)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
  }

  // 10. Logo (esquina superior derecha, con backdrop blanco)
  if (logoBuffer && logoBuffer.length > 0) {
    try {
      const meta = await sharp(logoBuffer).metadata()
      const aspect = meta.width && meta.height ? meta.width / meta.height : 1
      const logoH = cfg.logoMaxH
      const logoW = Math.round(logoH * aspect)
      const logoPng = await sharp(logoBuffer).resize({ height: logoH, withoutEnlargement: true }).png().toBuffer()
      const lx = W - logoW - 40
      const ly = 40
      ctx.fillStyle = 'rgba(255,255,255,0.88)'
      roundRect(ctx, lx - 12, ly - 8, logoW + 24, logoH + 16, 12)
      ctx.fill()
      ctx.drawImage(await loadImage(logoPng), lx, ly, logoW, logoH)
    } catch { /* logo opcional — si falla, se omite */ }
  }

  return canvas.toBuffer('image/png')
}
