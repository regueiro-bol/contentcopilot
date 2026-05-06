import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

// ─────────────────────────────────────────────────────────────
// Umbrales de similitud
// ─────────────────────────────────────────────────────────────

const THRESHOLD_EXISTING = 0.78 // >= existing_content
const THRESHOLD_PARTIAL  = 0.65 // >= partial

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

/** Construye el texto de búsqueda a partir de un item del mapa */
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

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/strategy/check-existing
 *
 * Body: { map_id: string, client_id: string }
 *
 * Para cada item del mapa:
 * 1. Genera embedding OpenAI del texto (title + keywords)
 * 2. Busca en documentos_rag de TODOS los proyectos del cliente
 * 3. Clasifica como gap / partial / existing_content
 * 4. Actualiza content_map_items con el resultado
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
      map_id: string
      client_id: string
    }

    if (!map_id || !client_id) {
      return NextResponse.json(
        { error: 'map_id y client_id son obligatorios' },
        { status: 400 },
      )
    }

    // ── Cargar items del mapa ──────────────────────────────────
    const { data: items, error: itemsErr } = await supabase
      .from('content_map_items')
      .select('id, title, main_keyword, secondary_keywords')
      .eq('map_id', map_id)
      .order('sort_order', { ascending: true })

    if (itemsErr || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron items en el mapa' },
        { status: 404 },
      )
    }

    console.log(`[CheckExisting] Analizando ${items.length} items para client ${client_id}`)

    // ── Generar embeddings en batch ────────────────────────────
    // OpenAI acepta hasta ~2048 inputs por llamada; procesamos en lotes de 20
    const BATCH_SIZE = 20
    const results: {
      id: string
      content_status: 'gap' | 'existing_content' | 'partial'
      existing_url: string | null
      similarity_score: number
    }[] = []

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE)
      const texts = batch.map(buildSearchText)

      // Generar embeddings del batch
      const embResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      })

      // Para cada item del batch, buscar en RAG del cliente
      for (let j = 0; j < batch.length; j++) {
        const item      = batch[j]
        const embedding = embResponse.data[j].embedding

        const { data: ragResults, error: ragErr } = await supabase.rpc(
          'buscar_rag_cliente',
          {
            query_embedding: embedding,
            p_client_id: client_id,
            match_count: 1,
          },
        )

        if (ragErr) {
          console.error(`[CheckExisting] RPC error para item ${item.id}:`, ragErr.message)
          results.push({
            id: item.id,
            content_status: 'gap',
            existing_url: null,
            similarity_score: 0,
          })
          continue
        }

        const top = (ragResults as Array<{
          id: string
          titulo: string
          contenido: string
          metadatos: Record<string, unknown> | null
          proyecto_id: string
          similarity: number
        }>)?.[0]

        if (!top) {
          results.push({
            id: item.id,
            content_status: 'gap',
            existing_url: null,
            similarity_score: 0,
          })
          continue
        }

        const status = classify(top.similarity)
        const url    = (top.metadatos as Record<string, unknown> | null)?.url as string | undefined

        results.push({
          id: item.id,
          content_status: status,
          existing_url: url ?? null,
          similarity_score: Math.round(top.similarity * 1000) / 1000,
        })
      }

      // Pequeña pausa entre batches de embeddings
      if (i + BATCH_SIZE < items.length) {
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    // ── Actualizar items en Supabase ──────────────────────────
    let updated = 0
    for (const r of results) {
      const { error: upErr } = await supabase
        .from('content_map_items')
        .update({
          content_status: r.content_status,
          existing_url: r.existing_url,
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

    return NextResponse.json({
      ok: true,
      total: results.length,
      updated,
      summary: { gap: gaps, existing_content: existing, partial },
      items: results,
    })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('[CheckExisting] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
