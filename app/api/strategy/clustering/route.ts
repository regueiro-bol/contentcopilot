import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { claveCluster, CLUSTER_FUERA_DE_NEGOCIO } from '@/lib/strategy/dedup'

export const maxDuration = 300

const BATCH_SIZE  = 50  // keywords por lote Claude
const CONCURRENT  = 3   // lotes en paralelo por ronda

// ─────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────

interface ClusterResult {
  keyword     : string
  cluster_name: string
  funnel_stage: 'tofu' | 'mofu' | 'bofu'
  priority    : 1 | 2 | 3
}

// ─────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un experto en SEO y estrategia de contenidos para el mercado español con 10 años de experiencia.
Tu especialidad es agrupar keywords en clusters semánticos coherentes para estrategias de contenido editorial.
Respondes ÚNICAMENTE con el JSON pedido, sin texto adicional, comentarios ni explicaciones previas o posteriores.`

function buildUserPrompt(
  keywordsText: string,
  clientName  : string,
  negocioBlock: string,
): string {
  return `Clasifica las siguientes keywords en clusters semánticos para la estrategia de contenidos del cliente "${clientName}".
${negocioBlock}
Para cada keyword asigna:

- cluster_name: nombre descriptivo del cluster (máx 5 palabras, en español, primera letra mayúscula).
  * Keywords del mismo tema DEBEN tener el mismo cluster_name EXACTO.
  * Usa el vocabulario del propio negocio del cliente, no términos genéricos.
  * Usa SIEMPRE singular y el mismo orden de palabras para un mismo concepto:
    "Precio incineración mascotas" y "Precios Incineración Mascotas" son el
    MISMO cluster y deben compartir nombre.
  * Si la keyword no guarda ninguna relación con lo que vende el cliente
    (otro sector, otro público, otra categoría de producto), asígnale
    exactamente este cluster_name, sin variantes:
      "${CLUSTER_FUERA_DE_NEGOCIO}"
    Estas keywords quedarán fuera del plan editorial, así que no intentes
    encajarlas en un cluster del negocio para "aprovecharlas".

- funnel_stage: aplica estas reglas EN ESTE ORDEN.

  REGLA 1 — INTENCIÓN COMERCIAL. Tiene prioridad sobre cualquier otra señal.
  Si la keyword se refiere a un servicio o producto que el cliente vende
  (ver lista arriba), NO puede ser "tofu" en ningún caso, por muy
  informacional que suene su formulación:
    * "bofu": la consulta trata sobre el servicio o producto en sí —
      nombrarlo, buscarlo, saber en qué consiste, qué incluye, cuánto
      cuesta, cómo se contrata o dónde conseguirlo.
    * "mofu": la consulta trata sobre la decisión de contratarlo —
      comparar alternativas, requisitos previos, cuándo conviene,
      qué tener en cuenta antes de decidir.
  Lo que determina la intención comercial es QUÉ VENDE EL CLIENTE, no si la
  búsqueda contiene un verbo de compra. Una consulta sin ningún término
  transaccional sobre algo que el cliente vende sigue siendo comercial:
  quien la busca es un cliente potencial evaluando esa oferta.

  REGLA 2 — Solo si la keyword NO guarda relación con ningún servicio ni
  producto del cliente:
    * "tofu": interés general del sector, ajeno a la oferta del cliente.
    * "mofu": tema adyacente que aproxima al lector a la categoría de la oferta.
    * "bofu": intención explícita de contratar o comprar.

  No busques repartir las keywords entre las tres etapas: clasifica cada una
  por lo que realmente es. Si la mayoría resulta comercial, así debe quedar.

- priority:
  * 1 (alta): volumen > 1000 o muy estratégica para el negocio
  * 2 (media): volumen 200-1000 o relevancia media
  * 3 (baja): volumen < 200 o nicho muy específico

Responde ÚNICAMENTE con un JSON array (sin texto adicional):
[{"keyword":"...","cluster_name":"...","funnel_stage":"tofu","priority":1}, ...]

