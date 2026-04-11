/**
 * GET /api/social/strategy-context?clientId=xxx
 *
 * Devuelve el contexto de estrategia validada para usarlo en la ejecución:
 * pilares editoriales, formatos por plataforma, voz de marca, estado de validación.
 *
 * Usado por CalendarEntryDrawer y social-page-client para mostrar contexto estratégico.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonbToText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && 'content' in val) {
    return String((val as { content: string }).content)
  }
  return ''
}

/**
 * Extrae nombres de pilares desde el texto de editorial_pillars.
 * Detecta líneas como "PILAR 1 — Nombre", "Pilar: Nombre", "**Nombre**", etc.
 */
function extractPillarNames(text: string): string[] {
  if (!text) return []

  const names: string[] = []

  // Patrón 1: PILAR N — Nombre o PILAR N: Nombre
  const pilarPattern = /PILAR\s+\d+\s*[—\-:]\s*(.+?)(?:\n|$)/gi
  let match: RegExpExecArray | null
  while ((match = pilarPattern.exec(text)) !== null) {
    const name = match[1].trim().replace(/[*_]/g, '')
    if (name && name.length < 60) names.push(name)
  }

  // Patrón 2: Líneas que empiezan con "Nombre:" seguido de texto corto
  if (names.length === 0) {
    const nombrePattern = /^Nombre\s*:\s*(.+?)$/gim
    while ((match = nombrePattern.exec(text)) !== null) {
      const name = match[1].trim().replace(/[*_]/g, '')
      if (name && name.length < 60) names.push(name)
    }
  }

  // Patrón 3: Líneas en mayúsculas que parecen nombres de pilares (3-7 palabras en mayúsculas)
  if (names.length === 0) {
    const lines = text.split('\n')
    for (const line of lines) {
      const clean = line.trim().replace(/[*_\-]/g, '').trim()
      if (clean.length > 3 && clean.length < 60 && clean === clean.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(clean)) {
        names.push(clean)
        if (names.length >= 6) break
      }
    }
  }

  return Array.from(new Set(names)).slice(0, 6)
}

/**
 * Extrae formatos por plataforma desde el texto de formats_by_platform.
 * Retorna Record<platform, string[]>.
 */
function extractFormatsByPlatform(text: string): Record<string, string[]> {
  if (!text) return {}

  const result: Record<string, string[]> = {}

  const platformMap: Record<string, string> = {
    'linkedin'  : 'linkedin',
    'instagram' : 'instagram',
    'twitter'   : 'twitter_x',
    'twitter/x' : 'twitter_x',
    'tiktok'    : 'tiktok',
    'facebook'  : 'facebook',
    'youtube'   : 'youtube',
  }

  const lines = text.split('\n')
  let currentPlatform: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Detectar encabezado de plataforma
    const lowerLine = trimmed.toLowerCase().replace(/[*_:]/g, '')
    const foundPlatform = Object.entries(platformMap).find(([key]) => lowerLine.includes(key))
    if (foundPlatform) {
      currentPlatform = foundPlatform[1]
      if (!result[currentPlatform]) result[currentPlatform] = []
      continue
    }

    // Detectar líneas de formato (empiezan con - o •)
    if (currentPlatform && (trimmed.startsWith('-') || trimmed.startsWith('•'))) {
      const formatText = trimmed.replace(/^[-•]\s*/, '').split(/[:(]/)[0].trim()
      if (formatText && formatText.length < 50 && !result[currentPlatform].includes(formatText)) {
        result[currentPlatform].push(formatText)
      }
    }
  }

  return result
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()

  const [{ data: synthesis }, { data: architecture }, { data: brandVoice }] = await Promise.all([
    supabase.from('social_audit_synthesis')
      .select('client_validated, client_validated_at, revision_notes')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase.from('social_content_architecture')
      .select('editorial_pillars, formats_by_platform')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase.from('social_brand_voice')
      .select('voice_manual, register_by_platform, editorial_red_lines')
      .eq('client_id', clientId)
      .maybeSingle(),
  ])

  const editorialPillarsText  = jsonbToText(architecture?.editorial_pillars)
  const formatsByPlatformText = jsonbToText(architecture?.formats_by_platform)
  const registerByPlatformText = jsonbToText(brandVoice?.register_by_platform)

  return NextResponse.json({
    isValidated      : Boolean(synthesis?.client_validated),
    validatedAt      : synthesis?.client_validated_at ?? null,
    editorialPillars : extractPillarNames(editorialPillarsText),
    formatsByPlatform: extractFormatsByPlatform(formatsByPlatformText),
    voiceManual      : brandVoice?.voice_manual ?? null,
    registerByPlatform: registerByPlatformText || null,
    editorialRedLines: brandVoice?.editorial_red_lines ?? null,
    hasStrategy      : Boolean(architecture?.editorial_pillars),
  })
}
