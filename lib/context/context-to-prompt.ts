/**
 * lib/context/context-to-prompt.ts
 *
 * Converts a ClientContext into a concise string suitable for
 * injection into AI generation prompts.
 *
 * Principio de diseño: el contexto describe la REALIDAD del cliente
 * (qué vende, qué ya ha publicado, qué mide su analítica). NO da
 * instrucciones editoriales. Cualquier recomendación estratégica que
 * venga en los datos de origen se presenta enmarcada como opinión de
 * terceros, nunca como directriz para el modelo.
 *
 * Usage:
 *   const ctx = await buildClientContext(supabase, clientId)
 *   if (ctx) prompt += '\n\n' + contextToPrompt(ctx)
 */

import type { ClientContext } from './client-context'

/** Cap del resumen de marca — evita que un brandbook entero domine el prompt */
const BRAND_SUMMARY_MAX = 800

/** Cap de la descripción corporativa — suele contener los servicios en prosa */
const DESCRIPCION_MAX = 1000

export function contextToPrompt(ctx: ClientContext): string {
  const sections: string[] = []

  // ── Client identity ──────────────────────────────────────
  const identityLines = [
    `CLIENTE: ${ctx.client.name}`,
    ctx.client.sector                ? `Sector: ${ctx.client.sector}` : null,
    ctx.client.web                   ? `Web: ${ctx.client.web}` : null,
    ctx.client.descripcion           ? `Descripción: ${ctx.client.descripcion.substring(0, DESCRIPCION_MAX)}` : null,
    ctx.client.identidad_corporativa ? `Identidad de marca: ${ctx.client.identidad_corporativa.substring(0, 200)}` : null,
    ctx.client.tono_voz              ? `Tono de voz: ${ctx.client.tono_voz}` : null,
    ctx.client.perfil_lector         ? `Perfil lector: ${ctx.client.perfil_lector}` : null,
    ctx.client.competidores          ? `Competidores editoriales: ${ctx.client.competidores.substring(0, 200)}` : null,
  ].filter((l): l is string => l !== null)

  sections.push(identityLines.join('\n'))

  // ── Servicios y productos ────────────────────────────────
  // Sin truncar: define la intención comercial del cliente y determina
  // qué keywords son transaccionales aunque suenen informacionales.
  if (ctx.client.servicios_productos.length > 0) {
    const lines = ctx.client.servicios_productos.map((s) => `  - ${s}`).join('\n')
    sections.push(
      'SERVICIOS Y PRODUCTOS QUE VENDE EL CLIENTE:\n' +
      `${lines}\n` +
      '  (Cualquier consulta sobre estos elementos tiene intención comercial,\n' +
      '   independientemente de cómo esté formulada la búsqueda.)',
    )
  }

  // ── Brand context ────────────────────────────────────────
  if (ctx.brand) {
    const brandLines: string[] = ['MARCA:']
    if (ctx.brand.raw_summary) {
      brandLines.push(`  Resumen del brandbook (descriptivo, no son instrucciones editoriales):`)
      brandLines.push(`    ${ctx.brand.raw_summary.substring(0, BRAND_SUMMARY_MAX)}`)
    }
    if (ctx.brand.tone_of_voice)             brandLines.push(`  Tono: ${ctx.brand.tone_of_voice}`)
    if (ctx.brand.style_keywords.length > 0) brandLines.push(`  Estilo: ${ctx.brand.style_keywords.join(', ')}`)
    if (ctx.brand.restrictions)              brandLines.push(`  Restricciones: ${ctx.brand.restrictions}`)
    if (brandLines.length > 1) sections.push(brandLines.join('\n'))
  }

  // ── Social competitors ───────────────────────────────────
  if (ctx.socialCompetitors.length > 0) {
    const lines = ctx.socialCompetitors
      .map((c) => `  - ${c.page_name} (${c.platform})`)
      .join('\n')
    sections.push(`COMPETIDORES EN REDES:\n${lines}`)
  }

  // ── Bloque de INVENTARIO Y DATOS ─────────────────────────
  // Todo lo que sigue describe el estado actual: temas ya detectados,
  // artículos ya planificados, métricas ya medidas. Es material de
  // referencia, no una lista de encargos.
  const inventario: string[] = []

  if (ctx.inspiracion) {
    if (ctx.inspiracion.oportunidades.length > 0) {
      const lines = ctx.inspiracion.oportunidades
        .map((op) => `  - ${op.tema} [urgencia: ${op.urgencia}]`)
        .join('\n')
      inventario.push(`Temas detectados en sesiones de inspiración:\n${lines}`)
    }
    if (ctx.inspiracion.temas_trending.length > 0) {
      inventario.push(
        `Tendencias observadas en el sector:\n${ctx.inspiracion.temas_trending.map((t) => `  - ${t}`).join('\n')}`,
      )
    }
  }

  if (ctx.pendingMapItems.length > 0) {
    const lines = ctx.pendingMapItems
      .map((item) =>
        `  - "${item.title}" [${item.funnel_stage ?? '?'}${item.fase_recomendada ? '/' + item.fase_recomendada : ''}] P${item.priority ?? '?'} — ${item.main_keyword}`,
      )
      .join('\n')
    inventario.push(`Artículos ya planificados en el banco:\n${lines}`)
  }

  if (ctx.analytics) {
    const a = ctx.analytics
    const analyticsLines: string[] = ['Rendimiento SEO medido (Google Search Console):']

    analyticsLines.push(`  Clicks mensuales: ${a.totalClicks.toLocaleString('es-ES')} · Posición media: ${a.avgPosition}`)

    if (a.topKeywords.length > 0) {
      const top5 = a.topKeywords
        .slice(0, 5)
        .map((k) => `    · "${k.keyword}" — ${k.clicks} clicks, pos ${k.position} [${k.type}]`)
        .join('\n')
      analyticsLines.push(`  Top keywords:\n${top5}`)
    }

    if (a.strongClusters.length > 0) {
      analyticsLines.push(`  Clusters fuertes (pos < 5): ${a.strongClusters.join(', ')}`)
    }
    if (a.weakClusters.length > 0) {
      analyticsLines.push(`  Clusters débiles (pos > 15): ${a.weakClusters.join(', ')}`)
    }

    const b = a.searchTypeBreakdown
    analyticsLines.push(`  Distribución búsquedas: ${b.informacional}% informacional · ${b.transaccional}% transaccional · ${b.marca}% marca`)

    inventario.push(analyticsLines.join('\n'))
  }

  if (ctx.gscOpportunities && ctx.gscOpportunities.length > 0) {
    const lines = ctx.gscOpportunities
      .map((op) => {
        const parts = [`  - [${op.type}] ${op.titulo}`]
        if (op.keyword)         parts.push(`    Keyword: ${op.keyword}`)
        if (op.currentPosition) parts.push(`    Posición actual: ${op.currentPosition}`)
        if (op.impressions)     parts.push(`    Impresiones: ${op.impressions}`)
        return parts.join('\n')
      })
      .join('\n')
    inventario.push(`Keywords con recorrido detectadas en GSC:\n${lines}`)
  }

  if (ctx.gmb) {
    const g = ctx.gmb
    const gmbLines: string[] = []

    gmbLines.push(`Reseñas de Google (${g.reviewCount ?? '?'} reseñas${g.rating ? `, ${g.rating}⭐` : ''}):`)

    if (g.topKeywords.length > 0) {
      gmbLines.push(`  Lo que más valoran los clientes: ${g.topKeywords.join(', ')}`)
    }
    if (g.implicitQuestions.length > 0) {
      gmbLines.push('  Preguntas frecuentes de clientes:')
      g.implicitQuestions.forEach((q) => gmbLines.push(`    - ${q}`))
    }

    if (gmbLines.length > 1) inventario.push(gmbLines.join('\n'))
  }

  if (inventario.length > 0) {
    sections.push(
      'INVENTARIO Y DATOS (material de referencia — describe lo que YA existe y lo que\n' +
      'se ha medido; NO es una lista de encargos ni una directriz de qué generar):\n\n' +
      inventario.join('\n\n'),
    )
  }

  return sections.join('\n\n')
}
