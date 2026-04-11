/**
 * POST /api/social/apply-revision
 *
 * Regenera las fases seleccionadas de la estrategia social aplicando
 * las instrucciones de revisión del cliente. Las fases se procesan
 * secuencialmente para respetar las dependencias entre ellas.
 *
 * Body: { clientId: string, instructions: string, phases: number[] }
 * Returns: { applied: number[], errors: Record<string, string> }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste, calcularCosteClaudeUSD } from '@/lib/costes'

export const maxDuration = 300 // Hasta 5 min — múltiples llamadas Claude secuenciales

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonbToText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && 'content' in val) {
    return String((val as { content: string }).content)
  }
  return ''
}

function textToJsonb(text: string | null | undefined): { content: string } | null {
  if (!text) return null
  return { content: text }
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin  : 'LinkedIn',
  twitter_x : 'Twitter/X',
  instagram : 'Instagram',
  facebook  : 'Facebook',
  tiktok    : 'TikTok',
  youtube   : 'YouTube',
}

// Prefijo de revisión que se inyecta al inicio del system prompt de cada fase
function revisionPrefix(instructions: string): string {
  return `INSTRUCCIONES DE REVISIÓN DEL CLIENTE:
${instructions}

Ten en cuenta estas instrucciones de revisión al regenerar el contenido. El cliente ha pedido cambios específicos que deben reflejarse en el resultado. Mantén todo lo que no debe cambiar según las instrucciones y actualiza únicamente lo que se ha pedido revisar.

---

`
}

// ─── Fase 2 — Estrategia de plataformas ──────────────────────────────────────

async function regeneratePhase2(
  clientId: string,
  instructions: string,
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  anthropic: Anthropic,
): Promise<void> {
  const [{ data: cliente }, { data: platforms }, { data: synthesis }] = await Promise.all([
    supabase.from('clientes').select('nombre, sector').eq('id', clientId).single(),
    supabase.from('social_platforms').select('platform, followers, posts_per_week, avg_engagement, score_brand_consistency, score_editorial_quality, score_activity, score_community, strategic_priority, strategic_conclusion').eq('client_id', clientId).order('platform'),
    supabase.from('social_audit_synthesis').select('main_strengths, main_weaknesses').eq('client_id', clientId).maybeSingle(),
  ])

  if (!cliente) throw new Error('Cliente no encontrado')

  const platformsSummary = (platforms ?? []).map((p) => {
    const name   = PLATFORM_LABELS[p.platform] ?? p.platform
    const scores = [p.score_brand_consistency, p.score_editorial_quality, p.score_activity, p.score_community].filter((v) => v != null) as number[]
    const avg    = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A'
    return `${name.toUpperCase()}:
  Seguidores: ${p.followers ?? 'N/D'} | Posts/semana: ${p.posts_per_week ?? 'N/D'} | Engagement: ${p.avg_engagement ? `${p.avg_engagement}%` : 'N/D'}
  Puntuación media: ${avg}/5 (marca: ${p.score_brand_consistency ?? '-'}, calidad: ${p.score_editorial_quality ?? '-'}, actividad: ${p.score_activity ?? '-'}, comunidad: ${p.score_community ?? '-'})
  Conclusión: ${p.strategic_conclusion ?? '(sin conclusión)'}
  Prioridad asignada: ${p.strategic_priority ?? 'sin asignar'}`
  }).join('\n\n')

  const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (sector: ${cliente.sector})` : ''}

AUDITORÍA POR PLATAFORMAS:
${platformsSummary || '(Sin plataformas auditadas)'}

SÍNTESIS DE AUDITORÍA:
Fortalezas: ${synthesis?.main_strengths ?? '(no disponible)'}
Debilidades: ${synthesis?.main_weaknesses ?? '(no disponible)'}

Genera la estrategia de plataformas en tres bloques:

BLOQUE 1 — DECISIONES POR PLATAFORMA
Para cada plataforma auditada, incluir:
- Veredicto claro (ej: "ACTIVACIÓN PLENA", "RECALIBRACIÓN", "MODO RESIDUAL", "DESCARTAR")
- Rol específico que cumple en el ecosistema de marca
- Nivel de inversión editorial recomendado
- 2-3 acciones concretas inmediatas

BLOQUE 2 — ARQUITECTURA DEL ECOSISTEMA
Cómo se relacionan las plataformas entre sí.
Qué plataforma lidera, cuáles amplifican, cuáles distribuyen.
Flujo de contenido entre canales.

BLOQUE 3 — DIFERENCIACIÓN EDITORIAL
Qué hace diferente el contenido en cada plataforma activa.
Tono, formato y enfoque específico de cada una.

Extensión: 150-200 palabras por bloque. Texto continuo, sin bullets excesivos. Lenguaje directo y profesional.

Responde SOLO con JSON sin markdown:
{
  "platformDecisions": "...",
  "channelArchitecture": "...",
  "editorialDifferentiation": "..."
}`

  const response = await anthropic.messages.create({
    model     : 'claude-sonnet-4-5',
    max_tokens: 4096,
    system    : revisionPrefix(instructions) + `Eres un consultor senior de social media especializado en estrategia editorial para agencias de contenidos B2B. Tu trabajo es tomar los resultados de una auditoría de redes sociales y convertirlos en decisiones estratégicas claras y accionables.

Las decisiones deben ser razonadas, no genéricas. Cada plataforma recibe un veredicto claro: qué hacer, por qué y con qué nivel de inversión editorial. Evita recomendaciones vagas. Si una plataforma no vale la pena, dilo.`,
    messages  : [{ role: 'user', content: userPrompt }],
  })

  const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude no devolvió JSON válido en Fase 2')

  const result = JSON.parse(jsonMatch[0]) as {
    platformDecisions      : string
    channelArchitecture    : string
    editorialDifferentiation: string
  }

  const now = new Date().toISOString()
  await supabase.from('social_strategy').upsert(
    {
      client_id              : clientId,
      platform_decisions     : result.platformDecisions,
      channel_architecture   : result.channelArchitecture,
      editorial_differentiation: result.editorialDifferentiation,
      phase_2_completed      : false,
      updated_at             : now,
    },
    { onConflict: 'client_id' },
  )

  guardarRegistroCoste({
    cliente_id    : clientId,
    tipo_operacion: 'copiloto',
    agente        : 'social-apply-revision-phase2',
    modelo        : 'claude-sonnet-4-5',
    tokens_input  : response.usage.input_tokens,
    tokens_output : response.usage.output_tokens,
    coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
  }).catch(console.error)
}

// ─── Fase 3 — Arquitectura de contenidos ──────────────────────────────────────

async function regeneratePhase3(
  clientId: string,
  instructions: string,
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  anthropic: Anthropic,
): Promise<void> {
  const [{ data: cliente }, { data: platforms }, { data: strategy }] = await Promise.all([
    supabase.from('clientes').select('nombre, sector').eq('id', clientId).single(),
    supabase.from('social_platforms').select('platform, strategic_priority, strategic_conclusion').eq('client_id', clientId).order('platform'),
    supabase.from('social_strategy').select('platform_decisions, channel_architecture').eq('client_id', clientId).maybeSingle(),
  ])

  if (!cliente) throw new Error('Cliente no encontrado')

  const activePlatforms = (platforms ?? [])
    .filter((p) => p.strategic_priority === 'alta' || p.strategic_priority === 'mantener' || !p.strategic_priority)
    .map((p) => PLATFORM_LABELS[p.platform] ?? p.platform)

  const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (sector: ${cliente.sector})` : ''}

ESTRATEGIA DE PLATAFORMAS (Fase 2):
Decisiones por plataforma:
${strategy?.platform_decisions ?? '(no disponible)'}

Arquitectura del ecosistema:
${strategy?.channel_architecture ?? '(no disponible)'}

PLATAFORMAS ACTIVAS: ${activePlatforms.join(', ') || '(no definidas)'}

Genera la arquitectura de contenidos en cuatro bloques:

BLOQUE 1 — PILARES EDITORIALES
3-5 pilares con:
- Nombre del pilar
- Territorio temático (de qué trata)
- Ángulo permanente (cómo lo aborda la marca de forma única)
- Ejemplos de temas tipo
- Distribución por plataforma (en cuáles aplica)

BLOQUE 2 — FORMATOS POR PLATAFORMA
Para cada plataforma activa:
- 3-5 formatos nativos recomendados
- Nombre interno para el equipo
- Función editorial de cada formato
- Frecuencia recomendada

BLOQUE 3 — CADENCIA DE PUBLICACIÓN
Posts por semana por plataforma.
Distribución por días de la semana.
Horarios recomendados si son relevantes.

BLOQUE 4 — CALENDARIO TIPO SEMANAL
Descripción de una semana tipo: qué se publica cada día en cada plataforma activa.

Extensión: 150-200 palabras por bloque. Lenguaje concreto y operativo.

Responde SOLO con JSON sin markdown:
{
  "editorialPillars": "...",
  "formatsByPlatform": "...",
  "publishingCadence": "...",
  "calendarTemplate": "..."
}`

  const response = await anthropic.messages.create({
    model     : 'claude-sonnet-4-5',
    max_tokens: 5120,
    system    : revisionPrefix(instructions) + `Eres un consultor senior de social media especializado en arquitectura de contenidos para marcas B2B. Tu trabajo es definir la estructura editorial que sostendrá toda la producción de contenido social: pilares, formatos y cadencia.

Los pilares no son categorías temáticas genéricas: son posiciones intelectuales que la marca ocupa. Un pilar editorial dice qué lugar único ocupa la marca en la conversación de su sector, no solo sobre qué temas habla.`,
    messages  : [{ role: 'user', content: userPrompt }],
  })

  const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude no devolvió JSON válido en Fase 3')

  const result = JSON.parse(jsonMatch[0]) as {
    editorialPillars  : string
    formatsByPlatform : string
    publishingCadence : string
    calendarTemplate  : string
  }

  const now = new Date().toISOString()
  await supabase.from('social_content_architecture').upsert(
    {
      client_id           : clientId,
      editorial_pillars   : textToJsonb(result.editorialPillars),
      formats_by_platform : textToJsonb(result.formatsByPlatform),
      publishing_cadence  : textToJsonb(result.publishingCadence),
      calendar_template   : result.calendarTemplate,
      phase_3_completed   : false,
      updated_at          : now,
    },
    { onConflict: 'client_id' },
  )

  guardarRegistroCoste({
    cliente_id    : clientId,
    tipo_operacion: 'copiloto',
    agente        : 'social-apply-revision-phase3',
    modelo        : 'claude-sonnet-4-5',
    tokens_input  : response.usage.input_tokens,
    tokens_output : response.usage.output_tokens,
    coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
  }).catch(console.error)
}

// ─── Fase 4 — Tono y voz de marca ────────────────────────────────────────────

async function regeneratePhase4(
  clientId: string,
  instructions: string,
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  anthropic: Anthropic,
): Promise<void> {
  const [{ data: cliente }, { data: platforms }, { data: strategy }, { data: architecture }, brandContextResult] = await Promise.all([
    supabase.from('clientes').select('nombre, sector').eq('id', clientId).single(),
    supabase.from('social_platforms').select('platform, strategic_priority').eq('client_id', clientId).order('platform'),
    supabase.from('social_strategy').select('platform_decisions').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_content_architecture').select('editorial_pillars').eq('client_id', clientId).maybeSingle(),
    supabase.from('brand_context').select('tone_of_voice, style_keywords, restrictions, raw_summary').eq('client_id', clientId).maybeSingle().then(
      (r) => r,
      () => ({ data: null, error: null }),
    ),
  ])

  if (!cliente) throw new Error('Cliente no encontrado')

  const brandContext = (brandContextResult as { data: any } | null)?.data ?? null

  const activePlatforms = (platforms ?? [])
    .filter((p) => p.strategic_priority === 'alta' || p.strategic_priority === 'mantener' || !p.strategic_priority)
    .map((p) => PLATFORM_LABELS[p.platform] ?? p.platform)

  const editorialPillarsText = jsonbToText(architecture?.editorial_pillars).substring(0, 500)

  const brandContextSection = brandContext
    ? `
IDENTIDAD DE MARCA (del brandbook):
${brandContext.tone_of_voice ? `Tono de voz: ${brandContext.tone_of_voice}` : ''}
${brandContext.style_keywords?.length ? `Keywords de estilo: ${brandContext.style_keywords.join(', ')}` : ''}
${brandContext.restrictions ? `Restricciones de marca: ${brandContext.restrictions}` : ''}
${brandContext.raw_summary ? `Resumen de marca: ${String(brandContext.raw_summary).substring(0, 500)}` : ''}
`.trim()
    : ''

  const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (sector: ${cliente.sector})` : ''}

${brandContextSection}

PILARES EDITORIALES (Fase 3):
${editorialPillarsText || '(no disponibles)'}

PLATAFORMAS ACTIVAS: ${activePlatforms.join(', ') || '(no definidas)'}

ESTRATEGIA (extracto Fase 2):
${strategy?.platform_decisions ? String(strategy.platform_decisions).substring(0, 400) : '(no disponible)'}

Genera las guidelines de tono y voz en cuatro bloques:

BLOQUE 1 — MANUAL DE VOZ PARA REDES
5 atributos de voz con:
- Nombre del atributo
- Qué significa en la práctica
- Cómo suena cuando funciona bien
- Cómo suena cuando falla (anti-ejemplo)

BLOQUE 2 — REGISTRO POR PLATAFORMA
Para cada plataforma activa:
- Longitud típica de posts
- Tono específico (más formal/informal, analítico/narrativo...)
- Estructura recomendada de posts
- Uso de emojis (cantidad y función)
- Uso de hashtags (cantidad, posición)
- Dónde van los links

BLOQUE 3 — LO QUE LA MARCA NUNCA DICE
10-15 reglas concretas de lo que está prohibido: expresiones, tonos, estructuras o enfoques que rompen la voz editorial de la marca.

BLOQUE 4 — CONSISTENCIA EN EQUIPO DISTRIBUIDO
Checklist de publicación universal (5-8 puntos).
Proceso de revisión y aprobación.

Extensión: 150-200 palabras por bloque. Operativo y concreto.

Responde SOLO con JSON sin markdown:
{
  "voiceManual": "...",
  "registerByPlatform": "...",
  "editorialRedLines": "...",
  "consistencyGuidelines": "..."
}`

  const response = await anthropic.messages.create({
    model     : 'claude-sonnet-4-5',
    max_tokens: 5120,
    system    : revisionPrefix(instructions) + `Eres un consultor senior especializado en identidad editorial y brand voice para redes sociales. Tu trabajo es definir cómo una marca habla en redes: no solo el tono abstracto, sino las reglas concretas que un community manager puede aplicar en cada post.

Las guidelines deben ser operativas, no teóricas. Cada regla debe poder aplicarse en 5 segundos antes de publicar.`,
    messages  : [{ role: 'user', content: userPrompt }],
  })

  const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude no devolvió JSON válido en Fase 4')

  const result = JSON.parse(jsonMatch[0]) as {
    voiceManual           : string
    registerByPlatform    : string
    editorialRedLines     : string
    consistencyGuidelines : string
  }

  const now = new Date().toISOString()
  await supabase.from('social_brand_voice').upsert(
    {
      client_id              : clientId,
      voice_manual           : result.voiceManual,
      register_by_platform   : textToJsonb(result.registerByPlatform),
      editorial_red_lines    : result.editorialRedLines,
      consistency_guidelines : result.consistencyGuidelines,
      phase_4_completed      : false,
      updated_at             : now,
    },
    { onConflict: 'client_id' },
  )

  guardarRegistroCoste({
    cliente_id    : clientId,
    tipo_operacion: 'copiloto',
    agente        : 'social-apply-revision-phase4',
    modelo        : 'claude-sonnet-4-5',
    tokens_input  : response.usage.input_tokens,
    tokens_output : response.usage.output_tokens,
    coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
  }).catch(console.error)
}

// ─── Fase 5 — KPIs y métricas ─────────────────────────────────────────────────

async function regeneratePhase5(
  clientId: string,
  instructions: string,
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  anthropic: Anthropic,
): Promise<void> {
  const [{ data: cliente }, { data: platforms }, { data: strategy }, { data: architecture }] = await Promise.all([
    supabase.from('clientes').select('nombre, sector').eq('id', clientId).single(),
    supabase.from('social_platforms').select('platform, strategic_priority, followers, avg_engagement, posts_per_week').eq('client_id', clientId).order('platform'),
    supabase.from('social_strategy').select('platform_decisions').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_content_architecture').select('publishing_cadence').eq('client_id', clientId).maybeSingle(),
  ])

  if (!cliente) throw new Error('Cliente no encontrado')

  const activePlatformsSummary = (platforms ?? [])
    .filter((p) => p.strategic_priority === 'alta' || p.strategic_priority === 'mantener' || !p.strategic_priority)
    .map((p) => {
      const name = PLATFORM_LABELS[p.platform] ?? p.platform
      return `${name}: ${p.followers ?? 0} seguidores | Engagement: ${p.avg_engagement ? `${p.avg_engagement}%` : 'N/D'} | Posts/semana actual: ${p.posts_per_week ?? 'N/D'}`
    }).join('\n')

  const cadenceText = jsonbToText(architecture?.publishing_cadence).substring(0, 400)

  const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (sector: ${cliente.sector})` : ''}

PLATAFORMAS ACTIVAS Y MÉTRICAS ACTUALES:
${activePlatformsSummary || '(sin datos de plataformas)'}

ESTRATEGIA DE PLATAFORMAS:
${strategy?.platform_decisions?.substring(0, 400) ?? '(no disponible)'}

CADENCIA PLANIFICADA:
${cadenceText || '(no disponible)'}

Genera el sistema de KPIs en tres bloques:

BLOQUE 1 — INDICADORES POR OBJETIVO
Organizar en tres niveles:
- Métricas de autoridad
- Métricas de rendimiento por plataforma
- Métricas de actividad
Para cada KPI incluir nombre, qué mide, cómo se obtiene, target a 3 y 12 meses.

BLOQUE 2 — METODOLOGÍA DE MEDICIÓN
Herramientas, frecuencia de medición y consolidación de datos.

BLOQUE 3 — SISTEMA DE REPORTING
Estructura del reporte mensual y revisión trimestral.

Extensión: 150-200 palabras por bloque.

Responde SOLO con JSON sin markdown:
{
  "kpisByObjective": "...",
  "measurementMethodology": "...",
  "reportingSystem": "..."
}`

  const response = await anthropic.messages.create({
    model     : 'claude-sonnet-4-5',
    max_tokens: 4096,
    system    : revisionPrefix(instructions) + `Eres un consultor senior de social media especializado en medición de resultados y reporting para clientes B2B. Tu trabajo es definir un sistema de KPIs que mida lo que realmente importa: si la marca está construyendo autoridad y alcanzando sus objetivos estratégicos, no solo si acumula likes.`,
    messages  : [{ role: 'user', content: userPrompt }],
  })

  const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude no devolvió JSON válido en Fase 5')

  const result = JSON.parse(jsonMatch[0]) as {
    kpisByObjective        : string
    measurementMethodology : string
    reportingSystem        : string
  }

  const now = new Date().toISOString()
  await supabase.from('social_kpis').upsert(
    {
      client_id              : clientId,
      kpis_by_objective      : textToJsonb(result.kpisByObjective),
      measurement_methodology: result.measurementMethodology,
      reporting_system       : result.reportingSystem,
      phase_5_completed      : false,
      updated_at             : now,
    },
    { onConflict: 'client_id' },
  )

  guardarRegistroCoste({
    cliente_id    : clientId,
    tipo_operacion: 'copiloto',
    agente        : 'social-apply-revision-phase5',
    modelo        : 'claude-sonnet-4-5',
    tokens_input  : response.usage.input_tokens,
    tokens_output : response.usage.output_tokens,
    coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
  }).catch(console.error)
}

// ─── Fase 6 — Plan de acción ──────────────────────────────────────────────────

async function regeneratePhase6(
  clientId: string,
  instructions: string,
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  anthropic: Anthropic,
): Promise<void> {
  const [{ data: cliente }, { data: platforms }, { data: strategy }, { data: architecture }, { data: kpis }] = await Promise.all([
    supabase.from('clientes').select('nombre, sector').eq('id', clientId).single(),
    supabase.from('social_platforms').select('platform, strategic_priority').eq('client_id', clientId).order('platform'),
    supabase.from('social_strategy').select('platform_decisions').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_content_architecture').select('publishing_cadence').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_kpis').select('kpis_by_objective').eq('client_id', clientId).maybeSingle(),
  ])

  if (!cliente) throw new Error('Cliente no encontrado')

  const activePlatforms = (platforms ?? [])
    .filter((p) => p.strategic_priority === 'alta' || p.strategic_priority === 'mantener' || !p.strategic_priority)
    .map((p) => PLATFORM_LABELS[p.platform] ?? p.platform)

  const cadenceText  = jsonbToText(architecture?.publishing_cadence).substring(0, 300)
  const kpisText     = jsonbToText(kpis?.kpis_by_objective).substring(0, 300)
  const strategyText = strategy?.platform_decisions?.substring(0, 300) ?? ''

  const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (sector: ${cliente.sector})` : ''}

RESUMEN ESTRATÉGICO:
Plataformas activas: ${activePlatforms.join(', ') || '(no definidas)'}
Cadencia planificada: ${cadenceText || '(no disponible)'}
KPIs principales: ${kpisText || '(no disponible)'}

CONTEXTO:
${strategyText || '(no disponible)'}

Genera el plan de acción en tres bloques:

BLOQUE 1 — ROADMAP DE IMPLEMENTACIÓN
Tres horizontes: Fundación (1-30 días), Activación (31-90 días), Consolidación (4-12 meses).
Para cada horizonte: objetivos, acciones concretas e hito de validación.

BLOQUE 2 — PRIMEROS 90 DÍAS EN DETALLE
Semana a semana para el Horizonte 1. Bloque a bloque para el Horizonte 2.
Para cada período: acciones, responsable y entregable.

BLOQUE 3 — EQUIPO Y RECURSOS
Roles necesarios con dedicación estimada.
Stack tecnológico recomendado.
Modelo de coordinación.

Extensión: 200-250 palabras por bloque.

Responde SOLO con JSON sin markdown:
{
  "roadmap": "...",
  "first90Days": "...",
  "teamResources": "..."
}`

  const response = await anthropic.messages.create({
    model     : 'claude-sonnet-4-5',
    max_tokens: 5120,
    system    : revisionPrefix(instructions) + `Eres un consultor senior de social media especializado en implementación y gestión de cuentas B2B. Tu trabajo es traducir una estrategia completa en un plan de acción realista: qué hace quién, cuándo y con qué recursos.`,
    messages  : [{ role: 'user', content: userPrompt }],
  })

  const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude no devolvió JSON válido en Fase 6')

  const result = JSON.parse(jsonMatch[0]) as {
    roadmap       : string
    first90Days   : string
    teamResources : string
  }

  const now = new Date().toISOString()
  await supabase.from('social_action_plan').upsert(
    {
      client_id    : clientId,
      roadmap      : textToJsonb(result.roadmap),
      first_90_days: result.first90Days,
      team_resources: result.teamResources,
      phase_6_completed: false,
      updated_at   : now,
    },
    { onConflict: 'client_id' },
  )

  guardarRegistroCoste({
    cliente_id    : clientId,
    tipo_operacion: 'copiloto',
    agente        : 'social-apply-revision-phase6',
    modelo        : 'claude-sonnet-4-5',
    tokens_input  : response.usage.input_tokens,
    tokens_output : response.usage.output_tokens,
    coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
  }).catch(console.error)
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: { clientId: string; instructions: string; phases: number[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId, instructions, phases } = body
  if (!clientId)    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  if (!instructions?.trim()) return NextResponse.json({ error: 'instructions requerido' }, { status: 400 })
  if (!phases?.length) return NextResponse.json({ error: 'phases requerido' }, { status: 400 })

  // Solo fases válidas 2-6, ordenadas
  const validPhases = Array.from(new Set(phases.filter((n) => n >= 2 && n <= 6))).sort()

  const supabase  = createAdminClient()
  const anthropic = new Anthropic()

  const applied : number[]              = []
  const errors  : Record<string, string> = {}

  // Procesamiento secuencial para respetar dependencias
  for (const phase of validPhases) {
    try {
      switch (phase) {
        case 2: await regeneratePhase2(clientId, instructions, supabase, anthropic); break
        case 3: await regeneratePhase3(clientId, instructions, supabase, anthropic); break
        case 4: await regeneratePhase4(clientId, instructions, supabase, anthropic); break
        case 5: await regeneratePhase5(clientId, instructions, supabase, anthropic); break
        case 6: await regeneratePhase6(clientId, instructions, supabase, anthropic); break
      }
      applied.push(phase)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[social/apply-revision] Error en Fase ${phase}:`, msg)
      errors[String(phase)] = msg
    }
  }

  // Reset client_validated si alguna fase se aplicó
  if (applied.length > 0) {
    await supabase.from('social_audit_synthesis').upsert(
      {
        client_id       : clientId,
        client_validated: false,
        updated_at      : new Date().toISOString(),
      },
      { onConflict: 'client_id' },
    )

    // Guardar registro de revisión
    await supabase.from('social_strategy_revisions').insert({
      client_id             : clientId,
      revision_instructions : instructions,
      affected_phases       : applied.map(String),
      status                : 'aplicada',
      applied_at            : new Date().toISOString(),
    })
  }

  return NextResponse.json({ applied, errors })
}
