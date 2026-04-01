/**
 * lib/ad-creatives/compose.ts
 *
 * Composición visual de ad creatives con sharp.
 *
 * Pipeline:
 *   1. Fal.ai genera el fondo (sin texto, sin overlays)
 *   2. composeCreative() construye el PNG final:
 *      - Imagen de fondo recortada al área superior/izquierda
 *      - Bloque de color sólido (color primario del cliente) en el área inferior/derecha
 *      - SVG overlay: headline, body, CTA, logo
 *
 * Formatos soportados:
 *   1x1    → 1080×1080  — image top 60%  / color block bottom 40%
 *   9x16   → 1080×1920  — image top 55%  / color block bottom 45%
 *   1.91x1 → 1200×628   — image left 60% / color block right 40%
 */

import sharp from 'sharp'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AdFormat = '1x1' | '9x16' | '1.91x1'

export interface ComposeParams {
  /** URL de la imagen generada por Fal.ai (sin texto) */
  backgroundImageUrl: string
  /** Titular principal (max ~6 palabras idealmente) */
  headline: string
  /** Texto del cuerpo (opcional) */
  body?: string
  /** Call to action (opcional, 2-4 palabras) */
  cta?: string
  /** Bytes del logo del cliente (PNG/SVG previa conversión) */
  logoBuffer?: Buffer | null
  /** Color primario del bloque de texto, en HEX (con o sin #) */
  primaryHex: string
  /** Color secundario para el botón CTA, en HEX */
  secondaryHex: string
  /** Formato del creativo */
  format: AdFormat
  /** Bytes de fuente custom TTF/OTF (opcional, fallback a Arial) */
  fontBuffer?: Buffer | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimensiones por formato
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_DIMS: Record<AdFormat, { width: number; height: number }> = {
  '1x1':    { width: 1080, height: 1080 },
  '9x16':   { width: 1080, height: 1920 },
  '1.91x1': { width: 1200, height: 628 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeHex(hex: string): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  return clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex)
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  }
}

/** Devuelve "white" o "black" dependiendo del luminance del color de fondo */
function contrastColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  // Relative luminance (WCAG)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.55 ? '#1a1a1a' : '#FFFFFF'
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 4) // hard cap: 4 líneas
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

interface AreaRect { left: number; top: number; width: number; height: number }

interface Layout {
  bg:    AreaRect
  block: AreaRect
  logo: {
    /** Posición X del logo en el canvas (se ajusta tras conocer logoWidth) */
    baseX: number
    y: number
    maxHeight: number
    inColorBlock: boolean
  }
  text: {
    startX: number
    /** Coordenada Y de la primera línea (antes de añadir fontSize) */
    startY: number
    maxWidth: number
  }
  fonts: { headline: number; body: number; cta: number }
}

