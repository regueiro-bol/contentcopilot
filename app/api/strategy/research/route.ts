import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getKeywordIdeas,
  getSearchVolume,
  DataForSEOError,
  type KeywordIdeaItem,
  type SearchVolumeItem,
} from '@/lib/dataforseo'

export const maxDuration = 120

/**
 * POST /api/strategy/research
 *
 * Pipeline completo de investigación de keywords:
 * 1. Crea la sesión en Supabase (status: researching)
 * 2. Llama a DataForSEO keyword_ideas
 * 3. Llama a DataForSEO search_volume para las seeds originales
 * 4. Merge + deduplicación de resultados
 * 5. Inserta keywords en la tabla `keywords`
 * 6. Marca la sesión como completada
 *
 * Body: {
 *   nombre        : string
 *   cliente_id    : string
 *   tipo_proyecto : string
 *   objetivos     : string
 *   competidores  : string[]
 *   seeds         : string[]
 * }
 *
 * Response: { session_id: string, total_keywords: number, status: string }
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()

  let sessionId: string | null = null

  try {
    const body = await request.json()
    const {
      nombre        = '',
      cliente_id    = '',
      tipo_proyecto = '',
      objetivos     = '',
      competidores  = [] as string[],
      seeds         = [] as string[],
    } = body

    // ── Validaciones básicas ───────────────────────────────────────────────
    if (!cliente_id) {
      return NextResponse.json({ error: 'cliente_id es obligatorio' }, { status: 400 })
    }
    if (!nombre.trim()) {
      return NextResponse.json({ error: 'El nombre del proyecto es obligatorio' }, { status: 400 })
    }
    if (seeds.length === 0) {
      return NextResponse.json({ error: 'Se necesita al menos una keyword semilla' }, { status: 400 })
    }

    const seedsLimpios: string[] = seeds
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0)
      .slice(0, 200) // límite DataForSEO

    // ── 1. Crear sesión ────────────────────────────────────────────────────
    console.log(`[Research] Creando sesión para cliente ${cliente_id} con ${seedsLimpios.length} seeds`)

    const { data: session, error: sessionError } = await supabase
      .from('keyword_research_sessions')
      .insert({
        client_id   : cliente_id,
        nombre      : nombre.trim(),
        status      : 'researching',
        seed_topics : seedsLimpios,
        config      : {
          tipo_proyecto,
          objetivos,
          competidores,
          locationCode: 2724,
          languageCode: 'es',
          limit       : 100,
        },
      })
      .select('id')
      .single()

    if (sessionError || !session) {
      console.error('[Research] Error creando sesión — code:', sessionError?.code)
      console.error('[Research] Error creando sesión — message:', sessionError?.message)
      console.error('[Research] Error creando sesión — details:', sessionError?.details)
      console.error('[Research] Error creando sesión — hint:', sessionError?.hint)
      console.error('[Research] Error creando sesión — full:', JSON.stringify(sessionError, null, 2))
      return NextResponse.json(
        {
          ok     : false,
          error  : sessionError?.message ?? 'Error desconocido',
          details: sessionError,
        },
        { status: 500 },
      )
    }

    sessionId = session.id
    console.log(`[Research] Sesión creada: ${sessionId}`)

    // ── 2. Keyword Ideas ───────────────────────────────────────────────────
    console.log('[Research] Llamando a keyword_ideas...')
    let ideas: KeywordIdeaItem[] = []
    try {
      ideas = await getKeywordIdeas(seedsLimpios)
      console.log(`[Research] keyword_ideas OK — ${ideas.length} resultados`)
    } catch (e) {
      console.error('[Research] Error en keyword_ideas:', e instanceof DataForSEOError ? e.message : e)
      // Continuamos aunque falle — intentamos con search_volume
    }

    // ── 3. Search Volume para seeds originales ─────────────────────────────
    console.log('[Research] Llamando a search_volume...')
    let volumes: SearchVolumeItem[] = []
    try {
      volumes = await getSearchVolume(seedsLimpios)
      console.log(`[Research] search_volume OK — ${volumes.length} resultados`)
    } catch (e) {
      console.error('[Research] Error en search_volume:', e instanceof DataForSEOError ? e.message : e)
      // Continuamos aunque falle
    }

    if (ideas.length === 0 && volumes.length === 0) {
      // Ambas llamadas fallaron — marcar como error
      await supabase
        .from('keyword_research_sessions')
        .update({ status: 'error' })
        .eq('id', sessionId)
      return NextResponse.json(
        { error: 'No se obtuvieron resultados de DataForSEO. Verifica las credenciales y los seeds.' },
        { status: 502 },
      )
    }

    // ── 4. Merge y deduplicación ───────────────────────────────────────────
    // Prioridad: keyword_ideas (tiene más métricas) sobre search_volume

    // Sanitización: competition es NUMERIC(5,4) en Supabase → debe ser number | null.
    // DataForSEO a veces devuelve el string "LOW"/"MEDIUM"/"HIGH" en competition
    // en lugar de en competition_level.
    const VALID_COMP_LEVELS = ['LOW', 'MEDIUM', 'HIGH']

    function safeCompetition(val: unknown): number | null {
      if (val == null) return null
      if (typeof val === 'number' && isFinite(val)) return val
      // Si es string numérico como "0.45", parsearlo
      if (typeof val === 'string') {
        const num = parseFloat(val)
        if (isFinite(num)) return num
      }
      // String como "MEDIUM" → no es numérico, devolver null
      return null
    }

    function safeCompetitionLevel(val: unknown): string | null {
      if (typeof val === 'string' && VALID_COMP_LEVELS.includes(val.toUpperCase())) {
        return val.toUpperCase()
      }
      return null
    }

    function safeNumber(val: unknown): number | null {
      if (val == null) return null
      const num = typeof val === 'number' ? val : parseFloat(String(val))
      return isFinite(num) ? num : null
    }

    const keywordsMap = new Map<string, Record<string, unknown>>()

    for (const idea of ideas) {
      const key = idea.keyword.toLowerCase().trim()
      keywordsMap.set(key, {
        session_id        : sessionId,
        keyword           : idea.keyword,
        volume            : safeNumber(idea.search_volume),
        keyword_difficulty: safeNumber(idea.keyword_difficulty),
        cpc               : safeNumber(idea.cpc),
        competition       : safeCompetition(idea.competition),
        competition_level : safeCompetitionLevel(idea.competition_level),
        search_intent     : idea.search_intent ?? null,
        monthly_searches  : idea.monthly_searches,
        incluida          : true,
      })
    }

    // Añadir seeds no encontrados en keyword_ideas
    for (const vol of volumes) {
      const key = vol.keyword.toLowerCase().trim()
      if (!keywordsMap.has(key)) {
        keywordsMap.set(key, {
          session_id        : sessionId,
          keyword           : vol.keyword,
          volume            : safeNumber(vol.search_volume),
          keyword_difficulty: null,
          cpc               : safeNumber(vol.cpc),
          competition       : safeCompetition(vol.competition),
          competition_level : safeCompetitionLevel(vol.competition_level),
          search_intent     : null,
          monthly_searches  : vol.monthly_searches,
          incluida          : true,
        })
      }
    }

    const keywordsArray = Array.from(keywordsMap.values())
    console.log(`[Research] Total keywords a insertar: ${keywordsArray.length}`)

    // ── 5. Insertar keywords por lotes ─────────────────────────────────────
    const BATCH_SIZE = 100
    let insertadas = 0

    for (let i = 0; i < keywordsArray.length; i += BATCH_SIZE) {
      const batch = keywordsArray.slice(i, i + BATCH_SIZE)
      const { error: insertError } = await supabase
        .from('keywords')
        .insert(batch)

      if (insertError) {
        console.error(`[Research] Error insertando batch ${i / BATCH_SIZE + 1}:`, insertError)
        // Continuamos con el siguiente batch
      } else {
        insertadas += batch.length
      }
    }

    console.log(`[Research] Keywords insertadas: ${insertadas}`)

    // ── 6. Marcar sesión como completada ───────────────────────────────────
    const { error: updateError } = await supabase
      .from('keyword_research_sessions')
      .update({
        status : 'completed',
        resumen: {
          total_keywords : insertadas,
          seeds_count    : seedsLimpios.length,
          ideas_count    : ideas.length,
          volumes_count  : volumes.length,
        },
      })
      .eq('id', sessionId)

    if (updateError) {
      console.error('[Research] Error actualizando sesión:', updateError)
    }

    console.log(`[Research] Sesión ${sessionId} completada con ${insertadas} keywords`)

    return NextResponse.json({
      session_id    : sessionId,
      total_keywords: insertadas,
      status        : 'completed',
    })

  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('[Research] Error inesperado:', err.message)

    // Marcar sesión como error si se creó
    if (sessionId) {
      await supabase
        .from('keyword_research_sessions')
        .update({ status: 'error' })
        .eq('id', sessionId)
    }

    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
