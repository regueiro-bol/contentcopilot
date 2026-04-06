/**
 * POST /api/strategy/inspiracion
 *
 * Agente Inspiracion — Fase 0 del modulo Estrategia.
 * Pipeline: RAG propio → competencia editorial → tendencias sector → sintesis Claude.
 *
 * Body: { client_id: string }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

const SERPAPI_BASE = 'https://serpapi.com/search.json'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function serpSearch(params: Record<string, string>): Promise<Record<string, unknown>> {
  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) return {}
  const qs = new URLSearchParams({ ...params, api_key: apiKey })
  try {
    const res = await fetch(`${SERPAPI_BASE}?${qs}`)
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ─────────────────────────────────────────────────────────────
// Pipeline steps
// ─────────────────────────────────────────────────────────────

/** PASO 1 — Analisis contenido propio via RAG */
async function analizarContenidoPropio(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
): Promise<{ temas: string[]; titulos: string[] }> {
  // Buscar proyectos del cliente
  const { data: proyectos } = await supabase
    .from('proyectos')
    .select('id')
    .eq('cliente_id', clientId)

  if (!proyectos || proyectos.length === 0) return { temas: [], titulos: [] }

  // Leer titulos unicos de documentos RAG
  const { data: docs } = await supabase
    .from('documentos_rag')
    .select('titulo')
    .in('proyecto_id', proyectos.map((p) => p.id))
    .not('titulo', 'is', null)

  const titulosUnicos = Array.from(new Set((docs ?? []).map((d) => String(d.titulo)).filter(Boolean)))

  return {
    temas: titulosUnicos.slice(0, 50),
    titulos: titulosUnicos.slice(0, 50),
  }
}

/** PASO 2 — Analisis competencia editorial via SerpApi */
async function analizarCompetencia(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
): Promise<Array<{ competidor: string; temas: string[] }>> {
  // Cargar competidores editoriales con presencias web
  const { data: refs } = await supabase
    .from('referencias_externas')
    .select('id, nombre, referencia_presencias(plataforma, url)')
    .eq('client_id', clientId)
    .eq('tipo', 'competidor_editorial')
    .eq('activo', true)

  if (!refs || refs.length === 0) return []

  const resultados: Array<{ competidor: string; temas: string[] }> = []

  for (const ref of refs.slice(0, 5)) {
    const presencias = (ref.referencia_presencias ?? []) as Array<{ plataforma: string; url: string | null }>
    const webPres = presencias.find((p) => p.plataforma === 'web' && p.url)
    if (!webPres?.url) continue

    // Extraer dominio
    let dominio: string
    try {
      dominio = new URL(webPres.url).hostname.replace('www.', '')
    } catch { continue }

    // SerpApi: site:dominio
    const data = await serpSearch({
      engine: 'google',
      q: `site:${dominio}`,
      num: '10',
      gl: 'es',
      hl: 'es',
    })

    const organicResults = (data.organic_results ?? []) as Array<{ title?: string; snippet?: string }>
    const temas = organicResults
      .map((r) => r.title)
      .filter(Boolean) as string[]

    resultados.push({ competidor: ref.nombre, temas: temas.slice(0, 10) })
  }

  return resultados
}

/** PASO 3 — Tendencias del sector via SerpApi */
async function analizarTendencias(
  sector: string | null,
  descripcion: string | null,
): Promise<{ trending: string[]; preguntas: string[]; snippets: string[] }> {
  if (!sector) return { trending: [], preguntas: [], snippets: [] }

  const query = `${sector} ${descripcion ? descripcion.split(' ').slice(0, 5).join(' ') : ''} blog contenido`.trim()

  // Busqueda organica
  const orgData = await serpSearch({
    engine: 'google',
    q: query,
    num: '10',
    gl: 'es',
    hl: 'es',
  })

  const trending = ((orgData.organic_results ?? []) as Array<{ title?: string }>)
    .map((r) => r.title)
    .filter(Boolean) as string[]

  // Related questions (People Also Ask)
  const preguntas = ((orgData.related_questions ?? []) as Array<{ question?: string }>)
    .map((r) => r.question)
    .filter(Boolean) as string[]

  // Related searches
  const snippets = ((orgData.related_searches ?? []) as Array<{ query?: string }>)
    .map((r) => r.query)
    .filter(Boolean) as string[]

  return {
    trending: trending.slice(0, 10),
    preguntas: preguntas.slice(0, 10),
    snippets: snippets.slice(0, 10),
  }
}