function buildLayout(width: number, height: number, format: AdFormat): Layout {
  const pad = 48

  if (format === '1.91x1') {
    const bgW     = Math.round(width * 0.60)   // 720
    const blkLeft = bgW
    const blkW    = width - bgW                // 480

    return {
      bg:    { left: 0, top: 0, width: bgW, height },
      block: { left: blkLeft, top: 0, width: blkW, height },
      logo:  {
        baseX:       blkLeft + blkW - 120 - 20,  // ajustado en compose()
        y:           20,
        maxHeight:   80,
        inColorBlock: true,
      },
      text:  {
        startX:   blkLeft + pad,
        startY:   pad,                           // texto arriba-izquierda del bloque
        maxWidth: blkW - pad * 2,
      },
      fonts: { headline: 52, body: 24, cta: 22 },
    }
  }

  const bgFrac = format === '9x16' ? 0.55 : 0.60
  const bgH = Math.round(height * bgFrac)

  return {
    bg:    { left: 0, top: 0, width, height: bgH },
    block: { left: 0, top: bgH, width, height: height - bgH },
    logo:  {
      baseX:       width - 120 - 20,           // ajustado en compose()
      y:           20,
      maxHeight:   format === '9x16' ? 120 : 100,
      inColorBlock: false,
    },
    text:  {
      startX:   pad,
      startY:   bgH + pad,
      maxWidth: width - pad * 2,
    },
    fonts: {
      headline: format === '9x16' ? 96 : 72,
      body:     format === '9x16' ? 36 : 32,
      cta:      format === '9x16' ? 32 : 28,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG builder
// ─────────────────────────────────────────────────────────────────────────────

function buildSvgOverlay(opts: {
  layout:        Layout
  width:         number
  height:        number
  headline:      string
  body?:         string
  cta?:          string
  primaryHex:    string
  secondaryHex:  string
  logoBase64?:   string | null
  logoDrawW:     number
  logoDrawH:     number
  fontBase64?:   string | null
}): string {
  const {
    layout, width, height,
    headline, body, cta,
    primaryHex, secondaryHex,
    logoBase64, logoDrawW, logoDrawH,
    fontBase64,
  } = opts

  const { block, logo, text, fonts } = layout
  const textColor = contrastColor(primaryHex)
  const lineH = (fs: number) => Math.round(fs * 1.32)

  // ── Fuente personalizada ──────────────────────────────────────────────────
  const fontDef = fontBase64
    ? `<defs><style>@font-face{font-family:'CF';src:url('data:font/truetype;base64,${fontBase64}') format('truetype')}</style></defs>`
    : ''
  const ff = fontBase64
    ? "'CF', Arial, 'Liberation Sans', sans-serif"
    : "Arial, 'Liberation Sans', Helvetica, sans-serif"

  let inner = ''

  // ── Color block (fondo sólido) ────────────────────────────────────────────
  inner += `<rect x="${block.left}" y="${block.top}" width="${block.width}" height="${block.height}" fill="#${normalizeHex(primaryHex)}"/>`

  // ── Logo ──────────────────────────────────────────────────────────────────
  if (logoBase64 && logoDrawW > 0) {
    const lx = logo.inColorBlock
      ? block.left + block.width - logoDrawW - 20
      : width - logoDrawW - 20
    const ly = logo.y

    // Fondo blanco semitransparente cuando el logo está sobre la foto
    if (!logo.inColorBlock) {
      inner += `<rect x="${lx - 10}" y="${ly - 6}" width="${logoDrawW + 20}" height="${logoDrawH + 12}" rx="10" fill="rgba(255,255,255,0.82)"/>`
    }
    inner += `<image href="data:image/png;base64,${logoBase64}" x="${lx}" y="${ly}" width="${logoDrawW}" height="${logoDrawH}" preserveAspectRatio="xMidYMid meet"/>`
  }

  // ── Texto (headline, body, CTA) ───────────────────────────────────────────
  const maxCols = (fs: number) => Math.floor(text.maxWidth / (fs * 0.58))
  const hlLines  = wrapText(headline, maxCols(fonts.headline))
  const bdLines  = body ? wrapText(body, maxCols(fonts.body)) : []

  let cy = text.startY + fonts.headline  // primera baseline

  // Headline
  for (const line of hlLines) {
    inner += `<text x="${text.startX}" y="${cy}" font-family="${ff}" font-weight="bold" font-size="${fonts.headline}" fill="${escapeXml(textColor)}">${escapeXml(line)}</text>`
    cy += lineH(fonts.headline)
  }
  cy += 16  // gap

  // Body
  for (const line of bdLines) {
    inner += `<text x="${text.startX}" y="${cy}" font-family="${ff}" font-size="${fonts.body}" fill="${escapeXml(textColor)}" opacity="0.88">${escapeXml(line)}</text>`
    cy += lineH(fonts.body)
  }
  if (bdLines.length) cy += 20

  // CTA button
  if (cta) {
    const ctaH  = fonts.cta + 28
    const ctaR  = 8
    const ctaW  = Math.min(cta.length * fonts.cta * 0.62 + 56, text.maxWidth)
    const secColor = escapeXml(`#${normalizeHex(secondaryHex)}`)
    const ctaTextColor = escapeXml(contrastColor(secondaryHex))
    inner += `<rect x="${text.startX}" y="${cy}" width="${ctaW}" height="${ctaH}" rx="${ctaR}" fill="${secColor}"/>`
    inner += `<text x="${text.startX + ctaW / 2}" y="${cy + ctaH / 2 + fonts.cta * 0.35}" font-family="${ff}" font-weight="bold" font-size="${fonts.cta}" fill="${ctaTextColor}" text-anchor="middle">${escapeXml(cta)}</text>`
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${fontDef}${inner}</svg>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Función principal: composeCreative
// ─────────────────────────────────────────────────────────────────────────────

export async function composeCreative(params: ComposeParams): Promise<Buffer> {
  const {
    backgroundImageUrl,
    headline, body, cta,
    logoBuffer,
    primaryHex, secondaryHex,
    format,
    fontBuffer,
  } = params

  const { width, height } = FORMAT_DIMS[format]
  const layout = buildLayout(width, height, format)

  // ── 1. Imagen de fondo ────────────────────────────────────────────────────
  const bgResp = await fetch(backgroundImageUrl)
  if (!bgResp.ok) throw new Error(`Error descargando fondo: ${bgResp.status} ${bgResp.statusText}`)
  const bgBuffer = Buffer.from(await bgResp.arrayBuffer())

  const bgResized = await sharp(bgBuffer)
    .resize(layout.bg.width, layout.bg.height, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 95 })
    .toBuffer()

  // ── 2. Logo ───────────────────────────────────────────────────────────────
  let logoBase64: string | null = null
  let logoDrawW = 0
  let logoDrawH = layout.logo.maxHeight

  if (logoBuffer && logoBuffer.length > 0) {
    try {
      const meta = await sharp(logoBuffer).metadata()
      const aspect = meta.width && meta.height ? meta.width / meta.height : 1
      logoDrawH = layout.logo.maxHeight
      logoDrawW = Math.round(logoDrawH * aspect)
      const logoPng = await sharp(logoBuffer)
        .resize({ height: logoDrawH, withoutEnlargement: true })
        .png()
        .toBuffer()
      logoBase64 = logoPng.toString('base64')
    } catch (e) {
      console.warn('[compose] Logo processing failed, skipping:', e instanceof Error ? e.message : e)
    }
  }

  // ── 3. Fuente custom ──────────────────────────────────────────────────────
  const fontBase64 = fontBuffer && fontBuffer.length > 0
    ? fontBuffer.toString('base64')
    : null

  // ── 4. SVG overlay ────────────────────────────────────────────────────────
  const svgStr = buildSvgOverlay({
    layout, width, height,
    headline, body, cta,
    primaryHex, secondaryHex,
    logoBase64, logoDrawW, logoDrawH,
    fontBase64,
  })

  // ── 5. Composición final ──────────────────────────────────────────────────
  const finalBuffer = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      { input: bgResized, top: layout.bg.top,  left: layout.bg.left  },
      { input: Buffer.from(svgStr), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 8 })
    .toBuffer()

  return finalBuffer
}
