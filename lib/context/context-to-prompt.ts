/**
 * lib/context/context-to-prompt.ts
 *
 * Converts a ClientContext into a concise string suitable for
 * injection into AI generation prompts.
 *
 * Usage:
 *   const ctx = await buildClientContext(supabase, clientId)
 *   if (ctx) prompt += '\n\n' + contextToPrompt(ctx)
 */

import type { ClientContext } from './client-context'

export function contextToPrompt(ctx: ClientContext): string {
  const sections: string[] = []

  // ── Client identity ──────────────────────────────────────
  const identityLines = [
    `CLIENTE: ${ctx.client.name}`,
    ctx.client.sector                ? `Sector: ${ctx.client.sector}` : null,
    ctx.client.web                   ? `Web: ${ctx.client.web}` : null,
    ctx.client.descripcion           ? `Descripción: ${ctx.client.descripcion.substring(0, 300)}` : null,
    ctx.client.identidad_corporativa ? `Identidad de marca: ${ctx.client.identidad_corporativa.substring(0, 200)}` : null,
    ctx.client.tono_voz              ? `Tono de voz: ${ctx.client.tono_voz}` : null,
    ctx.client.perfil_lector         ? `Perfil lector: ${ctx.client.perfil_lector}` : null,
    ctx.client.competidores          ? `Competidores editoriales: ${ctx.client.competidores.substring(0, 200)}` : null,
  ].filter((l): l is string => l !== null)

  sections.push(identityLines.join('\n'))

  // ── Brand context ────────────────────────────────────────
  if (ctx.brand) {
    const brandLines: string[] = ['MARCA:']
    if (ctx.brand.raw_summary)               brandLines.push(`  Resumen: ${ctx.brand.raw_summary}`)
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

  // ── Inspiracion opportunities ────────────────────────────
  if (ctx.inspiracion) {
    if (ctx.inspiracion.oportunidades.length > 0) {
      const lines = ctx.inspiracion.oportunidades
        .map((op) => `  - ${op.tema} [urgencia: ${op.urgencia}]`)
        .join('\n')
      sections.push(`OPORTUNIDADES DETECTADAS:\n${lines}`)
    }
    if (ctx.inspiracion.temas_trending.length > 0) {
      sections.push(
        `TENDENCIAS DEL SECTOR:\n${ctx.inspiracion.temas_trending.map((t) => `  - ${t}`).join('\n')}`,
      )
    }
  }

  // ── Pending map items ────────────────────────────────────
  if (ctx.pendingMapItems.length > 0) {
    const lines = ctx.pendingMapItems
      .map((item) =>
        `  - "${item.title}" [${item.funnel_stage ?? '?'}${item.fase_recomendada ? '/' + item.fase_recomendada : ''}] P${item.priority ?? '?'} — ${item.main_keyword}`,
      )
      .join('\n')
    sections.push(`ARTÍCULOS PENDIENTES EN BANCO:\n${lines}`)
  }

  // ── Analytics SEO (GSC snapshot) ─────────────────────────
  if (ctx.analytics) {
    const a = ctx.analytics
    const analyticsLines: string[] = ['RENDIMIENTO SEO ACTUAL (GSC):']

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

    if (b.transaccional < 20) {
      analyticsLines.push('  ⚠️  Tráfico transaccional bajo — priorizar contenido BOFU')
    }
    if (b.marca > 40) {
      analyticsLines.push('  ⚠️  Alta dependencia de marca — diversificar con contenido evergreen')
    }

    sections.push(analyticsLines.join('\n'))
  }

  return sections.join('\n\n')
}
