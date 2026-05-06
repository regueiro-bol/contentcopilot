/**
 * POST /api/strategy/actualidad
 *
 * Genera oportunidades de actualidad: trending (DataForSEO Trends) + estacionales (Claude).
 * Body: { client_id: string, force?: boolean }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTrendingKeywords } from '@/lib/dataforseo'

export const maxDuration = 60

// ─────────────────────────────────────────────────────────────
// Helper: generar keywords representativas del sector
// ─────────────────────────────────────────────────────────────

function buildSectorKeywords(sector: string | null, descripcion: string | null): string[] {
  const genericSectors = ['otro', 'otros']

  if (sector && !genericSectors.includes(sector.toLowerCase().trim())) {
    // Sector específico: usarlo directamente como keyword de Google Trends.
    // No añadir sufijos ("tendencias", "novedades") ni palabras del cliente —
    // producen queries sin sentido para Trends (ej: "Otro tendencias").
    return [sector]
  }

  // Sector genérico ("Otros") o nulo: extraer 1-2 palabras sustantivas
  // de la descripción del cliente (sin el nombre propio del negocio).
  if (descripcion) {
    const stopwords = new Set(['para', 'con', 'una', 'unos', 'unas', 'los', 'las', 'del', 'que', 'por', 'sus'])
    const words = descripcion
      .split(/\s+/)
      .map((w) => w.replace(/[^a-záéíóúñA-ZÁÉÍÓÚÑ]/g, ''))
      .filter((w) => w.length > 4 && !stopwords.has(w.toLowerCase()))
      .slice(0, 2)
    if (words.length > 0) return words
  }

  return ['marketing digital']
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { client_id?: string; force?: boolean }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON invalido' }, { status: 400 })
  }

  const { client_id, force } = body
  if (!client_id) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

  const supabase = createAdminClient()

  // Cargar cliente
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nombre, sector, descripcion')
    .eq('id', client_id)
    .single()

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Verificar frescura
  if (!force) {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existentes } = await supabase
      .from('oportunidades_actualidad')
      .select('id, tipo, created_at')
      .eq('client_id', client_id)
      .eq('activa', true)
      .gte('created_at', hace24h)
      .limit(1)

    if (existentes && existentes.length > 0) {
      // Hay datos frescos — devolver directamente
      const { data: todas } = await supabase
        .from('oportunidades_actualidad')
        .select('*')
        .eq('client_id', client_id)
        .eq('activa', true)
        .order('created_at', { ascending: false })

      const items = todas ?? []
      return NextResponse.json({
        trending:    items.filter((i) => i.tipo === 'trending'),
        estacional:  items.filter((i) => i.tipo === 'estacional'),
        cached: true,
      })
    }
  }

  console.log(`[Actualidad] Generando oportunidades para ${cliente.nombre}`)

  // PASO 1 — Google Trends via DataForSEO
  let trendingData: Array<{ keyword: string; avg_value: number }> = []
  try {
    const sectorKws = buildSectorKeywords(cliente.sector, cliente.descripcion)
    console.log(`[Actualidad] Buscando trends para: ${sectorKws.join(', ')}`)
    const trends = await getTrendingKeywords(sectorKws)
    trendingData = trends.filter((t) => t.avg_value > 20)
    console.log(`[Actualidad] ${trendingData.length} keywords con avg > 20`)
  } catch (err) {
    console.warn('[Actualidad] Error en DataForSEO Trends:', err instanceof Error ? err.message : err)
  }

  // PASO 2 + 3 — Claude: estacionales + analisis trending
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const ahora = new Date()
  const mesActual = ahora.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const meses3 = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() + i + 1, 1)
    return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  })

  const prompt = `Eres un estratega de contenidos experto en el mercado espanol.

CLIENTE: ${cliente.nombre}
SECTOR: ${cliente.sector ?? 'No especificado'}
DESCRIPCION: ${cliente.descripcion ?? 'No especificada'}
MES ACTUAL: ${mesActual}
PROXIMOS 3 MESES: ${meses3.join(', ')}

${trendingData.length > 0
    ? `KEYWORDS TRENDING (Google Trends, ultimos 7 dias):
${trendingData.map((t) => `- "${t.keyword}" (interes: ${t.avg_value}/100)`).join('\n')}`
    : 'No hay datos de Google Trends disponibles.'}

Genera un JSON con esta estructura EXACTA (sin markdown, solo JSON):
{
  "estacionales": [
    {
      "titulo": "Titulo de la oportunidad estacional",
      "keyword": "keyword sugerida",
      "descripcion": "Breve descripcion (1 frase)",
      "fecha_evento": "YYYY-MM-DD",
      "urgencia": "24h|semana|mes",
      "contexto": "Por que es relevante para este cliente"
    }
  ],
  "trending_analisis": [
    {
      "keyword": "keyword del trend",
      "relevancia": "alta|media|baja",
      "contexto": "Por que esta subiendo y como aprovecharlo",
      "titulo_sugerido": "Titulo de contenido sugerido"
    }
  ]
}

REGLAS:
- Genera 4-6 oportunidades estacionales de los proximos 3 meses
- Incluye: fechas clave del sector, eventos, temporadas, regulaciones
- Urgencia: "24h" si es esta semana, "semana" si es este mes, "mes" si es mas adelante
- Para trending: evalua la relevancia para ESTE cliente especifico
- Se concreto y accionable
- Responde SOLO con JSON`

  let claudeResult: {
    estacionales?: Array<{ titulo: string; keyword: string; descripcion: string; fecha_evento: string; urgencia: string; contexto: string }>
    trending_analisis?: Array<{ keyword: string; relevancia: string; contexto: string; titulo_sugerido: string }>
  } = {}

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      claudeResult = JSON.parse(jsonMatch[0])
    }
  } catch (err) {
    console.error('[Actualidad] Error Claude:', err instanceof Error ? err.message : err)
  }

  // Limpiar datos antiguos del cliente
  await supabase
    .from('oportunidades_actualidad')
    .delete()
    .eq('client_id', client_id)
    .lt('expires_at', new Date().toISOString())

  // Insertar estacionales
  const estacionales = (claudeResult.estacionales ?? []).map((e) => ({
    client_id,
    tipo: 'estacional' as const,
    titulo: e.titulo,
    keyword: e.keyword,
    descripcion: e.descripcion,
    urgencia: e.urgencia,
    fecha_evento: e.fecha_evento,
    contexto: e.contexto,
    relevancia: 'alta',
    activa: true,
    expires_at: e.fecha_evento
      ? new Date(new Date(e.fecha_evento).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }))

  // Insertar trending
  const trending = (claudeResult.trending_analisis ?? []).map((t) => ({
    client_id,
    tipo: 'trending' as const,
    titulo: t.titulo_sugerido ?? t.keyword,
    keyword: t.keyword,
    descripcion: t.contexto,
    relevancia: t.relevancia,
    contexto: t.contexto,
    trending_pct: trendingData.find((td) => td.keyword === t.keyword)?.avg_value ?? null,
    activa: true,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }))

  const allInserts = [...estacionales, ...trending]
  if (allInserts.length > 0) {
    const { error: insertErr } = await supabase
      .from('oportunidades_actualidad')
      .insert(allInserts)

    if (insertErr) console.error('[Actualidad] Insert error:', insertErr.message)
  }

  console.log(`[Actualidad] Generado: ${estacionales.length} estacionales + ${trending.length} trending`)

  return NextResponse.json({
    trending,
    estacional: estacionales,
    cached: false,
  })
}
