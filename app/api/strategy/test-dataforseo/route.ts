import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import {
  getKeywordIdeas,
  getSearchVolume,
  DataForSEOError,
  dificultadLabel,
  volumenLabel,
  intentLabel,
} from '@/lib/dataforseo'

/**
 * GET /api/strategy/test-dataforseo
 *
 * Endpoint de verificación de la integración DataForSEO.
 * Llama a keyword_ideas y search_volume con las keywords piloto
 * del cliente Serás Formación (academia de oposiciones).
 *
 * Solo para uso interno — requiere autenticación Clerk.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const seedKeywords = [
    'academia oposiciones',
    'preparar oposiciones',
    'oposiciones administración pública',
    'temario oposiciones',
  ]

  console.log('[DataForSEO Test] Iniciando verificación con keywords:', seedKeywords)

  try {
    // ── 1. Keyword Ideas ───────────────────────────────────────────────────
    console.log('[DataForSEO Test] Llamando a keyword_ideas…')
    const t0Ideas = Date.now()
    const ideas = await getKeywordIdeas(seedKeywords)
    const msIdeas = Date.now() - t0Ideas
    console.log(`[DataForSEO Test] keyword_ideas OK — ${ideas.length} resultados en ${msIdeas}ms`)

    // ── 2. Search Volume para las seeds ───────────────────────────────────
    console.log('[DataForSEO Test] Llamando a search_volume…')
    const t0Vol = Date.now()
    const volumenes = await getSearchVolume(seedKeywords)
    const msVol = Date.now() - t0Vol
    console.log(`[DataForSEO Test] search_volume OK — ${volumenes.length} resultados en ${msVol}ms`)

    // ── 3. Formatear respuesta ─────────────────────────────────────────────
    const ideasFormateadas = ideas.slice(0, 20).map((item) => ({
      keyword          : item.keyword,
      volumen          : volumenLabel(item.search_volume),
      volumen_raw      : item.search_volume,
      dificultad       : dificultadLabel(item.keyword_difficulty),
      dificultad_raw   : item.keyword_difficulty,
      cpc_eur          : item.cpc !== null ? `€${item.cpc.toFixed(2)}` : '—',
      intencion        : intentLabel(item.search_intent),
      competencia      : item.competition_level ?? '—',
    }))

    const volumenesFormateados = volumenes.map((item) => ({
      keyword       : item.keyword,
      volumen       : volumenLabel(item.search_volume),
      volumen_raw   : item.search_volume,
      cpc_eur       : item.cpc !== null ? `€${item.cpc.toFixed(2)}` : '—',
      competencia   : item.competition_level ?? '—',
    }))

    return NextResponse.json({
      ok        : true,
      timestamp : new Date().toISOString(),
      seeds     : seedKeywords,
      tiempos   : { keyword_ideas_ms: msIdeas, search_volume_ms: msVol },
      totales   : { ideas: ideas.length, volumenes: volumenes.length },
      keyword_ideas  : ideasFormateadas,
      search_volume  : volumenesFormateados,
      _nota: 'Mostrando primeras 20 keyword ideas. Total completo en campo totales.ideas.',
    })

  } catch (e) {
    if (e instanceof DataForSEOError) {
      console.error('[DataForSEO Test] Error API:', e.message, '| tasks_error:', e.taskErrors)
      return NextResponse.json(
        {
          ok           : false,
          error        : e.message,
          status_code  : e.statusCode,
          tasks_error  : e.taskErrors,
          ayuda: e.statusCode === 401
            ? 'Verifica que DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD están configuradas en .env.local'
            : 'Revisa los logs del servidor para más detalles.',
        },
        { status: e.statusCode >= 500 ? 502 : 400 },
      )
    }

    const err = e instanceof Error ? e : new Error(String(e))
    console.error('[DataForSEO Test] Error inesperado:', err.message)
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 },
    )
  }
}
