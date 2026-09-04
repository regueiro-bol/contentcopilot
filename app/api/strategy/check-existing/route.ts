import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

// ─────────────────────────────────────────────────────────────
// Umbrales de similitud
//
// Calibrados sobre datos reales (mapa de 19 artículos contra 40 publicados
// de galicia.pet). Se aplican a la puntuación COMBINADA cuerpo+título, no a
// la similitud cruda de un fragmento suelto.
//
// Con la versión anterior —un único fragmento, umbral 0.65 para parcial—
// ese mapa daba 1 nuevo / 2 existentes / 16 parciales: sobre un corpus
// monotemático, cualquier artículo del sector supera 0.65 contra cualquier
// otro, así que "parcial" dejaba de discriminar.
// ─────────────────────────────────────────────────────────────

const THRESHOLD_EXISTING = 0.78 // >= existing_content
const THRESHOLD_PARTIAL  = 0.70 // >= partial

/** Fragmentos a recuperar por item. Antes era 1, de ahí la lotería de fragmento. */
const MATCH_COUNT = 8

/** Fragmentos por artículo que promedian la señal de cuerpo */
const CHUNKS_POR_ARTICULO = 2

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function classify(similarity: number): 'existing_content' | 'partial' | 'gap' {
  if (similarity >= THRESHOLD_EXISTING) return 'existing_content'
  if (similarity >= THRESHOLD_PARTIAL)  return 'partial'
  return 'gap'
}

/** Texto para la búsqueda contra el cuerpo de los artículos */
function buildSearchText(item: {
  title: string
  main_keyword: string
  secondary_keywords: unknown
}): string {
  const parts = [item.title, item.main_keyword]
  if (Array.isArray(item.secondary_keywords)) {
    parts.push(...(item.secondary_keywords as string[]).slice(0, 4))
  }
  return parts.join(' ')
}

/**
 * Quita el sufijo del sitio de un título publicado.
 *
 * Los títulos vienen como "Qué hacer cuando muere tu perro - Estrellas&Huellas:
 * Crematorio de Mascotas en Ourense". Ese rabo va en los 40 títulos del cliente
 * y los acerca artificialmente entre sí: quitarlo subió la similitud del par
 * realmente duplicado de 0.664 a 0.778.
 */
