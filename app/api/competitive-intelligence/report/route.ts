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
  nota_metodologica: string
  resumen_ejecutivo: string
  analisis_por_competidor: Array<{
    nombre:                    string
    plataforma:                string
    num_ads:                   number
    formatos:                  Record<string, number>
    dias_promedio_activo:      number | null
    consistencia_inversion:    string
    mensajes_clave:            string[]
    ctas_usados:               string[]
    observaciones:             string[]
  }>
  patrones_generales: {
    formatos_dominantes:          string[]
    estrategias_de_inversion:     string[]
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
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
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
      .select('competitor_id, platform, copy_text, cta_type, creative_url, ad_snapshot_url, started_running, is_active, raw_data')
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

  // Agrupar ads por competitor con datos enriquecidos
  const compMap = new Map(competitors.map((c) => [c.id, { name: c.page_name, platform: c.platform }]))
  const adsByComp: Record<string, typeof ads> = {}

  for (const ad of ads) {
    const info = compMap.get(ad.competitor_id)
    const name = info?.name ?? 'Desconocido'
    if (!adsByComp[name]) adsByComp[name] = []
    adsByComp[name].push(ad)
  }

  // Construir el prompt de análisis
  const toneOfVoice   = (contextData?.tone_of_voice  as string | null) ?? 'Profesional y cercano'
  const styleKeywords = (contextData?.style_keywords as string[] | null) ?? []
  const restrictions  = (contextData?.restrictions   as string | null) ?? 'Ninguna'

  let adsSection = ''
  for (const [pageName, pageAds] of Object.entries(adsByComp)) {
    const platform = compMap.get(pageAds[0]?.competitor_id ?? '')?.platform ?? 'desconocida'

    // Calcular stats agregados
    const formats: Record<string, number> = {}
    const daysShown: number[] = []
    for (const ad of pageAds) {
      const fmt = (ad.cta_type as string) ?? 'desconocido'
      formats[fmt] = (formats[fmt] ?? 0) + 1
      const raw = ad.raw_data as Record<string, unknown> | null
      if (raw?.total_days_shown && typeof raw.total_days_shown === 'number') {
        daysShown.push(raw.total_days_shown)
      }
    }
    const avgDays = daysShown.length > 0
      ? Math.round(daysShown.reduce((a, b) => a + b, 0) / daysShown.length)
      : null

    adsSection += `\n### ${pageName} — plataforma: ${platform} (${pageAds.length} anuncios activos)\n`
    adsSection += `Formatos: ${Object.entries(formats).map(([f, n]) => `${f}: ${n}`).join(', ')}\n`
    if (avgDays != null) adsSection += `Días promedio activo por anuncio: ${avgDays}\n`

    for (let i = 0; i < Math.min(pageAds.length, 15); i++) {
      const ad = pageAds[i]
      const raw = ad.raw_data as Record<string, unknown> | null
      const parts: string[] = []

      // Meta ads tienen copy_text; Google ads no
      if (ad.copy_text) parts.push(`Copy: "${ad.copy_text}"`)
      parts.push(`Formato: ${ad.cta_type ?? 'desconocido'}`)
      if (raw?.total_days_shown) parts.push(`${raw.total_days_shown} días activo`)
      if (ad.creative_url) parts.push('Tiene imagen/vídeo')
      if (ad.started_running) {
        parts.push(`Desde: ${new Date(ad.started_running).toLocaleDateString('es-ES')}`)
      }
      adsSection += `${i + 1}. ${parts.join(' | ')}\n`
    }
  }

  const systemPrompt = `Eres un estratega de marketing digital experto en análisis competitivo para el mercado español.
Tu análisis es preciso, accionable y orientado a resultados.
Responde EXCLUSIVAMENTE con un objeto JSON válido (sin markdown, sin comentarios).

IMPORTANTE: Los datos de Google Ads Transparency Center NO incluyen el texto de los anuncios (headline/description).
Para anuncios de Google, analiza: formatos usados (text/image/video), consistencia temporal (días activos),
volumen de anuncios y estrategia de inversión. NO inventes copy ni mensajes que no aparezcan en los datos.
Para anuncios de Meta (si los hay), SÍ hay copy_text disponible — analízalo normalmente.`

  const userPrompt = `Analiza los anuncios activos de la competencia de "${clienteData.nombre}" y genera un informe estratégico.

CONTEXTO DEL CLIENTE:
- Tono de voz: ${toneOfVoice}
- Estilo: ${styleKeywords.join(', ') || 'no especificado'}
- Restricciones: ${restrictions}

ANUNCIOS DE LA COMPETENCIA (últimos 30 días):
${adsSection}

NOTA: Para anuncios de Google, el texto (headline/description) no está disponible públicamente.
Centra el análisis de Google en formatos, volumen, consistencia de inversión y estrategia de medios.
Si hay anuncios de Meta con copy_text, analiza también sus mensajes.

Genera un JSON con esta estructura exacta:
{
  "nota_metodologica": "Análisis basado en datos de Google Ads Transparency y/o Meta Ad Library. El texto de los anuncios de Google no es accesible públicamente — el análisis se centra en formatos, volumen e inversión.",
  "resumen_ejecutivo": "Párrafo de 3-4 frases resumiendo el panorama competitivo: volumen de inversión, formatos preferidos y nivel de actividad",
  "analisis_por_competidor": [
    {
      "nombre": "Nombre del competidor",
      "plataforma": "google o meta",
      "num_ads": 5,
      "formatos": {"text": 3, "image": 2},
      "dias_promedio_activo": 120,
      "consistencia_inversion": "Alta/Media/Baja — descripción de la regularidad de inversión",
      "mensajes_clave": ["solo si hay copy_text de Meta, si no dejar vacío"],
      "ctas_usados": ["formato 1", "formato 2"],
      "observaciones": ["observación sobre la estrategia de este competidor"]
    }
  ],
  "patrones_generales": {
    "formatos_dominantes": ["formato 1"],
    "estrategias_de_inversion": ["patrón de inversión observado"],
    "propuestas_de_valor_comunes": ["propuesta inferida del posicionamiento"]
  },
  "oportunidades": ["oportunidad 1", "oportunidad 2", "oportunidad 3"],
  "recomendaciones": [
    {
      "prioridad": "alta",
      "recomendacion": "Acción concreta sobre formatos o inversión",
      "razonamiento": "Por qué hacerlo basándote en los datos"
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
