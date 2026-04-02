/**
 * lib/ad-creatives/compose.ts
 *
 * Composición visual de ad creatives con sharp.
 *
 * Pipeline:
 *   1. Fal.ai genera el fondo (sin texto, sin overlays)
 *   2. composeCreative() construye el PNG final según el modo:
 *
 *   MODO "split"  → 1x1 y 1.91x1
 *      — Imagen de fondo en área superior/izquierda
 *      — Bloque de color sólido (primario del cliente) en área inferior/derecha
 *      — SVG overlay: headline, body, CTA, logo
 *
 *   MODO "overlay" → 9x16 (Stories/Reels)
 *      — Foto ocupa el canvas completo (1080×1920, object-cover)
 *      — Gradiente oscuro con tinte del color primario en el 40% inferior
 *      — Texto encima del gradiente: headline + body + CTA
 *      — Logo esquina superior derecha con backdrop blanco
 *
 * NOTA IMPORTANTE:
 *   En Vercel (Amazon Linux 2) Arial/Helvetica NO están instaladas.
 *   Siempre usar la familia genérica "sans-serif" como fallback para
 *   garantizar que librsvg renderice el texto correctamente.
 */

import sharp from 'sharp'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AdFormat = '1x1' | '9x16' | '1.91x1'

export interface ComposeParams {
  backgroundImageUrl: string
  headline:           string
  body?:              string
  cta?:               string
  logoBuffer?:        Buffer | null
  primaryHex:         string
  secondaryHex:       string
  format:             AdFormat
  fontBuffer?:        Buffer | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimensiones
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
    .replace(/'/g, '&apos;')
}

function normalizeHex(hex: string): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  return clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0')
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex)
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  }
}

/** WCAG luminance → color de texto con contraste adecuado */
function contrastColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
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
  return lines.slice(0, 4)
}

/** Familia de fuente para SVG — SIEMPRE termina en sans-serif (genérica, siempre disponible) */
function fontFamily(customBase64: string | null): string {
  return customBase64
    ? "'CustomFont', sans-serif"
    : 'sans-serif'
}

/** Definición @font-face para fuente custom en SVG */
function fontDefs(customBase64: string | null): string {
  if (!customBase64) return ''
  return `<defs><style>@font-face{font-family:'CustomFont';src:url('data:font/truetype;base64,${customBase64}') format('truetype')}</style></defs>`
}

// ─────────────────────────────────────────────────────────────────────────────
// MODO "split" — 1x1 y 1.91x1
// ─────────────────────────────────────────────────────────────────────────────

interface SplitLayout {
  bg:    { left: number; top: number; width: number; height: number }
  block: { left: number; top: number; width: number; height: number }
  logo:  { x: number; y: number; maxH: number; inColorBlock: boolean }
  text:  { x: number; startY: number; maxW: number }
  fonts: { headline: number; body: number; cta: number }
}

function buildSplitLayout(width: number, height: number, format: AdFormat): SplitLayout {
  const pad = 48

  if (format === '1.91x1') {
    const bgW = Math.round(width * 0.60)     // 720
    const blkW = width - bgW                  // 480
    return {
      bg:    { left: 0, top: 0, width: bgW, height },
      block: { left: bgW, top: 0, width: blkW, height },
      logo:  { x: bgW + blkW - 120 - 20, y: 20, maxH: 80, inColorBlock: true },
      text:  { x: bgW + pad, startY: pad, maxW: blkW - pad * 2 },
      fonts: { headline: 52, body: 24, cta: 22 },
    }
  }

  // 1x1
  const bgH = Math.round(height * 0.60)     // 648
  return {
    bg:    { left: 0, top: 0, width, height: bgH },
    block: { left: 0, top: bgH, width, height: height - bgH },
    logo:  { x: width - 120 - 20, y: 20, maxH: 100, inColorBlock: false },
    text:  { x: pad, startY: bgH + pad, maxW: width - pad * 2 },
    fonts: { headline: 72, body: 32, cta: 28 },
  }
}

