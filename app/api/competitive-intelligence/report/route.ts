/**
 * POST /api/competitive-intelligence/report
 *
 * Genera un informe de análisis competitivo usando Claude.
 * Analiza los ads activos de los competidores del cliente de los últimos 30 días.
 *
 * Body: { client_id: string }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

interface ReportContent {
  resumen_ejecutivo: string
  analisis_por_competidor: Array<{
    nombre:              string
    num_ads:             number
    mensajes_clave:      string[]
    ctas_usados:         string[]
    tematicas_visuales:  string[]
  }>
  patrones_generales: {
    formatos_dominantes:          string[]
    mensajes_recurrentes:         string[]
    propuestas_de_valor_comunes:  string[]
  }
  oportunidades:      string[]
  recomendaciones: Array<{
    prioridad:      'alta' | 'media' | 'baja'
    recomendacion:  string
    razonamiento:   string
  }>
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { client_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { client_id } = body
  if (!client_id) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const periodEnd   = new Date()
  const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Cargar datos en paralelo
  const [
    { data: clienteData },
    { data: contextData },
    { data: competitors },
    { data: ads },
  ] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('id', client_id).single(),
    supabase
      .from('brand_context')
      .select('tone_of_voice, style_keywords, restrictions')
      .eq('client_id', client_id)
      .single(),
    supabase
      .from('competitors')
      .select('id, page_name, platform')
      .eq('client_id', client_id)
      .eq('active', true),
    supabase
      .from('competitor_ads')
      .select('competitor_id, copy_text, cta_type, started_running, is_active')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .gte('first_seen_at', periodStart.toISOString()),
  ])

  if (!clienteData) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  if (!competitors || competitors.length === 0) {
    return NextResponse.json({ error: 'No hay competidores configurados para este cliente' }, { status: 400 })
  }
  if (!ads || ads.length === 0) {
    return NextResponse.json({ error: 'No hay ads de la competencia. Ejecuta un escaneo primero.' }, { status: 400 })
  }

  // Agrupar ads por competitor
  const compMap = new Map(competitors.map((c) => [c.id, c.page_name]))
  const adsByComp = new Map<string, typeof ads>()

  for (const ad of ads) {
    const name = compMap.get(ad.competitor_id) ?? 'Desconocido'
    if (!adsByComp.has(name)) adsByComp.set(name, [])
    adsByComp.get(name)!.push(ad)
  }

  // Construir el prompt de análisis
  const toneOfVoice   = (contextData?.tone_of_voice  as string | null) ?? 'Profesional y cercano'
  const styleKeywords = (contextData?.style_keywords as string[] | null) ?? []
  const restrictions  = (contextData?.restrictions   as string | null) ?? 'Ninguna'

  let adsSection = ''
  for (const [pageName, pageAds] of adsByComp.entries()) {
    adsSection += `\n### ${pageName} (${pageAds.length} anuncios activos)\n`
    for (let i = 0; i < Math.min(pageAds.length, 15); i++) {
      const ad = pageAds[i]
      adsSection += `${i + 1}. Copy: "${ad.copy_text ?? '(sin texto)'}" | CTA: ${ad.cta_type ?? 'desconocido'}`
      if (ad.started_running) {
        adsSection += ` | Activo desde: ${new Date(ad.started_running).toLocaleDateString('es-ES')}`
      }
      adsSection += '\n'
    }
  }

  const systemPrompt = `Eres un estratega de marketing digital experto en análisis competitivo para el mercado español.
Tu análisis es preciso, accionable y orientado a resultados.
Responde EXCLUSIVAMENTE con un objeto JSON válido (sin markdown, sin comentarios).`

  const userPrompt = `Analiza los anuncios activos de la competencia de "${clienteData.nombre}" y genera un informe estratégico.

CONTEXTO DEL CLIENTE:
- Tono de voz: ${toneOfVoice}
- Estilo: ${styleKeywords.join(', ') || 'no especificado'}
- Restricciones: ${restrictions}

ANUNCIOS DE LA COMPETENCIA (últimos 30 días):
${adsSection}

Genera un JSON con esta estructura exacta:
{
  "resumen_ejecutivo": "Párrafo de 3-4 frases resumiendo el panorama competitivo",
  "analisis_por_competidor": [
    {
      "nombre": "Nombre del competidor",
      "num_ads": 5,
      "mensajes_clave": ["mensaje 1", "mensaje 2"],
      "ctas_usados": ["Saber más", "Inscríbete"],
      "tematicas_visuales": ["tema 1", "tema 2"]
    }
  ],
  "patrones_generales": {
    "formatos_dominantes": ["formato 1"],
    "mensajes_recurrentes": ["mensaje 1"],
    "propuestas_de_valor_comunes": ["propuesta 1"]
  },
  "oportunidades": ["oportunidad 1", "oportunidad 2", "oportunidad 3"],
  "recomendaciones": [
    {
      "prioridad": "alta",
      "recomendacion": "Acción concreta",
      "razonamiento": "Por qué hacerlo"
    }
  ]
}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let reportContent: ReportContent
  try {
    const message = await anthropic.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 3000,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('Claude no devolvió texto')

    const raw      = textBlock.text.trim()
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr  = jsonMatch ? jsonMatch[1].trim() : raw

    reportContent = JSON.parse(jsonStr) as ReportContent
  } catch (err) {
    return NextResponse.json(
      { error: `Error generando informe: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    )
  }

  // Guardar informe en Supabase
  const { data: savedReport, error: saveError } = await supabase
    .from('ci_reports')
    .insert({
      client_id,
      period_start:          periodStart.toISOString(),
      period_end:            periodEnd.toISOString(),
      report_type:           'benchmark',
      competitors_analyzed:  competitors.length,
      ads_analyzed:          ads.length,
      content:               reportContent as unknown as Record<string, unknown>,
    })
    .select()
    .single()

  if (saveError) {
    console.error('[ci-report] Error guardando:', saveError.message)
  }

  return NextResponse.json({
    report:   savedReport ?? { content: reportContent },
    stats: {
      competitors_analyzed: competitors.length,
      ads_analyzed:         ads.length,
      period_days:          30,
    },
  })
}