function limpiarTituloPublicado(titulo: string): string {
  return titulo
    .replace(/\s*[-–—|]\s*[^-–—|]{3,60}$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Coseno entre dos vectores */
function coseno(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na  += a[i] * a[i]
    nb  += b[i] * b[i]
  }
  const den = Math.sqrt(na) * Math.sqrt(nb)
  return den === 0 ? 0 : dot / den
}

/** Media de los N mejores valores de una lista ya ordenada descendente */
function mediaTop(valores: number[], n: number): number {
  if (valores.length === 0) return 0
  const top = valores.slice(0, n)
  return top.reduce((s, v) => s + v, 0) / top.length
}

interface CandidatoArticulo {
  articulo_id: string
  titulo     : string
  url        : string | null
  simCuerpo  : number | null
  simTitulo  : number | null
}

/**
 * Combina las dos señales.
 *
 * Se calcula POR ARTÍCULO antes de elegir el mejor: mezclar el cuerpo de un
 * artículo con el título de otro daba veredictos incoherentes.
 * Cuando solo hay una de las dos señales, se usa esa.
 */
function combinar(c: CandidatoArticulo): number {
  if (c.simCuerpo != null && c.simTitulo != null) return (c.simCuerpo + c.simTitulo) / 2
  return c.simCuerpo ?? c.simTitulo ?? 0
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/strategy/check-existing
 *
 * Body: { map_id?: string, client_id: string }
 *
 * Para cada item del mapa:
 * 1. Recupera los MATCH_COUNT fragmentos más próximos del RAG del cliente
 *    y los agrega por artículo (media de los CHUNKS_POR_ARTICULO mejores)
 * 2. Compara además título contra título, señal simétrica y más limpia que
 *    enfrentar un título corto a fragmentos de ~500 palabras
 * 3. Combina ambas por artículo, se queda con el mejor y clasifica
 * 4. Actualiza content_map_items
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const openai   = getOpenAI()

  try {
    const { map_id, client_id } = (await request.json()) as {
      map_id?  : string
      client_id: string
    }

    if (!client_id) {
      return NextResponse.json({ error: 'client_id es obligatorio' }, { status: 400 })
    }

    // ── Cargar items del mapa (por map_id o por client_id) ────────
    let itemsQuery = supabase
      .from('content_map_items')
      .select('id, title, main_keyword, secondary_keywords')
      .order('sort_order', { ascending: true })

    if (map_id) {
      itemsQuery = itemsQuery.eq('map_id', map_id)
    } else {
      const { data: maps } = await supabase
        .from('content_maps')
        .select('id')
        .eq('client_id', client_id)
      const mapIds = (maps ?? []).map((m) => m.id as string)
      if (mapIds.length === 0) {
        return NextResponse.json({ error: 'No hay mapas para este cliente' }, { status: 404 })
      }
      itemsQuery = itemsQuery.in('map_id', mapIds)
    }

    const { data: items, error: itemsErr } = await itemsQuery

    if (itemsErr || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron items en el mapa' },
        { status: 404 },
      )
    }

    console.log(`[CheckExisting] Analizando ${items.length} items para client ${client_id}`)

    // ── Corpus de comparación ─────────────────────────────────
    // Si el cliente no tiene documentos indexados, todos los items salen
    // 'gap' por ausencia de fuente, no porque el contenido sea nuevo.
    const { data: proyectosCliente } = await supabase
      .from('proyectos')
      .select('id')
      .eq('cliente_id', client_id)

    const proyectoIds = (proyectosCliente ?? []).map((p) => p.id as string)

    let corpusSize = 0
    const articulosPublicados = new Map<string, { titulo: string; url: string | null }>()

    if (proyectoIds.length > 0) {
      const { data: filas } = await supabase
        .from('documentos_rag')
        .select('articulo_id, titulo, metadatos')
        .in('proyecto_id', proyectoIds)
        .not('embedding', 'is', null)

      corpusSize = (filas ?? []).length

      for (const f of filas ?? []) {
        const aid = String(f.articulo_id ?? '')
        if (!aid || articulosPublicados.has(aid)) continue
        const meta = f.metadatos as Record<string, unknown> | null
        articulosPublicados.set(aid, {
          titulo: limpiarTituloPublicado(String(f.titulo ?? '')),
          url   : (meta?.url as string) || null,
        })
      }
    }

    console.log(
      `[CheckExisting] CORPUS — ${proyectoIds.length} proyectos, ${corpusSize} fragmentos, ` +
      `${articulosPublicados.size} artículos distintos`,
    )

    if (corpusSize === 0) {
      console.warn(
        `[CheckExisting] ⚠️  CORPUS VACÍO para client ${client_id}. ` +
        `Los ${items.length} items se clasificarán como 'gap' por falta de fuente, ` +
        `NO por ser contenido nuevo. El resultado no es concluyente.`,
      )
    }

    // ── Embeddings de los títulos publicados ──────────────────
    // Una sola vez por ejecución. Son textos cortos: el coste es marginal
    // y permite comparar título contra título, que es simétrico.
    const titulosPub = Array.from(articulosPublicados.entries())
      .filter(([, v]) => v.titulo.length > 0)

    const embTitulosPub = new Map<string, number[]>()
    const EMB_BATCH = 200

    for (let i = 0; i < titulosPub.length; i += EMB_BATCH) {
      const lote = titulosPub.slice(i, i + EMB_BATCH)
      const res  = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: lote.map(([, v]) => v.titulo),
      })
      lote.forEach(([aid], j) => embTitulosPub.set(aid, res.data[j].embedding))
    }

    console.log(`[CheckExisting] ${embTitulosPub.size} títulos publicados embebidos`)

    // ── Analizar los items ────────────────────────────────────
    const BATCH_SIZE = 20
    const results: {
      id              : string
      content_status  : 'gap' | 'existing_content' | 'partial'
      existing_url    : string | null
      similarity_score: number
    }[] = []

    let sinResultadoRpc = 0
    let erroresRpc      = 0
    let maxSimilarity   = 0

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE)

      // Dos embeddings por item: uno rico para buscar en el cuerpo y otro
      // del título a secas para la comparación título-título.
      const [embBusqueda, embTitulos] = await Promise.all([
        openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch.map(buildSearchText),
        }),
        openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch.map((it) => it.title),
        }),
      ])

      for (let j = 0; j < batch.length; j++) {
        const item        = batch[j]
        const embBusq     = embBusqueda.data[j].embedding
        const embTituloIt = embTitulos.data[j].embedding

        // ── Señal de cuerpo: fragmentos agregados por artículo ──
        const simsPorArticulo = new Map<string, number[]>()

        const { data: ragResults, error: ragErr } = await supabase.rpc(
          'buscar_rag_cliente',
          {
            query_embedding: embBusq,
            p_client_id    : client_id,
            match_count    : MATCH_COUNT,
          },
        )

        if (ragErr) {
          erroresRpc++
          console.error(`[CheckExisting] RPC error para "${item.title}":`, ragErr.message)
        } else {
          for (const r of (ragResults ?? []) as Array<{
            articulo_id: string | null
            titulo     : string
            metadatos  : Record<string, unknown> | null
            similarity : number
          }>) {
            const aid = String(r.articulo_id ?? r.titulo ?? '')
            if (!aid) continue
            if (!simsPorArticulo.has(aid)) simsPorArticulo.set(aid, [])
            simsPorArticulo.get(aid)!.push(r.similarity)
            // El RPC puede traer artículos que no estaban en el mapa de títulos
            if (!articulosPublicados.has(aid)) {
              articulosPublicados.set(aid, {
                titulo: limpiarTituloPublicado(String(r.titulo ?? '')),
                url   : (r.metadatos?.url as string) || null,
              })
            }
          }
        }

        // ── Candidatos: unión de lo que aporta cada señal ───────
        const candidatos = new Map<string, CandidatoArticulo>()

        for (const [aid, sims] of Array.from(simsPorArticulo.entries())) {
          const info = articulosPublicados.get(aid)
          candidatos.set(aid, {
            articulo_id: aid,
            titulo     : info?.titulo ?? '',
            url        : info?.url ?? null,
            simCuerpo  : mediaTop(sims.sort((a, b) => b - a), CHUNKS_POR_ARTICULO),
            simTitulo  : null,
          })
        }

        for (const [aid, emb] of Array.from(embTitulosPub.entries())) {
          const sim  = coseno(embTituloIt, emb)
          const info = articulosPublicados.get(aid)
          const prev = candidatos.get(aid)
          if (prev) {
            prev.simTitulo = sim
          } else {
            candidatos.set(aid, {
              articulo_id: aid,
              titulo     : info?.titulo ?? '',
              url        : info?.url ?? null,
              simCuerpo  : null,
              simTitulo  : sim,
            })
          }
        }

        if (candidatos.size === 0) {
          sinResultadoRpc++
          console.log(
            `[CheckExisting] "${item.title}" — 0 documentos recuperados → gap por falta de fuente`,
          )
          results.push({
            id: item.id, content_status: 'gap', existing_url: null, similarity_score: 0,
          })
          continue
        }

        // ── Mejor artículo por puntuación combinada ─────────────
        let mejor: CandidatoArticulo | null = null
        let mejorScore = -1
        for (const c of Array.from(candidatos.values())) {
          const s = combinar(c)
          if (s > mejorScore) { mejorScore = s; mejor = c }
        }

        const status = classify(mejorScore)
        if (mejorScore > maxSimilarity) maxSimilarity = mejorScore

        console.log(
          `[CheckExisting] "${item.title}" — cuerpo=${mejor!.simCuerpo?.toFixed(3) ?? '—'} ` +
          `titulo=${mejor!.simTitulo?.toFixed(3) ?? '—'} comb=${mejorScore.toFixed(3)} ` +
          `→ ${status} · "${mejor!.titulo.slice(0, 60)}"`,
        )

        results.push({
          id              : item.id,
          content_status  : status,
          existing_url    : mejor!.url,
          similarity_score: Math.round(mejorScore * 1000) / 1000,
        })
      }
    }

    // ── Actualizar items en Supabase ──────────────────────────
    let updated = 0
    for (const r of results) {
      const { error: upErr } = await supabase
        .from('content_map_items')
        .update({
          content_status  : r.content_status,
          existing_url    : r.existing_url,
          similarity_score: r.similarity_score,
        })
        .eq('id', r.id)

      if (!upErr) updated++
    }

    // ── Resumen ───────────────────────────────────────────────
    const gaps     = results.filter((r) => r.content_status === 'gap').length
    const existing = results.filter((r) => r.content_status === 'existing_content').length
    const partial  = results.filter((r) => r.content_status === 'partial').length

    console.log(`[CheckExisting] Completado: ${gaps} gaps, ${existing} existing, ${partial} partial (${updated}/${results.length} actualizados)`)
    console.log(
      `[CheckExisting] DIAGNÓSTICO — corpus: ${corpusSize} fragmentos / ` +
      `${articulosPublicados.size} artículos · items sin match: ${sinResultadoRpc}/${results.length} · ` +
      `errores RPC: ${erroresRpc} · similitud máxima: ${maxSimilarity.toFixed(3)} · ` +
      `umbrales: existing≥${THRESHOLD_EXISTING} partial≥${THRESHOLD_PARTIAL}`,
    )

    if (corpusSize === 0) {
      console.warn(
        `[CheckExisting] ⚠️  Los ${gaps} "gaps" NO significan que el contenido sea nuevo: ` +
        `no había nada contra lo que comparar.`,
      )
    }

    return NextResponse.json({
      ok: true,
      total: results.length,
      updated,
      summary: { gap: gaps, existing_content: existing, partial },
      diagnostico: {
        corpus_fragmentos    : corpusSize,
        corpus_articulos     : articulosPublicados.size,
        items_sin_match      : sinResultadoRpc,
        errores_rpc          : erroresRpc,
        similitud_maxima     : Math.round(maxSimilarity * 1000) / 1000,
        umbral_existente     : THRESHOLD_EXISTING,
        umbral_parcial       : THRESHOLD_PARTIAL,
        resultado_concluyente: corpusSize > 0,
      },
      items: results,
    })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('[CheckExisting] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
