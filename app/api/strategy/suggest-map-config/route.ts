/**
 * POST /api/strategy/suggest-map-config
 *
 * Analiza las keywords clusterizadas de una sesión y devuelve una
 * sugerencia de configuración inteligente para el mapa editorial.
 *
 * Body: { session_id: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface ClusterStats {
  nombre  : string
  keywords: number
  funnel  : 'tofu' | 'mofu' | 'bofu'
  volume  : number
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function buildRazonamiento(
  totalClusters : number,
  totalKeywords : number,
  meses         : number,
  artMes        : number,
  tofuPct       : number,
  mofuPct       : number,
  bofuPct       : number,
): string {
  const totalArts = meses * artMes

  const coverageDesc =
    totalArts >= totalClusters * 2
      ? 'cobertura amplia con múltiples artículos por cluster'
      : totalArts >= totalClusters
      ? 'cobertura completa con un artículo por cluster'
      : 'cobertura selectiva de los clusters de mayor volumen'

  const funnelDesc =
    tofuPct >= 55
      ? 'tu contenido es mayoritariamente informacional (TOFU)'
      : bofuPct >= 40
      ? 'tienes fuerte intención de conversión (BOFU)'
      : 'distribución equilibrada entre etapas del embudo'

  return (
    `Con ${totalClusters} clusters y ${totalKeywords} keywords, ${meses} meses a ${artMes} art/mes permite ${coverageDesc} ` +
    `(${totalArts} artículos en total). Como ${funnelDesc} (TOFU ${tofuPct}% · MOFU ${mofuPct}% · BOFU ${bofuPct}%), ` +
    `la distribución sugerida refleja tu mix temático real.`
  )
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { session_id } = await request.json() as { session_id: string }
    if (!session_id) return NextResponse.json({ error: 'session_id requerido' }, { status: 400 })

    const supabase = createAdminClient()

    // ── Cargar keywords clusterizadas ────────────────────────
    const { data: keywords, error: kwError } = await supabase
      .from('keywords')
      .select('keyword, volume, funnel_stage, cluster_name, priority')
      .eq('session_id', session_id)
      .eq('incluida', true)
      .not('cluster_name', 'is', null)

    if (kwError || !keywords || keywords.length === 0) {
      return NextResponse.json(
        { error: 'No hay keywords clusterizadas en esta sesión' },
        { status: 400 },
      )
    }

    const total = keywords.length

    // ── Distribución por funnel ──────────────────────────────
    const tofuCount = keywords.filter((k) => k.funnel_stage === 'tofu').length
    const mofuCount = keywords.filter((k) => k.funnel_stage === 'mofu').length
    const bofuCount = keywords.filter((k) => k.funnel_stage === 'bofu').length

    const tofuPct = Math.round((tofuCount / total) * 100)
    const mofuPct = Math.round((mofuCount / total) * 100)
    const bofuPct = 100 - tofuPct - mofuPct

    // ── Agrupar por cluster ──────────────────────────────────
    const clusterMap = new Map<
      string,
      { count: number; tofuN: number; mofuN: number; bofuN: number; volume: number }
    >()
    for (const kw of keywords) {
      const name = kw.cluster_name as string
      if (!name) continue
      if (!clusterMap.has(name)) {
        clusterMap.set(name, { count: 0, tofuN: 0, mofuN: 0, bofuN: 0, volume: 0 })
      }
      const c = clusterMap.get(name)!
      c.count++
      c.volume += kw.volume ?? 0
      if (kw.funnel_stage === 'tofu')      c.tofuN++
      else if (kw.funnel_stage === 'mofu') c.mofuN++
      else if (kw.funnel_stage === 'bofu') c.bofuN++
    }

    const totalClusters = clusterMap.size

    const topClusters: ClusterStats[] = Array.from(clusterMap.entries())
      .sort((a, b) => b[1].volume - a[1].volume)
      .slice(0, 5)
      .map(([nombre, stats]) => ({
        nombre,
        keywords: stats.count,
        funnel  :
          stats.tofuN >= stats.mofuN && stats.tofuN >= stats.bofuN
            ? 'tofu'
            : stats.mofuN >= stats.bofuN
            ? 'mofu'
            : 'bofu',
        volume: stats.volume,
      }))

    // ── Sugerir meses basado en clusters ────────────────────
    let mesesSugeridos: 3 | 6 | 9 | 12
    if      (totalClusters <= 4)  mesesSugeridos = 3
    else if (totalClusters <= 10) mesesSugeridos = 6
    else if (totalClusters <= 18) mesesSugeridos = 9
    else                          mesesSugeridos = 12

    // ── Sugerir art/mes ──────────────────────────────────────
    // Objetivo: cubrir todos los clusters con ~1.5 artículos promedio
    const totalArtTarget = Math.ceil(totalClusters * 1.5)
    const artMesBruto    = Math.round(totalArtTarget / mesesSugeridos)
    // Clamp 4-10, forzar par
    let artMesSugerido = Math.max(4, Math.min(10, artMesBruto))
    if (artMesSugerido % 2 !== 0) artMesSugerido++
    artMesSugerido = Math.min(10, artMesSugerido)

    const coberturaEstimada = mesesSugeridos * artMesSugerido

    // ── Sugerir distribución ─────────────────────────────────
    // Redondear al múltiplo de 5 más cercano, garantizar mín 10% por stage
    const sugTofuRaw = Math.round(tofuPct / 5) * 5
    const sugBofuRaw = Math.round(bofuPct / 5) * 5
    const sugTofu    = Math.max(10, Math.min(80, sugTofuRaw))
    const sugBofu    = Math.max(10, Math.min(80, sugBofuRaw))
    const sugMofu    = Math.max(10, 100 - sugTofu - sugBofu)
    // Si la suma no es 100, ajustar TOFU
    const sugTofuFinal = 100 - sugMofu - sugBofu

    // ── Razonamiento ─────────────────────────────────────────
    const razonamiento = buildRazonamiento(
      totalClusters,
      total,
      mesesSugeridos,
      artMesSugerido,
      tofuPct,
      mofuPct,
      bofuPct,
    )

    return NextResponse.json({
      suggested: {
        meses            : mesesSugeridos,
        articulos_por_mes: artMesSugerido,
        distribucion     : {
          tofu: Math.max(10, sugTofuFinal),
          mofu: sugMofu,
          bofu: sugBofu,
        },
      },
      context: {
        total_keywords    : total,
        total_clusters    : totalClusters,
        distribucion_actual: { tofu: tofuPct, mofu: mofuPct, bofu: bofuPct },
        top_clusters      : topClusters,
        cobertura_estimada: coberturaEstimada,
      },
      razonamiento,
    })

  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('[SuggestMapConfig]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
