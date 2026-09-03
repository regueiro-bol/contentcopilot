/**
 * lib/brand/merge-brand-context.ts
 *
 * Fusión de extracciones de brand context multi-documento.
 * Módulo puro (sin dependencias de Next/SDK) usado por
 * /api/brand-assets/process-brandbook.
 */

export interface ColorEntry {
  name: string
  hex: string
  role?: string  // e.g. "primary", "secondary", "accent", "neutral"
}

export interface FontEntry {
  name: string
  role?: string  // e.g. "headings", "body", "accent"
  weights?: string[]
}

export interface ExtractedBrandContext {
  colors: ColorEntry[]
  typography: FontEntry[]
  tone_of_voice: string
  style_keywords: string[]
  restrictions: string
  raw_summary: string
}

/** Resultado de procesar un documento individual. */
export interface DocExtraction {
  drive_file_id: string
  file_name: string
  model: string
  extracted: ExtractedBrandContext
}

export const SIN_RESTRICCIONES = 'No se especifican restricciones explícitas'

/**
 * Fusiona las extracciones de N brand books en un único contexto.
 * tone_of_voice y raw_summary se devuelven concatenados como fallback —
 * si hay más de un documento, el handler los sustituye por la síntesis de Claude.
 */
export function mergeExtractions(docs: DocExtraction[]): ExtractedBrandContext {
  // Colores — unión deduplicada por hex; conservar el rol más específico
  const colorMap = new Map<string, ColorEntry>()
  for (const doc of docs) {
    for (const color of doc.extracted.colors) {
      if (!color?.hex) continue
      const key = color.hex.trim().toLowerCase()
      const existing = colorMap.get(key)
      if (!existing) {
        colorMap.set(key, { ...color })
      } else if (!existing.role && color.role) {
        existing.role = color.role
      }
    }
  }

  // Tipografías — unión deduplicada por nombre; fusionar weights y rellenar rol
  const fontMap = new Map<string, FontEntry>()
  for (const doc of docs) {
    for (const font of doc.extracted.typography) {
      if (!font?.name?.trim()) continue
      const key = font.name.trim().toLowerCase()
      const existing = fontMap.get(key)
      if (!existing) {
        fontMap.set(key, { ...font, weights: font.weights ? [...font.weights] : undefined })
      } else {
        if (!existing.role && font.role) existing.role = font.role
        if (font.weights?.length) {
          const seen = new Set((existing.weights ?? []).map((w) => w.toLowerCase()))
          existing.weights = [
            ...(existing.weights ?? []),
            ...font.weights.filter((w) => !seen.has(w.toLowerCase())),
          ]
        }
      }
    }
  }

  // Keywords — unión deduplicada (case-insensitive, conserva la primera grafía)
  const kwSeen = new Set<string>()
  const keywords: string[] = []
  for (const doc of docs) {
    for (const kw of doc.extracted.style_keywords) {
      const key = kw.trim().toLowerCase()
      if (!key || kwSeen.has(key)) continue
      kwSeen.add(key)
      keywords.push(kw.trim())
    }
  }

  // Restricciones — concatenar deduplicando idénticas; ignorar el boilerplate
  // "sin restricciones" salvo que sea lo único que haya
  const restSeen = new Set<string>()
  const restricciones: string[] = []
  for (const doc of docs) {
    const r = doc.extracted.restrictions?.trim()
    if (!r || restSeen.has(r.toLowerCase()) || r.toLowerCase().startsWith(SIN_RESTRICCIONES.toLowerCase())) continue
    restSeen.add(r.toLowerCase())
    restricciones.push(docs.length > 1 ? `[${doc.file_name}] ${r}` : r)
  }

  // Tono y resumen — fallback por concatenación (se sustituye por síntesis si N>1)
  const tonos     = docs.map((d) => d.extracted.tone_of_voice?.trim()).filter(Boolean)
  const resumenes = docs.map((d) => d.extracted.raw_summary?.trim()).filter(Boolean)

  return {
    colors        : Array.from(colorMap.values()),
    typography    : Array.from(fontMap.values()),
    style_keywords: keywords,
    restrictions  : restricciones.join('\n\n') || SIN_RESTRICCIONES,
    tone_of_voice : tonos.join('\n\n'),
    raw_summary   : resumenes.join('\n\n'),
  }
}
