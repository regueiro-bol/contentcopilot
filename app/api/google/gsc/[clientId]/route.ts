/**
 * GET /api/google/gsc/[clientId]?days=30&force=true
 *
 * Devuelve datos GSC para un cliente:
 *   - Métricas globales (clicks, impresiones, CTR, posición)
 *   - Top queries clasificadas por tipo (Claude haiku)
 *   - Top páginas
 *   - Rendimiento por cluster del mapa
 *   - Evolución diaria
 *   - Oportunidades detectadas automáticamente
 *
 * Caché diaria en gsc_snapshots. force=true fuerza nuevo fetch.
 */

import { auth }            from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'
import { refreshAccessToken }        from '@/lib/google-api'
import Anthropic                     from '@anthropic-ai/sdk'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface GSCRow {
  keys        : string[]
  clicks      : number
  impressions : number
  ctr         : number
  position    : number
}

// ─────────────────────────────────────────────────────────────
// Helper: raw GSC searchAnalytics query
// ─────────────────────────────────────────────────────────────

async function fetchGSC(
  accessToken: string,
  siteUrl    : string,
  dimensions : string[],
  days       : number,
  rowLimit   = 100,
): Promise<GSCRow[]> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method : 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type' : 'application/json',
      },
      body: JSON.stringify({
        startDate : startDate.toISOString().split('T')[0],
        endDate   : yesterday.toISOString().split('T')[0],
        dimensions,
        rowLimit,
        startRow  : 0,
        dataState : 'final',
      }),
    },
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`GSC ${res.status}: ${errText.substring(0, 300)}`)
  }

  const data = await res.json()
  return (data.rows ?? []) as GSCRow[]
}

// ─────────────────────────────────────────────────────────────
// Helper: classify queries with Claude haiku
// ─────────────────────────────────────────────────────────────

type QueryType = 'informacional' | 'marca' | 'transaccional' | 'comparacional'

