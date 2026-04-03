import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

/** Máximo de clusters por llamada a Claude */
const CLUSTER_BATCH_SIZE = 10

/** Top N keywords por cluster en el prompt (reduce tokens) */
const TOP_KW_PER_CLUSTER = 5

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Genera N meses consecutivos a partir del mes siguiente al actual */
function generateMonths(count: number): string[] {
  const months: string[] = []
  const now  = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

/** Convierte texto a slug URL-safe en español */
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80)
}

interface ArticleItem {
  title              : string
  slug               : string
  main_keyword       : string
  secondary_keywords : string[]
  cluster            : string
  funnel_stage       : 'tofu' | 'mofu' | 'bofu'
  suggested_month    : string
  priority           : number
  volume             : number | null
  difficulty         : number | null
}

interface ClusterSummary {
  cluster       : string
  total_keywords: number
  funnel        : { tofu: number; mofu: number; bofu: number }
  top_keywords  : { keyword: string; volume: number | null; difficulty: number | null; funnel: string | null }[]
}

// ─────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un experto en planificación editorial SEO para el mercado español. Generas planes de contenido estratégicos y bien estructurados. Respondes ÚNICAMENTE con JSON array, sin texto adicional.`

function buildMapPrompt(
  clientName  : string,
  meses       : number,
  artMes      : number,
  monthsList  : string[],
  clustersJson: string,
  batchIndex  : number,
  totalBatches: number,
  articulosParaEsteBatch: number,
): string {
  return `Genera artículos para el mapa editorial SEO del cliente "${clientName}".

Configuración global:
- Duración total: ${meses} meses
- Ritmo: ${artMes} artículos/mes
- Meses disponibles: ${JSON.stringify(monthsList)}

Lote ${batchIndex + 1} de ${totalBatches}.
Genera EXACTAMENTE ${articulosParaEsteBatch} artículos para los siguientes clusters:
${clustersJson}

Para cada artículo genera:
- title: título SEO optimizado (50-70 caracteres), natural en español
- slug: URL slug sin tildes, sin caracteres especiales, guiones como separador
- main_keyword: keyword principal (la de mayor volumen del cluster)
- secondary_keywords: array de 2-4 keywords complementarias del mismo cluster
- cluster: nombre exacto del cluster (igual al de los datos)
- funnel_stage: "tofu" | "mofu" | "bofu" según el cluster
- suggested_month: uno de los meses disponibles (formato YYYY-MM)
- priority: 1 (publicar antes) | 2 (medio plazo) | 3 (últimos meses)
- volume: volumen mensual estimado de la main_keyword
- difficulty: dificultad KD estimada (0-100)

Estrategia temporal:
- TOFU alto volumen → meses tempranos (base de tráfico)
- MOFU → meses intermedios (consideración)
- BOFU → meses finales (conversión)
- Distribuye respetando ${artMes} artículos/mes

Responde ÚNICAMENTE con un JSON array:
[{"title":"...","slug":"...","main_keyword":"...","secondary_keywords":["..."],"cluster":"...","funnel_stage":"tofu","suggested_month":"${monthsList[0]}","priority":1,"volume":2400,"difficulty":42}]`
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/strategy/generate-map
 *
 * Lee las keywords clusterizadas de la sesión, llama a Claude en lotes
 * de hasta 10 clusters y guarda los artículos progresivamente en
 * content_maps / content_map_items.
 *
 * Body: {
 *   session_id         : string
 *   config: {
 *     meses            : number  (3 | 6 | 9 | 12)
 *     articulos_por_mes: number  (4 | 6 | 8 | 10)
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase  = createAdminClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const body = await request.json() as {
      session_id: string
      config    : { meses: number; articulos_por_mes: number }
    }

    const { session_id, config } = body
    const meses    = Math.max(1, Math.min(24, config?.meses ?? 6))
    const artMes   = Math.max(2, Math.min(20, config?.articulos_por_mes ?? 6))
    const totalMax = meses * artMes

    if (!session_id) {
      return NextResponse.json({ error: 'session_id es obligatorio' }, { status: 400 })
    }

    // ── Cargar sesión + cliente ──────────────────────────────
    const { data: session } = await supabase
      .from('keyword_research_sessions')
      .select('id, nombre, client_id')
      .eq('id', session_id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    const { data: cliente } = await supabase
      .from('clientes')
      .select('id, nombre')
      .eq('id', session.client_id)
      .single()

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // ── Cargar keywords clusterizadas ────────────────────────
    const { data: keywords, error: kwError } = await supabase
      .from('keywords')
      .select('id, keyword, volume, keyword_difficulty, cpc, search_intent, cluster_name, funnel_stage, priority')
      .eq('session_id', session_id)
      .eq('incluida', true)
      .not('cluster_name', 'is', null)
      .order('volume', { ascending: false, nullsFirst: false })

    if (kwError || !keywords || keywords.length === 0) {
      return NextResponse.json(
        { error: 'No hay keywords clusterizadas. Ejecuta el clustering antes de generar el mapa.' },
        { status: 400 },
      )
    }

    // ── Agrupar por cluster ──────────────────────────────────
    const clusterGroups = new Map<string, typeof keywords>()
    for (const kw of keywords) {
      const name = kw.cluster_name as string
      if (!clusterGroups.has(name)) clusterGroups.set(name, [])
      clusterGroups.get(name)!.push(kw)
    }

    // Resumen compacto: top N keywords por cluster
    const allClusterSummaries: ClusterSummary[] = Array.from(clusterGroups.entries()).map(([name, kws]) => {
      const sorted = [...kws].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      return {
        cluster       : name,
        total_keywords: kws.length,
        funnel        : {
          tofu: kws.filter((k) => k.funnel_stage === 'tofu').length,
          mofu: kws.filter((k) => k.funnel_stage === 'mofu').length,
          bofu: kws.filter((k) => k.funnel_stage === 'bofu').length,
        },
        top_keywords: sorted.slice(0, TOP_KW_PER_CLUSTER).map((k) => ({
          keyword   : k.keyword,
          volume    : k.volume,
          difficulty: k.keyword_difficulty,
          funnel    : k.funnel_stage,
        })),
      }
    })

    const monthsList    = generateMonths(meses)
    const totalClusters = allClusterSummaries.length

    console.log(`[GenerateMap] ${totalClusters} clusters, ${keywords.length} keywords, ${meses} meses, ${artMes} art/mes → máx ${totalMax} artículos`)

    // ── Crear content_map ANTES de los batches ───────────────
    // Así podemos insertar items progresivamente.
    const { data: map, error: mapError } = await supabase
      .from('content_maps')
      .insert({
        session_id,
        client_id: cliente.id,
        nombre   : `Mapa de Contenidos — ${session.nombre}`,
        status   : 'draft',
        config   : { meses, articulos_por_mes: artMes, generado_en: new Date().toISOString() },
      })
      .select('id')
      .single()

    if (mapError || !map) {
      console.error('[GenerateMap] Error creando content_map:', mapError)
      return NextResponse.json({ error: 'Error creando el mapa en base de datos' }, { status: 500 })
    }

    console.log(`[GenerateMap] content_map creado: ${map.id}`)

    // ── Dividir clusters en batches de CLUSTER_BATCH_SIZE ────
    const clusterBatches: ClusterSummary[][] = []
    for (let i = 0; i < allClusterSummaries.length; i += CLUSTER_BATCH_SIZE) {
      clusterBatches.push(allClusterSummaries.slice(i, i + CLUSTER_BATCH_SIZE))
    }

    // Repartir artículos proporcionalmente entre batches
    // (por peso de keywords en cada batch)
    const totalKwCount       = allClusterSummaries.reduce((sum, c) => sum + c.total_keywords, 0)
    let articulosAsignados   = 0
    let totalItemsInsertados = 0
    let sortOrder            = 0

    for (let batchIdx = 0; batchIdx < clusterBatches.length; batchIdx++) {
      const batch       = clusterBatches[batchIdx]
      const batchKwCount = batch.reduce((sum, c) => sum + c.total_keywords, 0)

      // Proporcional, mínimo 1 por batch, redondeando
      let articulosParaBatch: number
      if (batchIdx === clusterBatches.length - 1) {
        // Último batch: lo que quede
        articulosParaBatch = totalMax - articulosAsignados
      } else {
        articulosParaBatch = Math.max(1, Math.round((batchKwCount / totalKwCount) * totalMax))
      }
      articulosAsignados += articulosParaBatch

      console.log(`[GenerateMap] Batch ${batchIdx + 1}/${clusterBatches.length}: ${batch.length} clusters, pidiendo ${articulosParaBatch} artículos`)

      try {
        const response = await anthropic.messages.create({
          model     : 'claude-sonnet-4-5',
          max_tokens: 4096,
          system    : SYSTEM_PROMPT,
          messages  : [{
            role   : 'user',
            content: buildMapPrompt(
              cliente.nombre,
              meses,
              artMes,
              monthsList,
              JSON.stringify(batch, null, 2),
              batchIdx,
              clusterBatches.length,
              articulosParaBatch,
            ),
          }],
        })

        const rawText    = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
        const stopReason = response.stop_reason

        console.log(`[GenerateMap] Batch ${batchIdx + 1} stop_reason: ${stopReason} | largo: ${rawText.length} chars`)
        if (stopReason === 'max_tokens') {
          console.warn(`[GenerateMap] Batch ${batchIdx + 1} — RESPUESTA TRUNCADA!`)
        }

        // ── Parsear artículos del batch ───────────────────────
        const match = rawText.match(/\[[\s\S]*\]/)
        if (!match) {
          console.warn(`[GenerateMap] Batch ${batchIdx + 1} — no se encontró JSON array`)
          continue
        }

        const parsed = JSON.parse(match[0]) as ArticleItem[]
        const articles = parsed
          .filter((a) => a.title && a.main_keyword && a.cluster && a.funnel_stage && a.suggested_month)
          .map((a) => ({
            ...a,
            slug              : toSlug(a.slug || a.title),
            secondary_keywords: Array.isArray(a.secondary_keywords) ? a.secondary_keywords : [],
            volume            : typeof a.volume === 'number' ? a.volume : null,
            difficulty        : typeof a.difficulty === 'number' ? a.difficulty : null,
            priority          : typeof a.priority === 'number' ? a.priority : 2,
          }))
          .slice(0, articulosParaBatch) // No exceder lo pedido

        console.log(`[GenerateMap] Batch ${batchIdx + 1} — ${articles.length} artículos válidos`)

        if (articles.length === 0) continue

        // ── Insertar items en Supabase inmediatamente ────────
        const items = articles.map((a) => ({
          map_id            : map.id,
          title             : a.title,
          slug              : a.slug,
          main_keyword      : a.main_keyword,
          secondary_keywords: a.secondary_keywords,
          cluster           : a.cluster,
          funnel_stage      : a.funnel_stage,
          volume            : a.volume,
          difficulty        : a.difficulty,
          priority          : a.priority,
          suggested_month   : monthsList.includes(a.suggested_month) ? a.suggested_month : monthsList[0],
          sort_order        : sortOrder++,
          status            : 'planned',
        }))

        const { error: itemsError } = await supabase
          .from('content_map_items')
          .insert(items)

        if (itemsError) {
          console.error(`[GenerateMap] Batch ${batchIdx + 1} — error insertando items:`, itemsError)
        } else {
          totalItemsInsertados += items.length
          console.log(`[GenerateMap] Batch ${batchIdx + 1} — ${items.length} items insertados (total acumulado: ${totalItemsInsertados})`)
        }

      } catch (batchErr) {
        console.error(
          `[GenerateMap] Error en batch ${batchIdx + 1}:`,
          batchErr instanceof Error ? batchErr.message : batchErr,
        )
        // Continuamos con el siguiente batch
      }
    }

    // ── Verificación final ──────────────────────────────────
    if (totalItemsInsertados === 0) {
      // Limpiar el mapa vacío
      await supabase.from('content_maps').delete().eq('id', map.id)
      return NextResponse.json(
        { error: 'Claude no generó artículos válidos. Inténtalo de nuevo.' },
        { status: 502 },
      )
    }

    // ── Resumen por mes ─────────────────────────────────────
    const { data: insertedItems } = await supabase
      .from('content_map_items')
      .select('suggested_month')
      .eq('map_id', map.id)

    const porMes = monthsList.map((mes) => ({
      mes      : mes,
      articulos: (insertedItems ?? []).filter((i) => i.suggested_month === mes).length,
    }))

    console.log(`[GenerateMap] Mapa ${map.id} completado — ${totalItemsInsertados} artículos en ${clusterBatches.length} batches`)

    return NextResponse.json({
      ok            : true,
      map_id        : map.id,
      total_articles: totalItemsInsertados,
      por_mes       : porMes,
    })

  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('[GenerateMap] Error inesperado:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
