import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/strategy/project-context?proyecto_id=UUID
 *
 * Contexto combinado para el briefing de estrategia:
 * - Datos del proyecto (tono, audiencia, keywords, restricciones)
 * - Datos del cliente (identidad corporativa, restricciones globales)
 * - Brand context (si existe)
 * - Competidores editoriales con URL web del cliente
 * - Estadísticas (contenidos publicados, estrategias anteriores, keywords ya trabajadas)
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const proyectoId = request.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) {
    return NextResponse.json({ error: 'proyecto_id es requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Proyecto + cliente en un solo join
  const { data: proyecto, error: proyError } = await supabase
    .from('proyectos')
    .select(`
      id,
      nombre,
      descripcion,
      tono_voz,
      keywords_objetivo,
      keywords_prohibidas,
      tematicas_autorizadas,
      tematicas_vetadas,
      perfil_lector,
      cliente_id,
      clientes (
        nombre,
        identidad_corporativa,
        restricciones_globales
      )
    `)
    .eq('id', proyectoId)
    .single()

  if (proyError || !proyecto) {
    return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  }

  const clienteId = proyecto.cliente_id
  const cliente = proyecto.clientes as unknown as {
    nombre                : string
    identidad_corporativa : string
    restricciones_globales: string[]
  }

  // Queries paralelas: brand context + stats + competidores
  const [brandCtxRes, contenidosRes, sesionesRes, keywordsRes, refsRes] = await Promise.all([

    supabase
      .from('brand_context')
      .select('tone_of_voice, style_keywords, restrictions')
      .eq('client_id', clienteId)
      .maybeSingle(),

    supabase
      .from('contenidos')
      .select('id', { count: 'exact', head: true })
      .eq('proyecto_id', proyectoId)
      .eq('estado', 'publicado'),

    supabase
      .from('keyword_research_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('proyecto_id', proyectoId)
      .eq('status', 'completed'),

    supabase
      .from('contenidos')
      .select('keyword_principal')
      .eq('proyecto_id', proyectoId)
      .not('keyword_principal', 'is', null),

    // Competidores editoriales del cliente con URL web
    supabase
      .from('referencias_externas')
      .select('id, nombre, referencia_presencias(url, plataforma, activo)')
      .eq('client_id', clienteId)
      .eq('tipo', 'competidor_editorial')
      .eq('activo', true)
      .limit(10),
  ])

  // Keywords ya trabajadas
  const keywordsSet = new Set<string>()
  for (const row of keywordsRes.data ?? []) {
    if (row.keyword_principal) keywordsSet.add(row.keyword_principal.toLowerCase().trim())
  }

  // URLs de competidores (plataforma = 'web', activo = true)
  type Presencia = { url: string | null; plataforma: string; activo: boolean }
  const competidores: string[] = (refsRes.data ?? [])
    .flatMap((ref) =>
      ((ref.referencia_presencias as unknown as Presencia[]) ?? [])
        .filter((p) => p.plataforma === 'web' && p.activo !== false && p.url)
        .map((p) => p.url as string)
    )
    .slice(0, 5)

  const brandCtx = brandCtxRes.data

  return NextResponse.json({
    proyecto: {
      id                   : proyecto.id,
      nombre               : proyecto.nombre,
      descripcion          : proyecto.descripcion,
      tono_voz             : proyecto.tono_voz,
      keywords_objetivo    : (proyecto.keywords_objetivo as string[]) ?? [],
      keywords_prohibidas  : (proyecto.keywords_prohibidas as string[]) ?? [],
      perfil_lector        : proyecto.perfil_lector,
      tematicas_autorizadas: (proyecto.tematicas_autorizadas as string[]) ?? [],
      tematicas_vetadas    : (proyecto.tematicas_vetadas as string[]) ?? [],
    },
    cliente: {
      nombre                : cliente?.nombre ?? '',
      identidad_corporativa : cliente?.identidad_corporativa ?? '',
      restricciones_globales: (cliente?.restricciones_globales as string[]) ?? [],
    },
    brand_context: brandCtx ? {
      tone_of_voice : brandCtx.tone_of_voice ?? null,
      style_keywords: (brandCtx.style_keywords as string[]) ?? [],
      restrictions  : brandCtx.restrictions ?? null,
    } : null,
    competidores,
    stats: {
      contenidos_publicados : contenidosRes.count ?? 0,
      estrategias_anteriores: sesionesRes.count ?? 0,
      keywords_trabajadas   : Array.from(keywordsSet),
    },
  })
}