function buildSplitSvg(opts: {
  layout:      SplitLayout
  width:       number
  height:      number
  headline:    string
  body?:       string
  cta?:        string
  primaryHex:  string
  secondaryHex:string
  logoBase64:  string | null
  logoDrawW:   number
  logoDrawH:   number
  fontBase64:  string | null
}): string {
  const { layout, width, height, headline, body, cta,
          primaryHex, secondaryHex, logoBase64, logoDrawW, logoDrawH, fontBase64 } = opts
  const { block, logo, text, fonts } = layout

  const ff         = fontFamily(fontBase64)
  const textColor  = contrastColor(primaryHex)
  const lineH      = (fs: number) => Math.round(fs * 1.32)
  const maxCols    = (fs: number) => Math.floor(text.maxW / (fs * 0.58))

  let inner = fontDefs(fontBase64)

  // Color block
  inner += `<rect x="${block.left}" y="${block.top}" width="${block.width}" height="${block.height}" fill="#${normalizeHex(primaryHex)}"/>`

  // Logo
  if (logoBase64 && logoDrawW > 0) {
    const lx = logo.inColorBlock
      ? block.left + block.width - logoDrawW - 20
      : width - logoDrawW - 20
    if (!logo.inColorBlock) {
      inner += `<rect x="${lx - 10}" y="${logo.y - 6}" width="${logoDrawW + 20}" height="${logoDrawH + 12}" rx="10" fill="rgba(255,255,255,0.85)"/>`
    }
    inner += `<image href="data:image/png;base64,${logoBase64}" x="${lx}" y="${logo.y}" width="${logoDrawW}" height="${logoDrawH}" preserveAspectRatio="xMidYMid meet"/>`
  }

  // Text
  const hlLines = wrapText(headline, maxCols(fonts.headline))
  const bdLines = body ? wrapText(body, maxCols(fonts.body)) : []
  let cy = text.startY + fonts.headline

  for (const line of hlLines) {
    inner += `<text x="${text.x}" y="${cy}" font-family="${ff}" font-weight="bold" font-size="${fonts.headline}" fill="${escapeXml(textColor)}">${escapeXml(line)}</text>`
    cy += lineH(fonts.headline)
  }
  cy += 16

  for (const line of bdLines) {
    inner += `<text x="${text.x}" y="${cy}" font-family="${ff}" font-size="${fonts.body}" fill="${escapeXml(textColor)}" opacity="0.88">${escapeXml(line)}</text>`
    cy += lineH(fonts.body)
  }
  if (bdLines.length) cy += 20

  if (cta) {
    const ctaH = fonts.cta + 28
    const ctaW = Math.min(cta.length * fonts.cta * 0.62 + 56, text.maxW)
    inner += `<rect x="${text.x}" y="${cy}" width="${ctaW}" height="${ctaH}" rx="8" fill="#${normalizeHex(secondaryHex)}"/>`
    inner += `<text x="${text.x + ctaW / 2}" y="${cy + ctaH / 2 + fonts.cta * 0.35}" font-family="${ff}" font-weight="bold" font-size="${fonts.cta}" fill="${escapeXml(contrastColor(secondaryHex))}" text-anchor="middle">${escapeXml(cta)}</text>`
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${inner}</svg>`
}

// ─────────────────────────────────────────────────────────────────────────────
// MODO "overlay" — 9x16 (Stories/Reels)
// ─────────────────────────────────────────────────────────────────────────────

function buildOverlaySvg(opts: {
  width:        number
  height:       number
  headline:     string
  body?:        string
  cta?:         string
  primaryHex:   string
  secondaryHex: string
  logoBase64:   string | null
  logoDrawW:    number
  logoDrawH:    number
  fontBase64:   string | null
}): string {
  const { width, height, headline, body, cta,
          primaryHex, secondaryHex, logoBase64, logoDrawW, logoDrawH, fontBase64 } = opts

  const ff     = fontFamily(fontBase64)
  const pad    = 60
  const maxW   = width - pad * 2

  // Gradiente: cubre el 45% inferior (desde y=1056)
  const gradTop = Math.round(height * 0.55)   // 1056
  const gradH   = height - gradTop             // 864

  // Colores del gradiente — negro puro + tinte del primario
  const pHex = normalizeHex(primaryHex)

  // Posiciones de texto (bottom-up desde y=height-pad)
  const fonts = { headline: 80, body: 34, cta: 30 }
  const lineH = (fs: number) => Math.round(fs * 1.28)
  const maxCols = (fs: number) => Math.floor(maxW / (fs * 0.56))

  const hlLines = wrapText(headline, maxCols(fonts.headline))
  const bdLines = body ? wrapText(body, maxCols(fonts.body)) : []

  // Calcular altura total del bloque de texto (bottom-up)
  const ctaH      = cta ? fonts.cta + 32 : 0
  const ctaGap    = cta ? 24 : 0
  const bodyH     = bdLines.length ? bdLines.length * lineH(fonts.body) + 24 : 0
  const headlineH = hlLines.length * lineH(fonts.headline)
  const totalTextH = headlineH + bodyH + ctaH + ctaGap

  // Texto empieza en: bottom - bottomPad - totalTextH
  const bottomPad   = 80
  const textStartY  = Math.max(gradTop + pad, height - bottomPad - totalTextH)
  let cy            = textStartY + fonts.headline

  let inner = fontDefs(fontBase64)

  // ── Gradiente ────────────────────────────────────────────────────────────
  inner += `
<defs>
  <linearGradient id="ovgrad" x1="0" y1="${gradTop}" x2="0" y2="${height}" gradientUnits="userSpaceOnUse">
    <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
    <stop offset="50%"  stop-color="#${pHex}" stop-opacity="0.45"/>
    <stop offset="100%" stop-color="#${pHex}" stop-opacity="0.88"/>
  </linearGradient>
</defs>
<rect x="0" y="${gradTop}" width="${width}" height="${gradH}" fill="url(#ovgrad)"/>`.trim()

  // ── Logo (esquina superior derecha) ───────────────────────────────────────
  if (logoBase64 && logoDrawW > 0) {
    const lx = width - logoDrawW - 40
    const ly = 48
    const logoH = logoDrawH
    inner += `<rect x="${lx - 12}" y="${ly - 8}" width="${logoDrawW + 24}" height="${logoH + 16}" rx="12" fill="rgba(255,255,255,0.88)"/>`
    inner += `<image href="data:image/png;base64,${logoBase64}" x="${lx}" y="${ly}" width="${logoDrawW}" height="${logoH}" preserveAspectRatio="xMidYMid meet"/>`
  }

  // ── Headline ──────────────────────────────────────────────────────────────
  for (const line of hlLines) {
    inner += `<text x="${pad}" y="${cy}" font-family="${ff}" font-weight="bold" font-size="${fonts.headline}" fill="#FFFFFF" filter="url(#ts)">${escapeXml(line)}</text>`
    cy += lineH(fonts.headline)
  }
  cy += 20

  // ── Body ──────────────────────────────────────────────────────────────────
  for (const line of bdLines) {
    inner += `<text x="${pad}" y="${cy}" font-family="${ff}" font-size="${fonts.body}" fill="#FFFFFF" opacity="0.90">${escapeXml(line)}</text>`
    cy += lineH(fonts.body)
  }
  if (bdLines.length) cy += 24

  // ── CTA ───────────────────────────────────────────────────────────────────
  if (cta) {
    const ctaRectH = fonts.cta + 32
    const ctaW     = Math.min(cta.length * fonts.cta * 0.62 + 56, maxW * 0.7)
    inner += `<rect x="${pad}" y="${cy}" width="${ctaW}" height="${ctaRectH}" rx="10" fill="#${normalizeHex(secondaryHex)}"/>`
    inner += `<text x="${pad + ctaW / 2}" y="${cy + ctaRectH / 2 + fonts.cta * 0.35}" font-family="${ff}" font-weight="bold" font-size="${fonts.cta}" fill="${escapeXml(contrastColor(secondaryHex))}" text-anchor="middle">${escapeXml(cta)}</text>`
  }

  // Sombra suave en el headline (mejora legibilidad sobre foto)
  const shadowFilter = `<defs><filter id="ts" x="-5%" y="-5%" width="110%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="black" flood-opacity="0.6"/></filter></defs>`

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${shadowFilter}${inner}</svg>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Función principal
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
  const isOverlay = format === '9x16'

  // ── 1. Descargar fondo ────────────────────────────────────────────────────
  const bgResp = await fetch(backgroundImageUrl)
  if (!bgResp.ok) throw new Error(`Error descargando fondo: ${bgResp.status} ${bgResp.statusText}`)
  const bgBuffer = Buffer.from(await bgResp.arrayBuffer())

  // ── 2. Logo ───────────────────────────────────────────────────────────────
  let logoBase64: string | null = null
  let logoDrawW = 0
  const logoMaxH = isOverlay ? 90 : (format === '1.91x1' ? 80 : 100)
  let logoDrawH = logoMaxH

  if (logoBuffer && logoBuffer.length > 0) {
    try {
      const meta   = await sharp(logoBuffer).metadata()
      const aspect = meta.width && meta.height ? meta.width / meta.height : 1
      logoDrawH    = logoMaxH
      logoDrawW    = Math.round(logoDrawH * aspect)
      const logoPng = await sharp(logoBuffer)
        .resize({ height: logoDrawH, withoutEnlargement: true })
        .png()
        .toBuffer()
      logoBase64 = logoPng.toString('base64')
      console.log(`[compose] Logo procesado: ${logoDrawW}×${logoDrawH}px`)
    } catch (e) {
      console.warn('[compose] Logo processing failed, skipping:', e instanceof Error ? e.message : e)
    }
  }

  // ── 3. Fuente custom ──────────────────────────────────────────────────────
  const fontBase64 = fontBuffer && fontBuffer.length > 0 ? fontBuffer.toString('base64') : null

  // ── 4. SVG overlay ────────────────────────────────────────────────────────
  let svgStr: string

  if (isOverlay) {
    svgStr = buildOverlaySvg({
      width, height, headline, body, cta,
      primaryHex, secondaryHex,
      logoBase64, logoDrawW, logoDrawH,
      fontBase64,
    })
  } else {
    const layout = buildSplitLayout(width, height, format)
    svgStr = buildSplitSvg({
      layout, width, height, headline, body, cta,
      primaryHex, secondaryHex,
      logoBase64, logoDrawW, logoDrawH,
      fontBase64,
    })
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[compose] SVG ${format} (${svgStr.length} chars):`, svgStr.slice(0, 400))
  } else {
    console.log(`[compose] SVG ${format}: ${svgStr.length} chars, logo=${!!logoBase64}, font=${!!fontBase64}`)
  }

  // ── 5. Composición final ──────────────────────────────────────────────────
  if (isOverlay) {
    // Foto ocupa canvas completo, SVG encima
    const bgFull = await sharp(bgBuffer)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 95 })
      .toBuffer()

    return sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([
        { input: bgFull,               top: 0, left: 0 },
        { input: Buffer.from(svgStr),  top: 0, left: 0 },
      ])
      .png({ compressionLevel: 8 })
      .toBuffer()
  } else {
    const layout    = buildSplitLayout(width, height, format)
    const bgResized = await sharp(bgBuffer)
      .resize(layout.bg.width, layout.bg.height, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 95 })
      .toBuffer()

    return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([
        { input: bgResized,            top: layout.bg.top,  left: layout.bg.left },
        { input: Buffer.from(svgStr),  top: 0, left: 0 },
      ])
      .png({ compressionLevel: 8 })
      .toBuffer()
  }
}
