import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste, PRECIOS } from '@/lib/costes'
import {
  getKeywordIdeas,
  getSearchVolume,
  getCompetitorKeywords,
  extractDomain,
  DataForSEOError,
  type KeywordIdeaItem,
  type SearchVolumeItem,
  type CompetitorKeyword,
} from '@/lib/dataforseo'
import {
  getGSCKeywords,
  refreshAccessToken,
  type GSCKeyword,
} from '@/lib/google-api'

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
  // supabase declared outside try so the catch block can mark sessions as error
  const supabase = createAdminClient()
  let sessionId: string | null = null

  try {
    // auth() inside try-catch: if Clerk throws (JWKS fetch failure, expired JWT, etc.)
    // the error is caught and returned as JSON instead of Next.js plain-text "An error occurred"
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

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

    console.log('[Research] Seeds recibidos:', JSON.stringify(seeds))
    console.log('[Research] Cliente:', cliente_id)
    console.log('[Research] Seeds limpios:', JSON.stringify(seedsLimpios))

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

    // ── Helper: reintento automático ante errores 500 ─────────────────────
    async function callWithRetry<T>(
      fn      : () => Promise<T>,
      retries = 2,
      delay   = 2000,
    ): Promise<T> {
      try {
        return await fn()
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (retries > 0 && msg.includes('500')) {
          console.warn(`[Research] DataForSEO 500 — reintentando en ${delay}ms (quedan ${retries})`)
          await new Promise((r) => setTimeout(r, delay))
          return callWithRetry(fn, retries - 1, delay)
        }
        throw error
      }
    }

    // ── 2. Keyword Ideas (con reintentos) ──────────────────────────────────
    console.log('[Research] Llamando a keyword_ideas...')
    let ideas: KeywordIdeaItem[] = []
    try {
      ideas = await callWithRetry(() => getKeywordIdeas(seedsLimpios))
      console.log(`[Research] keyword_ideas OK — ${ideas.length} resultados`)
      guardarRegistroCoste({
        cliente_id    : cliente_id,
        proyecto_id   : sessionId,
        tipo_operacion: 'dataforseo_keywords',
        agente        : 'strategy-research',
        unidades      : 1,
        coste_usd     : PRECIOS.dataforseo_ideas,
        metadatos     : { session_id: sessionId, seeds_count: seedsLimpios.length, results_count: ideas.length },
      }).catch(console.error)
    } catch (e) {
      console.error('[Research] keyword_ideas falló tras reintentos — usando solo search_volume:', e instanceof DataForSEOError ? e.message : e)
      // FIX 2: fallback a search_volume — ideas queda vacío, continuamos
    }

    // ── 3. Search Volume para seeds originales ─────────────────────────────
    console.log('[Research] Llamando a search_volume...')
    let volumes: SearchVolumeItem[] = []
    try {
      volumes = await getSearchVolume(seedsLimpios)
      console.log(`[Research] search_volume OK — ${volumes.length} resultados`)
      guardarRegistroCoste({
        cliente_id    : cliente_id,
        proyecto_id   : sessionId,
        tipo_operacion: 'dataforseo_volume',
        agente        : 'strategy-research',
        unidades      : 1,
        coste_usd     : PRECIOS.dataforseo_volume,
        metadatos     : { session_id: sessionId, seeds_count: seedsLimpios.length, results_count: volumes.length },
      }).catch(console.error)
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
        { error: 'DataForSEO no está disponible en este momento. Inténtalo de nuevo en unos minutos.' },
        { status: 502 },
      )
    }

    // ── 3b. GSC keywords (si el cliente tiene propiedad GSC vinculada) ────
    const gscMap = new Map<string, GSCKeyword>()
    try {
      // Buscar conexión GSC activa para este cliente
      const { data: gscConn } = await supabase
        .from('client_google_connections')
        .select('gsc_property_url, google_account_id, google_accounts(access_token, refresh_token, token_expiry)')
        .eq('client_id', cliente_id)
        .eq('status', 'active')
        .not('gsc_property_url', 'is', null)
        .maybeSingle()

      if (gscConn?.gsc_property_url && gscConn.google_accounts) {
        const ga = gscConn.google_accounts as unknown as {
          access_token: string | null; refresh_token: string; token_expiry: string | null
        }
        let accessToken = ga.access_token

        // Refrescar token si expirado
        const isExpired = !accessToken || (ga.token_expiry && new Date(ga.token_expiry) <= new Date())
        if (isExpired && ga.refresh_token) {
          console.log('[Research] Refrescando token GSC...')
          const refreshed = await refreshAccessToken(ga.refresh_token)
          accessToken = refreshed.access_token
          // Actualizar token en BD
          await supabase
            .from('google_accounts')
            .update({
              access_token: refreshed.access_token,
              token_expiry: refreshed.expiry_date ? new Date(refreshed.expiry_date).toISOString() : null,
              updated_at  : new Date().toISOString(),
            })
            .eq('id', gscConn.google_account_id)
        }

        if (accessToken) {
          console.log(`[Research] Consultando GSC: ${gscConn.gsc_property_url}`)
          const gscKeywords = await getGSCKeywords(accessToken, gscConn.gsc_property_url)
          for (const gk of gscKeywords) {
            gscMap.set(gk.query.toLowerCase().trim(), gk)
          }
          console.log(`[Research] GSC: ${gscMap.size} keywords obtenidas`)
        }
      } else {
        console.log('[Research] Sin conexión GSC activa para este cliente')
      }
    } catch (gscErr) {
      console.warn('[Research] Error obteniendo datos GSC (continuamos sin ellos):', gscErr instanceof Error ? gscErr.message : gscErr)
      // No es crítico — continuamos sin datos GSC
    }

    // ── 3c. Keywords de competidores (DataForSEO Labs) ────────────────────
    const competitorMap = new Map<string, { kw: CompetitorKeyword; source: string }>()
    const competidoresUrls = (Array.isArray(competidores) ? competidores : []) as string[]

    if (competidoresUrls.length > 0) {
      console.log(`[Research] Analizando ${competidoresUrls.length} competidores...`)
      for (const url of competidoresUrls.slice(0, 5)) {
        const domain = extractDomain(url)
        if (!domain) continue
        try {
          const compKws = await getCompetitorKeywords(domain)
          console.log(`[Research] Competidor ${domain}: ${compKws.length} keywords`)
          // Registrar coste DataForSEO competitor keywords (fire-and-forget)
          guardarRegistroCoste({
            cliente_id    : cliente_id,
            proyecto_id   : sessionId,
            tipo_operacion: 'competitor_keywords',
            agente        : 'strategy-research',
            unidades      : 1,
            coste_usd     : PRECIOS.dataforseo_competitor,
            metadatos     : { session_id: sessionId, domain, results_count: compKws.length },
          }).catch(console.error)
          for (const ck of compKws) {
            const key = ck.keyword.toLowerCase().trim()
            if (!competitorMap.has(key)) {
              competitorMap.set(key, { kw: ck, source: domain })
            }
          }
        } catch (compErr) {
          console.warn(`[Research] Error en competidor ${domain} (continuamos):`, compErr instanceof Error ? compErr.message : compErr)
        }
      }
      console.log(`[Research] Total keywords de competidores (deduplicadas): ${competitorMap.size}`)
    }

    // ── 4. Merge y deduplicación ───────────────────────────────────────────
    // Prioridad: keyword_ideas (tiene más métricas) sobre search_volume

    // Sanitización: competition es NUMERIC(5,4) en Supabase → debe ser number | null.
    // DataForSEO a veces devuelve el string "LOW"/"MEDIUM"/"HIGH" en competition
    // en lugar de en competition_level.
    const VALID_COMP_LEVELS = ['LOW', 'MEDIUM', 'HIGH']

    const safeCompetition = (val: unknown): number | null => {
      if (val == null) return null
      if (typeof val === 'number' && isFinite(val)) return val
      if (typeof val === 'string') {
        const num = parseFloat(val)
        if (isFinite(num)) return num
      }
      return null
    }

    const safeCompetitionLevel = (val: unknown): string | null => {
      if (typeof val === 'string' && VALID_COMP_LEVELS.includes(val.toUpperCase())) {
        return val.toUpperCase()
      }
      return null
    }

    const safeNumber = (val: unknown): number | null => {
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

    // ── 4b. Enriquecer con datos GSC ────────────────────────────────────────
    const classifyOpportunity = (pos: number | null): 'existing' | 'quick_win' | 'new' => {
      if (pos == null) return 'new'
      if (pos <= 3) return 'existing'
      if (pos <= 20) return 'quick_win'
      return 'existing' // pos > 20 ya rankea pero bajo
    }

    for (const [key, kwData] of Array.from(keywordsMap.entries())) {
      const gsc = gscMap.get(key)
      if (gsc) {
        kwData.gsc_clicks      = gsc.clicks
        kwData.gsc_impressions = gsc.impressions
        kwData.gsc_ctr         = Math.round(gsc.ctr * 10000) / 10000 // 4 decimales
        kwData.gsc_position    = Math.round(gsc.position * 100) / 100 // 2 decimales
        kwData.gsc_opportunity = classifyOpportunity(gsc.position)
      } else if (gscMap.size > 0) {
        // Solo marcar como 'new' si tenemos datos GSC (si no hay GSC, dejar null)
        kwData.gsc_opportunity = 'new'
      }
    }

    // ── 4c. Enriquecer con datos de competidores ─────────────────────────
    if (competitorMap.size > 0) {
      let enriched = 0
      let added    = 0

      for (const [key, { kw: ck, source }] of Array.from(competitorMap.entries())) {
        if (keywordsMap.has(key)) {
          // Keyword ya existe → solo marcar el competidor source
          const existing = keywordsMap.get(key)!
          if (!existing.competitor_source) {
            existing.competitor_source = source
            enriched++
          }
        } else {
          // Keyword nueva del competidor → añadir al dataset
          keywordsMap.set(key, {
            session_id        : sessionId,
            keyword           : ck.keyword,
            volume            : safeNumber(ck.volume),
            keyword_difficulty: safeNumber(ck.difficulty),
            cpc               : null,
            competition       : null,
            competition_level : null,
            search_intent     : ck.intent ?? null,
            monthly_searches  : null,
            incluida          : true,
            competitor_source : source,
          })
          added++
        }
      }

      console.log(`[Research] Competidores: ${enriched} keywords existentes enriquecidas, ${added} keywords nuevas añadidas`)
    }

    const keywordsArray = Array.from(keywordsMap.values())
    const withGsc         = keywordsArray.filter((k) => k.gsc_opportunity != null).length
    const withCompetitor  = keywordsArray.filter((k) => k.competitor_source != null).length
    console.log(`[Research] Total keywords a insertar: ${keywordsArray.length} | con GSC: ${withGsc} | de competidores: ${withCompetitor}`)

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