async function classifyQueries(
  queries    : string[],
  clientName : string,
  clientWeb  : string | null,
): Promise<Record<string, QueryType>> {
  if (queries.length === 0) return {}

  const anthropic   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const queryList   = queries.slice(0, 50).join('\n')

  try {
    const msg = await anthropic.messages.create({
      model      : 'claude-haiku-4-5',
      max_tokens : 1200,
      system     : `Clasifica cada query de búsqueda en una de estas categorías:
- informacional: buscan conocimiento, aprenden algo
- marca: contienen el nombre de la marca o variaciones
- transaccional: intención de compra, reserva o contacto
- comparacional: comparan opciones antes de decidir

Responde SOLO con JSON válido: {"query": "categoria", ...}
Sin explicaciones ni texto adicional.`,
      messages: [{
        role   : 'user',
        content: `Marca/empresa: ${clientName}
Web: ${clientWeb ?? ''}

Queries a clasificar:
${queryList}`,
      }],
    })

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '{}'
    // Strip any markdown code fences
    const cleaned = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    const parsed  = JSON.parse(cleaned) as Record<string, string>

    // Validate values
    const valid: QueryType[] = ['informacional', 'marca', 'transaccional', 'comparacional']
    const result: Record<string, QueryType> = {}
    for (const [q, t] of Object.entries(parsed)) {
      result[q] = valid.includes(t as QueryType) ? (t as QueryType) : 'informacional'
    }
    return result
  } catch (e) {
    console.warn('[GSC classify] Claude error, skipping classification:', e instanceof Error ? e.message : e)
    return {}
  }
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────

export async function GET(
  request : NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase  = createAdminClient()
  const clientId  = params.clientId
  const days      = Math.min(parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10), 90)
  const force     = request.nextUrl.searchParams.get('force') === 'true'

  // 1. Leer conexión activa con propiedad GSC
  const { data: conn } = await supabase
    .from('client_google_connections')
    .select('id, gsc_property_url, ga4_property_id, google_account_id, google_accounts(access_token, refresh_token, token_expiry)')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .not('gsc_property_url', 'is', null)
    .maybeSingle()

  if (!conn?.gsc_property_url) {
    return NextResponse.json({ connected: false })
  }

  const siteUrl = conn.gsc_property_url as string

  // 2. Comprobar caché (snapshot de hoy)
  if (!force) {
    const today = new Date().toISOString().split('T')[0]
    const { data: snap } = await supabase
      .from('gsc_snapshots')
      .select('*')
      .eq('client_id', clientId)
      .eq('date', today)
      .maybeSingle()

    if (snap) {
      // Fetch active opportunities separately
      const { data: opps } = await supabase
        .from('content_opportunities')
        .select('id, type, titulo, descripcion, keyword, cluster, current_position, impressions, clicks, priority')
        .eq('client_id', clientId)
        .eq('status', 'activa')
        .order('priority', { ascending: true })
        .limit(10)

      console.log(`[GSC] Sirviendo snapshot cacheado para ${clientId}`)
      return NextResponse.json({
        connected : true,
        cached    : true,
        date      : snap.date,
        total_clicks      : snap.total_clicks,
        total_impressions : snap.total_impressions,
        avg_ctr           : snap.avg_ctr,
        avg_position      : snap.avg_position,
        top_queries       : snap.top_queries,
        top_pages         : snap.top_pages,
        search_type_breakdown: snap.search_type_breakdown,
        cluster_breakdown : snap.cluster_breakdown,
        daily_evolution   : snap.daily_evolution,
        opportunities     : opps ?? [],
      })
    }
  }

  // 3. Obtener / refrescar access token
  const ga = conn.google_accounts as unknown as {
    access_token: string | null; refresh_token: string; token_expiry: string | null
  }

  let accessToken  = ga.access_token
  const isExpired  = !accessToken || (ga.token_expiry && new Date(ga.token_expiry) <= new Date())

  if (isExpired && ga.refresh_token) {
    try {
      const refreshed = await refreshAccessToken(ga.refresh_token)
      accessToken     = refreshed.access_token
      await supabase.from('google_accounts').update({
        access_token: refreshed.access_token,
        token_expiry: refreshed.expiry_date ? new Date(refreshed.expiry_date).toISOString() : null,
        updated_at  : new Date().toISOString(),
      }).eq('id', conn.google_account_id)
    } catch (err) {
      console.error('[GSC] Token refresh error:', err instanceof Error ? err.message : err)
      return NextResponse.json(
        { error: 'No se pudo refrescar el token de Google. Reconecta la cuenta.' },
        { status: 401 },
      )
    }
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Sin access token' }, { status: 401 })
  }

  // 4. Leer datos del cliente (para clasificación)
  const { data: cliente } = await supabase
    .from('clientes')
    .select('nombre, web')
    .eq('id', clientId)
    .single()

  const clientName = cliente?.nombre ?? ''
  const clientWeb  = cliente?.web    ?? null

  // 5. Llamadas GSC en paralelo
  console.log(`[GSC] Fetching data for ${clientId} — ${siteUrl} — last ${days} days`)

  const [queryRows, pageRows, dateRows] = await Promise.all([
    fetchGSC(accessToken, siteUrl, ['query'], days, 100).catch(() => [] as GSCRow[]),
    fetchGSC(accessToken, siteUrl, ['page'],  days,  50).catch(() => [] as GSCRow[]),
    fetchGSC(accessToken, siteUrl, ['date'],  days,  days).catch(() => [] as GSCRow[]),
  ])

  console.log(`[GSC] ${queryRows.length} queries, ${pageRows.length} pages, ${dateRows.length} date rows`)

  // 6. Clasificar top 50 queries con Claude haiku
  const topQueryStrings  = queryRows.slice(0, 50).map((r) => r.keys[0])
  const queryTypes       = await classifyQueries(topQueryStrings, clientName, clientWeb)

  // 7. Construir top_queries con tipo
  const topQueries = queryRows.slice(0, 50).map((r) => ({
    query      : r.keys[0],
    clicks     : r.clicks,
    impressions: r.impressions,
    ctr        : Math.round(r.ctr * 10000) / 100, // → porcentaje
    position   : Math.round(r.position * 10) / 10,
    type       : queryTypes[r.keys[0]] ?? 'informacional',
  }))

  // 8. Top páginas
  const topPages = pageRows.slice(0, 30).map((r) => ({
    page       : r.keys[0],
    clicks     : r.clicks,
    impressions: r.impressions,
    ctr        : Math.round(r.ctr * 10000) / 100,
    position   : Math.round(r.position * 10) / 10,
  }))

  // 9. Evolución diaria
  const dailyEvolution = dateRows.map((r) => ({
    date       : r.keys[0],
    clicks     : r.clicks,
    impressions: r.impressions,
    ctr        : Math.round(r.ctr * 10000) / 100,
    position   : Math.round(r.position * 10) / 10,
  })).sort((a, b) => a.date.localeCompare(b.date))

  // 10. Métricas globales
  const totalClicks      = queryRows.reduce((s, r) => s + r.clicks, 0)
  const totalImpressions = queryRows.reduce((s, r) => s + r.impressions, 0)
  const avgCtr           = totalImpressions > 0
    ? Math.round((totalClicks / totalImpressions) * 10000) / 100
    : 0
  const avgPosition      = queryRows.length > 0
    ? Math.round(queryRows.reduce((s, r) => s + r.position, 0) / queryRows.length * 10) / 10
    : 0

  // 11. Breakdown por tipo de búsqueda
  const typeCount: Record<string, number> = {
    informacional: 0, marca: 0, transaccional: 0, comparacional: 0,
  }
  let typedTotal = 0
  for (const q of topQueries) {
    typeCount[q.type] = (typeCount[q.type] ?? 0) + 1
    typedTotal++
  }
  const searchTypeBreakdown = {
    informacional : typedTotal > 0 ? Math.round(typeCount.informacional / typedTotal * 100) : 0,
    marca         : typedTotal > 0 ? Math.round(typeCount.marca         / typedTotal * 100) : 0,
    transaccional : typedTotal > 0 ? Math.round(typeCount.transaccional / typedTotal * 100) : 0,
    comparacional : typedTotal > 0 ? Math.round(typeCount.comparacional / typedTotal * 100) : 0,
  }

  // 12. Rendimiento por cluster
  let clusterBreakdown: Record<string, unknown>[] = []
  try {
    const { data: mapRows } = await supabase
      .from('content_maps')
      .select('id')
      .eq('client_id', clientId)

    if (mapRows && mapRows.length > 0) {
      const mapIds = mapRows.map((m) => m.id as string)

      const { data: items } = await supabase
        .from('content_map_items')
        .select('cluster, title, funnel_stage, contenido_id')
        .in('map_id', mapIds)
        .not('contenido_id', 'is', null)

      if (items && items.length > 0) {
        const contenidoIds = items.map((i) => i.contenido_id as string)
        const { data: contenidos } = await supabase
          .from('contenidos')
          .select('id, url_publicado')
          .in('id', contenidoIds)
          .not('url_publicado', 'is', null)

        // Build map: contenido_id → url_publicado
        const urlMap = new Map<string, string>()
        for (const c of contenidos ?? []) {
          if (c.url_publicado) urlMap.set(c.id, c.url_publicado)
        }

        // Build cluster map
        const clusters = new Map<string, {
          articles   : number
          clicks     : number
          impressions: number
          positions  : number[]
          hasBofu    : boolean
          items      : Array<{ title: string; url: string; clicks: number; position: number }>
        }>()

        for (const item of items) {
          const cluster = item.cluster ?? 'Sin cluster'
          if (!clusters.has(cluster)) {
            clusters.set(cluster, { articles: 0, clicks: 0, impressions: 0, positions: [], hasBofu: false, items: [] })
          }
          const cl = clusters.get(cluster)!
          cl.articles++
          if (item.funnel_stage === 'bofu') cl.hasBofu = true

          const url = item.contenido_id ? urlMap.get(item.contenido_id) : null
          if (url) {
            // Match GSC pages: fuzzy URL match
            const matched = topPages.filter((p) =>
              p.page.includes(url) || url.includes(p.page.replace(/^https?:\/\/[^/]+/, ''))
            )
            let clClicks = 0, clImpressions = 0
            let position  = 0
            for (const m of matched) {
              clClicks      += m.clicks
              clImpressions += m.impressions
              position       = m.position
            }
            cl.clicks      += clClicks
            cl.impressions += clImpressions
            if (position > 0) cl.positions.push(position)
            cl.items.push({
              title   : item.title ?? '',
              url,
              clicks  : clClicks,
              position: position,
            })
          }
        }

        clusterBreakdown = Array.from(clusters.entries()).map(([name, data]) => {
          const avgPos = data.positions.length > 0
            ? Math.round(data.positions.reduce((s, p) => s + p, 0) / data.positions.length * 10) / 10
            : null
          const status = !avgPos
            ? 'sin_datos'
            : avgPos < 5   ? 'fuerte'
            : avgPos <= 15 ? 'mejorable'
            : 'debil'

          return {
            cluster    : name,
            articles   : data.articles,
            totalClicks: data.clicks,
            totalImpressions: data.impressions,
            avgPosition: avgPos,
            hasBofu    : data.hasBofu,
            status,
            items      : data.items.sort((a, b) => b.clicks - a.clicks).slice(0, 10),
          }
        }).sort((a, b) => ((b.totalClicks as number) ?? 0) - ((a.totalClicks as number) ?? 0))
      }
    }
  } catch (e) {
    console.warn('[GSC] Cluster breakdown error (non-fatal):', e instanceof Error ? e.message : e)
  }

  // 13. Detectar oportunidades automáticas
  const today = new Date().toISOString().split('T')[0]
  const opportunities: Array<{
    type: string; titulo: string; descripcion: string
    keyword?: string; cluster?: string; current_position?: number
    impressions?: number; clicks?: number; priority: number
  }> = []

  // Tipo 1: Quick wins (posición 6-20, >500 impresiones)
  for (const p of topPages) {
    if (p.position >= 6 && p.position <= 20 && p.impressions > 500) {
      opportunities.push({
        type           : 'quick_win',
        titulo         : `Quick win: ${p.page}`,
        descripcion    : `Posición ${p.position} con ${p.impressions.toLocaleString()} impresiones. Optimizar podría doblar el tráfico.`,
        keyword        : topQueries.find((q) =>
          topPages.some((pg) => pg.page === p.page && pg.clicks > 0)
        )?.query,
        current_position: p.position,
        impressions    : p.impressions,
        clicks         : p.clicks,
        priority       : 1,
      })
      if (opportunities.filter((o) => o.type === 'quick_win').length >= 3) break
    }
  }

  // Tipo 2: Keywords sin contenido (>200 impresiones sin página rankeada)
  const rankedPages = new Set(topPages.map((p) => p.page))
  for (const q of topQueries) {
    if (q.impressions > 200 && !Array.from(rankedPages).some((p) => p.includes(q.query.split(' ')[0]))) {
      opportunities.push({
        type       : 'missing_content',
        titulo     : `Keyword sin contenido: "${q.query}"`,
        descripcion: `${q.impressions.toLocaleString()} impresiones pero sin artículo posicionado. Crear contenido específico.`,
        keyword    : q.query,
        impressions: q.impressions,
        clicks     : q.clicks,
        priority   : 2,
      })
      if (opportunities.filter((o) => o.type === 'missing_content').length >= 3) break
    }
  }

  // Tipo 3: Dependencia de marca
  if (searchTypeBreakdown.marca > 40) {
    opportunities.push({
      type       : 'brand_dependent',
      titulo     : 'Alta dependencia de tráfico de marca',
      descripcion: `El ${searchTypeBreakdown.marca}% del tráfico viene de búsquedas de marca. Diversifica con más contenido evergreen e informacional.`,
      priority   : 2,
    })
  }

  // Tipo 4: Gap BOFU en cluster con tráfico
  for (const cl of clusterBreakdown as Record<string, unknown>[]) {
    if ((cl.totalClicks as number) > 100 && !(cl.hasBofu as boolean)) {
      opportunities.push({
        type       : 'bofu_gap',
        titulo     : `Gap BOFU en cluster "${cl.cluster}"`,
        descripcion: `El cluster "${cl.cluster}" genera ${(cl.totalClicks as number).toLocaleString()} clicks pero no tiene contenido transaccional (BOFU). Crea un artículo de conversión.`,
        cluster    : cl.cluster as string,
        priority   : 1,
      })
      if (opportunities.filter((o) => o.type === 'bofu_gap').length >= 2) break
    }
  }

  // Limpiar oportunidades antiguas y guardar nuevas
  try {
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() - 7)
    await supabase
      .from('content_opportunities')
      .delete()
      .eq('client_id', clientId)
      .lt('detected_at', expiryDate.toISOString())

    if (opportunities.length > 0) {
      await supabase.from('content_opportunities').insert(
        opportunities.map((o) => ({
          client_id       : clientId,
          type            : o.type,
          titulo          : o.titulo,
          descripcion     : o.descripcion,
          keyword         : o.keyword         ?? null,
          cluster         : o.cluster         ?? null,
          current_position: o.current_position ?? null,
          impressions     : o.impressions      ?? null,
          clicks          : o.clicks           ?? null,
          priority        : o.priority,
          status          : 'activa',
        }))
      )
    }
  } catch (e) {
    console.warn('[GSC] Opportunities insert error (non-fatal):', e instanceof Error ? e.message : e)
  }

  // 14. Guardar snapshot
  await supabase.from('gsc_snapshots').upsert(
    {
      client_id         : clientId,
      date              : today,
      total_clicks      : totalClicks,
      total_impressions : totalImpressions,
      avg_ctr           : avgCtr,
      avg_position      : avgPosition,
      top_queries       : topQueries,
      top_pages         : topPages,
      search_type_breakdown: searchTypeBreakdown,
      cluster_breakdown : clusterBreakdown,
      daily_evolution   : dailyEvolution,
    },
    { onConflict: 'client_id,date' },
  )

  console.log(`[GSC] Snapshot saved for ${clientId}: ${totalClicks} clicks, ${topQueries.length} queries`)

  return NextResponse.json({
    connected : true,
    cached    : false,
    date      : today,
    total_clicks      : totalClicks,
    total_impressions : totalImpressions,
    avg_ctr           : avgCtr,
    avg_position      : avgPosition,
    top_queries       : topQueries,
    top_pages         : topPages,
    search_type_breakdown: searchTypeBreakdown,
    cluster_breakdown : clusterBreakdown,
    daily_evolution   : dailyEvolution,
    opportunities,
  })
}