/** PASO 4 — Sintesis con Claude */
async function sintetizarConClaude(ctx: {
  clienteNombre: string
  clienteSector: string | null
  clienteDescripcion: string | null
  contenidoPropio: { temas: string[]; titulos: string[] }
  competencia: Array<{ competidor: string; temas: string[] }>
  tendencias: { trending: string[]; preguntas: string[]; snippets: string[] }
}): Promise<Record<string, unknown>> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `Eres un estratega de contenidos experto. Analiza estos datos y genera un informe de oportunidades.

CLIENTE: ${ctx.clienteNombre}
SECTOR: ${ctx.clienteSector ?? 'No especificado'}
DESCRIPCION: ${ctx.clienteDescripcion ?? 'No especificada'}

CONTENIDO PROPIO DEL CLIENTE (${ctx.contenidoPropio.temas.length} piezas):
${ctx.contenidoPropio.temas.length > 0 ? ctx.contenidoPropio.temas.map((t) => `- ${t}`).join('\n') : '(Sin contenido publicado aun)'}

COMPETENCIA EDITORIAL:
${ctx.competencia.length > 0
    ? ctx.competencia.map((c) => `${c.competidor}:\n${c.temas.map((t) => `  - ${t}`).join('\n')}`).join('\n\n')
    : '(Sin competidores editoriales configurados)'}

TENDENCIAS DEL SECTOR:
Temas trending:
${ctx.tendencias.trending.map((t) => `- ${t}`).join('\n') || '(Sin datos)'}

Preguntas frecuentes:
${ctx.tendencias.preguntas.map((p) => `- ${p}`).join('\n') || '(Sin datos)'}

Busquedas relacionadas:
${ctx.tendencias.snippets.map((s) => `- ${s}`).join('\n') || '(Sin datos)'}

Genera un JSON con esta estructura EXACTA (sin markdown, solo JSON):
{
  "resumen_ejecutivo": {
    "oportunidades_principales": ["oportunidad 1", "oportunidad 2", "oportunidad 3"],
    "nivel_saturacion": "bajo|medio|alto",
    "recomendacion_posicionamiento": "texto con la recomendacion estrategica"
  },
  "contenido_propio": {
    "temas_cubiertos": ["tema 1", "tema 2"],
    "formatos_usados": ["blog", "guia"],
    "gaps_detectados": ["gap 1", "gap 2"]
  },
  "competencia": {
    "analisis": [{"competidor": "nombre", "temas": ["tema 1"]}],
    "gaps_vs_competencia": ["gap 1"]
  },
  "tendencias": {
    "temas_trending": ["tema 1"],
    "preguntas_frecuentes": ["pregunta 1"],
    "angulos_originales": ["angulo 1", "angulo 2"]
  },
  "oportunidades": [
    {
      "id": "op_1",
      "tema": "Tema de la oportunidad",
      "por_que_oportunidad": "Explicacion",
      "enfoque_recomendado": "Como abordarlo",
      "urgencia": "alta|media|baja",
      "marcada": false
    }
  ],
  "ideas_contenido": [
    {
      "titulo": "Titulo sugerido del articulo",
      "angulo": "Angulo o enfoque diferenciador",
      "formato": "Guia|Listicle|Comparativa|Tutorial|FAQ|Opinion"
    }
  ]
}

REGLAS:
- Genera 8-12 oportunidades con IDs op_1, op_2, etc.
- Genera 15-20 ideas de contenido
- Urgencia: alta = oportunidad inmediata, media = 1-3 meses, baja = a largo plazo
- Se especifico y accionable, no generico
- Responde SOLO con el JSON, sin texto adicional`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude no devolvio JSON valido')

  return JSON.parse(jsonMatch[0]) as Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { client_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON invalido' }, { status: 400 })
  }

  const { client_id } = body
  if (!client_id) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

  const supabase = createAdminClient()

  // Cargar cliente
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nombre, sector, descripcion')
    .eq('id', client_id)
    .single()

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Crear sesion
  const { data: session, error: sessError } = await supabase
    .from('inspiracion_sessions')
    .insert({ client_id, status: 'running' })
    .select('id')
    .single()

  if (sessError || !session) {
    return NextResponse.json({ error: 'Error creando sesion' }, { status: 500 })
  }

  console.log(`[Inspiracion] Sesion ${session.id} creada para ${cliente.nombre}`)

  try {
    // PASO 1 — Contenido propio
    console.log('[Inspiracion] Paso 1: Analizando contenido propio...')
    const contenidoPropio = await analizarContenidoPropio(supabase, client_id)
    console.log(`[Inspiracion] Paso 1 completado: ${contenidoPropio.temas.length} temas`)

    // PASO 2 — Competencia editorial
    console.log('[Inspiracion] Paso 2: Analizando competencia editorial...')
    const competencia = await analizarCompetencia(supabase, client_id)
    console.log(`[Inspiracion] Paso 2 completado: ${competencia.length} competidores`)

    // PASO 3 — Tendencias
    console.log('[Inspiracion] Paso 3: Buscando tendencias del sector...')
    const tendencias = await analizarTendencias(cliente.sector, cliente.descripcion)
    console.log(`[Inspiracion] Paso 3 completado: ${tendencias.trending.length} trending, ${tendencias.preguntas.length} preguntas`)

    // PASO 4 — Sintesis con Claude
    console.log('[Inspiracion] Paso 4: Sintetizando con Claude...')
    const resultado = await sintetizarConClaude({
      clienteNombre: cliente.nombre,
      clienteSector: cliente.sector,
      clienteDescripcion: cliente.descripcion,
      contenidoPropio,
      competencia,
      tendencias,
    })
    console.log('[Inspiracion] Paso 4 completado')

    // Guardar resultado
    await supabase
      .from('inspiracion_sessions')
      .update({
        status: 'completed',
        resultado,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)

    console.log(`[Inspiracion] Sesion ${session.id} completada`)

    return NextResponse.json({
      ok: true,
      session_id: session.id,
      resultado,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Inspiracion] Error en sesion ${session.id}:`, msg)

    await supabase
      .from('inspiracion_sessions')
      .update({ status: 'error', error_message: msg, updated_at: new Date().toISOString() })
      .eq('id', session.id)

    return NextResponse.json({ error: msg, session_id: session.id }, { status: 500 })
  }
}