Keywords a clasificar (keyword | volumen mensual | dificultad KD | intención DataForSEO):
${keywordsText}`
}

/** Separador interno imposible de aparecer en texto normal */
const SEP = '\x00\x01\x02'

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/strategy/clustering
 *
 * Lee las keywords incluidas de una sesión, las envía a Claude en
 * lotes de 50 y actualiza cada keyword con cluster_name, funnel_stage
 * y priority. Devuelve un resumen de clusters.
 *
 * Body: { session_id: string }
 */
export async function POST(request: NextRequest) {
  const supabase  = createAdminClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    // auth() inside try-catch: Clerk failures return JSON not plain-text
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const { session_id } = await request.json() as { session_id: string }
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
      .select('nombre, descripcion, sector, servicios_productos')
      .eq('id', session.client_id)
      .single()

    const clientName = cliente?.nombre ?? 'Cliente'

    // ── Bloque de negocio ────────────────────────────────────
    // Determina la intención comercial del funnel: una keyword sobre algo
    // que el cliente vende nunca es TOFU, suene como suene.
    const servicios = Array.isArray(cliente?.servicios_productos)
      ? (cliente.servicios_productos as string[]).filter(Boolean)
      : []

    const negocioLines: string[] = []
    if (cliente?.sector)      negocioLines.push(`Sector: ${cliente.sector}`)
    if (cliente?.descripcion) negocioLines.push(`Descripción: ${String(cliente.descripcion).substring(0, 1000)}`)

    if (servicios.length > 0) {
      negocioLines.push(
        'SERVICIOS Y PRODUCTOS QUE VENDE EL CLIENTE:\n' +
        servicios.map((s) => `  - ${s}`).join('\n'),
      )
    } else {
      negocioLines.push(
        'SERVICIOS Y PRODUCTOS: no hay lista explícita. Dedúcelos de la descripción\n' +
        'y del sector antes de clasificar, y aplica igualmente la regla de intención\n' +
        'comercial sobre lo que deduzcas.',
      )
    }

    const negocioBlock = negocioLines.length > 0
      ? `\nNEGOCIO DEL CLIENTE:\n${negocioLines.join('\n')}\n`
      : ''

    console.log(`[Clustering] Negocio — ${servicios.length} servicios declarados`)

    // ── Cargar keywords incluidas ────────────────────────────
    const { data: keywords, error: kwError } = await supabase
      .from('keywords')
      .select('id, keyword, volume, keyword_difficulty, search_intent')
      .eq('session_id', session_id)
      .eq('incluida', true)
      .order('volume', { ascending: false, nullsFirst: false })

    if (kwError || !keywords || keywords.length === 0) {
      return NextResponse.json(
        { error: 'No hay keywords incluidas en esta sesión. Revisa la selección en la pestaña Keywords.' },
        { status: 400 },
      )
    }

    console.log(`[Clustering] ${keywords.length} keywords → lotes de ${BATCH_SIZE} | cliente: ${clientName}`)

    // ── Actualizar status a 'clustering' ─────────────────────
    await supabase
      .from('keyword_research_sessions')
      .update({ status: 'clustering' })
      .eq('id', session_id)

    // ── Construir batches ────────────────────────────────────
    const batches: typeof keywords[] = []
    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
      batches.push(keywords.slice(i, i + BATCH_SIZE))
    }

    // ── Procesar batches en grupos paralelos ─────────────────
    // 327 keywords = 7 lotes × ~20s secuencial = ~140s > maxDuration anterior.
    // Con CONCURRENT=3: ceil(7/3) = 3 rondas × ~20s = ~60s → dentro del límite.
    const allResults: ClusterResult[] = []

    const processBatch = async (batch: typeof keywords, idx: number): Promise<ClusterResult[]> => {
      console.log(`[Clustering] Batch ${idx + 1}/${batches.length} (${batch.length} keywords)`)

      const keywordsText = batch
        .map((k) =>
          `${k.keyword} | vol:${k.volume ?? '?'} | dif:${k.keyword_difficulty ?? '?'} | intent:${k.search_intent ?? '?'}`,
        )
        .join('\n')

      const response = await anthropic.messages.create({
        model     : 'claude-sonnet-4-6',
        max_tokens: 4096,   // 50 kw × ~130 chars/entry ≈ 1625 tokens; 4096 deja margen amplio
        system    : SYSTEM_PROMPT,
        messages  : [{ role: 'user', content: buildUserPrompt(keywordsText, clientName, negocioBlock) }],
      })

      const rawText    = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
      const stopReason = response.stop_reason
      console.log(`[Clustering] Batch ${idx + 1} stop_reason: ${stopReason} | ${rawText.length} chars`)
      console.log(`[Clustering] Batch ${idx + 1} raw (primeros 500): ${rawText.substring(0, 500)}`)
      if (stopReason === 'max_tokens') {
        console.warn(`[Clustering] Batch ${idx + 1} — RESPUESTA TRUNCADA por max_tokens (aumentar max_tokens)`)
      }

      const match = rawText.match(/\[[\s\S]*\]/)
      if (!match) {
        console.warn(`[Clustering] Batch ${idx + 1} — no se encontró JSON array en la respuesta`)
        console.warn(`[Clustering] Batch ${idx + 1} texto completo:`, rawText)
        return []
      }

      let parsed: Record<string, unknown>[]
      try {
        parsed = JSON.parse(match[0]) as Record<string, unknown>[]
      } catch (parseErr) {
        console.error(`[Clustering] Batch ${idx + 1} — error parseando JSON:`, parseErr)
        console.error(`[Clustering] Batch ${idx + 1} JSON intentado (primeros 300):`, match[0].substring(0, 300))
        return []
      }
      const valid: ClusterResult[] = parsed
        .map((r) => ({
          keyword     : String(r.keyword     ?? '').trim(),
          cluster_name: String(r.cluster_name ?? '').trim(),
          funnel_stage: String(r.funnel_stage ?? '').toLowerCase() as ClusterResult['funnel_stage'],
          priority    : Number(r.priority) as ClusterResult['priority'],
        }))
        .filter(
          (r) =>
            r.keyword &&
            r.cluster_name &&
            ['tofu', 'mofu', 'bofu'].includes(r.funnel_stage) &&
            [1, 2, 3].includes(r.priority),
        )

      console.log(`[Clustering] Batch ${idx + 1} — ${valid.length}/${parsed.length} válidos`)
      return valid
    }

    for (let i = 0; i < batches.length; i += CONCURRENT) {
      const group      = batches.slice(i, i + CONCURRENT)
      const groupNum   = Math.floor(i / CONCURRENT) + 1
      const totalGroups = Math.ceil(batches.length / CONCURRENT)
      console.log(`[Clustering] Ronda ${groupNum}/${totalGroups} — ${group.length} lotes en paralelo`)

      const settled = await Promise.allSettled(
        group.map((batch, j) => processBatch(batch, i + j))
      )

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value)
        } else {
          console.error(`[Clustering] Lote falló:`, result.reason instanceof Error ? result.reason.message : result.reason)
          // Continuamos — los demás lotes de la ronda ya están completos
        }
      }
    }

    if (allResults.length === 0) {
      await supabase
        .from('keyword_research_sessions')
        .update({ status: 'completed' })
        .eq('id', session_id)
      return NextResponse.json(
        { error: 'Claude no devolvió clasificaciones válidas. Inténtalo de nuevo.' },
        { status: 502 },
      )
    }

    // ── Fusionar clusters equivalentes ────────────────────────
    // Los lotes corren en paralelo y cada uno bautiza sus clusters sin ver
    // los nombres elegidos por los demás, así que el mismo concepto llega
    // con varias grafías ("Precio Incineración Mascotas" / "Precios
    // incineración mascotas"). Agrupamos por clave normalizada y adoptamos
    // como canónica la grafía más repetida.
    {
      const porClave = new Map<string, Map<string, number>>()
      for (const r of allResults) {
        const clave = claveCluster(r.cluster_name)
        if (!clave) continue
        if (!porClave.has(clave)) porClave.set(clave, new Map())
        const grafias = porClave.get(clave)!
        grafias.set(r.cluster_name, (grafias.get(r.cluster_name) ?? 0) + 1)
      }

      const canonico = new Map<string, string>()
      let fusionados = 0
      for (const [clave, grafias] of Array.from(porClave.entries())) {
        // Más frecuente; a igualdad, la primera vista (Map conserva orden)
        let mejor = ''
        let mejorN = -1
        for (const [grafia, n] of Array.from(grafias.entries())) {
          if (n > mejorN) { mejor = grafia; mejorN = n }
        }
        canonico.set(clave, mejor)
        if (grafias.size > 1) {
          fusionados += grafias.size - 1
          console.log(
            `[Clustering] Fusionando ${grafias.size} grafías → "${mejor}": ` +
            Array.from(grafias.keys()).filter((g) => g !== mejor).map((g) => `"${g}"`).join(', '),
          )
        }
      }

      for (const r of allResults) {
        const c = canonico.get(claveCluster(r.cluster_name))
        if (c) r.cluster_name = c
      }

      console.log(
        `[Clustering] Clusters: ${porClave.size} tras fusionar ` +
        `(${fusionados} grafías duplicadas absorbidas)`,
      )
    }

    // ── Mapa keyword (normalizada) → id ───────────────────────
    // Normalizar: lowercase, trim, colapsar espacios múltiples
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
    const kwByName = new Map<string, string>()
    for (const kw of keywords) {
      kwByName.set(normalize(kw.keyword), kw.id)
    }
    console.log(`[Clustering] Mapa kwByName tiene ${kwByName.size} entradas`)

    // ── Agrupar actualizaciones por (cluster, funnel, priority) ──
    // Minimiza las llamadas a Supabase: 1 UPDATE por combinación única.
    // Usa SEP (\x00\x01\x02) como separador para evitar colisión con texto de cluster.
    const updateGroups = new Map<string, string[]>() // groupKey → [ids]
    let kwNotFound = 0
    for (const result of allResults) {
      const id = kwByName.get(normalize(result.keyword))
      if (!id) { kwNotFound++; continue }
      const groupKey = `${result.cluster_name}${SEP}${result.funnel_stage}${SEP}${result.priority}`
      if (!updateGroups.has(groupKey)) updateGroups.set(groupKey, [])
      updateGroups.get(groupKey)!.push(id)
    }

    console.log(`[Clustering] Total resultados Claude: ${allResults.length}/${keywords.length} keywords`)
    console.log(`[Clustering] Grupos a actualizar: ${updateGroups.size} | keywords sin match en DB: ${kwNotFound}`)
    if (kwNotFound > 0) {
      // Log las primeras keywords que no se encontraron para depuración
      const notFoundSample = allResults
        .filter((r) => !kwByName.has(normalize(r.keyword)))
        .slice(0, 5)
        .map((r) => r.keyword)
      console.warn(`[Clustering] Ejemplo keywords sin match:`, notFoundSample)
    }

    for (const [groupKey, ids] of Array.from(updateGroups.entries())) {
      const parts        = groupKey.split(SEP)
      const cluster_name = parts[0]
      const funnel_stage = parts[1]
      const priorityNum  = parseInt(parts[2], 10)

      console.log(`[Clustering] UPDATE cluster="${cluster_name}" funnel="${funnel_stage}" priority=${priorityNum} ids=${ids.length}`)

      const { data: updateData, error: updateErr } = await supabase
        .from('keywords')
        .update({
          cluster_name,
          funnel_stage,
          priority: priorityNum,
        })
        .in('id', ids)
        .select('id')

      console.log(
        `[Clustering] UPDATE resultado — filas afectadas: ${updateData?.length ?? 0} | error: ${updateErr?.message ?? 'ninguno'}`,
      )
      if (updateErr) {
        console.error(`[Clustering] Error completo:`, JSON.stringify(updateErr))
      }
    }

    // ── Calcular resumen de clusters ─────────────────────────
    const clusterMap = new Map<string, { total: number; tofu: number; mofu: number; bofu: number }>()
    for (const result of allResults) {
      if (!result.cluster_name) continue
      if (!clusterMap.has(result.cluster_name)) {
        clusterMap.set(result.cluster_name, { total: 0, tofu: 0, mofu: 0, bofu: 0 })
      }
      const entry = clusterMap.get(result.cluster_name)!
      entry.total++
      entry[result.funnel_stage]++
    }

    const clusters = Array.from(clusterMap.entries())
      .map(([nombre, counts]) => ({ nombre, ...counts }))
      .sort((a, b) => b.total - a.total)

    // ── Marcar sesión como completada ─────────────────────────
    await supabase
      .from('keyword_research_sessions')
      .update({
        status : 'completed',
        resumen: {
          clustering_completado : true,
          num_clusters          : clusters.length,
          keywords_clasificadas : allResults.length,
        },
      })
      .eq('id', session_id)

    console.log(`[Clustering] Completado — ${clusters.length} clusters, ${allResults.length} clasificadas`)

    return NextResponse.json({
      ok               : true,
      clusters,
      total_clasificadas: allResults.length,
    })

  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('[Clustering] Error inesperado:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
