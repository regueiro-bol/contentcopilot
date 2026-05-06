/**
 * POST /api/strategy/suggest-quarterly
 *
 * Lee los artículos disponibles del banco de contenidos para un cliente
 * y devuelve una sugerencia de planificación trimestral: qué artículos
 * publicar en cada semana del trimestre.
 *
 * Body: { clientId, quarter, year, articlesPerMonth }
 *       quarter: 1 | 2 | 3 | 4
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

// ─────────────────────────────────────────────────────────────
// Helpers de fechas
// ─────────────────────────────────────────────────────────────

/** Rango de fechas para un trimestre */
function quarterRange(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3 // 0, 3, 6, 9
  return {
    start: new Date(year, startMonth, 1),
    end  : new Date(year, startMonth + 3, 0), // último día del último mes
  }
}

/** Días laborables (lunes-viernes) dentro de un mes */
function workdaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    const dow = d.getDay() // 0=dom, 6=sab
    if (dow !== 0 && dow !== 6) days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

/** Reparte N fechas uniformemente entre los días laborables de un mes.
 *  Prioriza lunes, miércoles y viernes (mejor para distribución semanal). */
function distributeInMonth(year: number, month: number, count: number): Date[] {
  if (count <= 0) return []
  const workdays = workdaysInMonth(year, month)
  if (workdays.length === 0) return []

  // Preferir lun(1), mié(3), vie(5) — luego mar(2), jue(4)
  const preferred = workdays.filter((d) => [1, 3, 5].includes(d.getDay()))
  const secondary  = workdays.filter((d) => [2, 4].includes(d.getDay()))
  const ordered    = [...preferred, ...secondary]

  if (count >= ordered.length) {
    // Más artículos que días ordenados: usar todos
    return ordered.slice(0, count)
  }

  // Seleccionar uniformemente
  const step   = (ordered.length - 1) / (count - 1)
  const result: Date[] = []
  for (let i = 0; i < count; i++) {
    result.push(ordered[Math.round(i * step)] ?? ordered[ordered.length - 1])
  }
  // Deduplicar
  const seen = new Set<string>()
  return result.filter((d) => {
    const k = d.toISOString().slice(0, 10)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { clientId?: string; quarter?: number; year?: number; articlesPerMonth?: number }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId, quarter, year, articlesPerMonth = 6 } = body
  if (!clientId)           return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  if (!quarter || !year)   return NextResponse.json({ error: 'quarter y year requeridos' }, { status: 400 })
  if (quarter < 1 || quarter > 4) return NextResponse.json({ error: 'quarter debe ser 1-4' }, { status: 400 })

  const supabase      = createAdminClient()
  const totalCapacity = articlesPerMonth * 3
  const { start }     = quarterRange(year, quarter)
  const startMonth    = start.getMonth() // 0-based

  // ── PASO 1: Leer artículos disponibles del banco ─────────
  const { data: rawItems, error: itemsErr } = await supabase
    .from('content_map_items')
    .select(`
      id,
      title,
      main_keyword,
      cluster,
      funnel_stage,
      fase,
      prioridad_final,
      priority,
      volume,
      difficulty,
      tipo_articulo,
      validacion,
      assignee_name,
      redactor_asignado,
      map_id,
      content_maps!inner(client_id)
    `)
    .eq('content_maps.client_id', clientId)
    .in('validacion', ['propuesto', 'aprobado'])
    .is('contenido_id', null)
    .not('status', 'in', '("publicado","cancelado")')
    .order('prioridad_final', { ascending: true, nullsFirst: false })
    .order('volume', { ascending: false, nullsFirst: false })
    .limit(totalCapacity * 3) // traer el triple para tener margen

  if (itemsErr) {
    console.error('[SuggestQuarterly] Error:', itemsErr.message)
    return NextResponse.json({ error: 'Error leyendo banco de contenidos' }, { status: 500 })
  }

  const items = rawItems ?? []

  // ── PASO 2: Ordenar por fase de publicación prioritaria ──
  // arranque → consolidacion → expansion → sin_fase
  const FASE_ORDER: Record<string, number> = {
    arranque     : 0,
    consolidacion: 1,
    expansion    : 2,
    sin_fase     : 3,
  }

  const sorted = [...items].sort((a, b) => {
    const fa = FASE_ORDER[String(a.fase ?? 'sin_fase')] ?? 3
    const fb = FASE_ORDER[String(b.fase ?? 'sin_fase')] ?? 3
    if (fa !== fb) return fa - fb
    const pa = Number(a.prioridad_final ?? a.priority ?? 2)
    const pb = Number(b.prioridad_final ?? b.priority ?? 2)
    if (pa !== pb) return pa - pb
    return (Number(b.volume ?? 0)) - (Number(a.volume ?? 0))
  })

  // ── PASO 3: Seleccionar los mejores artículos ────────────
  const selected = sorted.slice(0, totalCapacity)

  // ── PASO 4: Distribuir en los 3 meses del trimestre ──────
  // Artículos por mes: distribuir uniformemente con el sobrante en el mes 1
  const artM3 = Math.floor(totalCapacity / 3)
  const artM1 = totalCapacity - artM3 * 2  // mes 1 absorbe el sobrante
  const countsByMonth = [artM1, artM3, artM3]

  interface SuggestedItem {
    id             : string
    title          : string
    main_keyword   : string
    cluster        : string | null
    funnel_stage   : string | null
    fase           : string | null
    prioridad_final: number | null
    volume         : number | null
    tipo_articulo  : string | null
    assignee_name  : string | null
    month_number   : number  // 1, 2, 3 (dentro del trimestre)
    scheduled_date : string  // YYYY-MM-DD
  }

  const suggestedItems: SuggestedItem[] = []
  let cursor = 0

  for (let m = 0; m < 3; m++) {
    const monthCount  = countsByMonth[m]
    const calMonth    = startMonth + m  // 0-based
    const calYear     = year + Math.floor(calMonth / 12)
    const adjustedMonth = calMonth % 12

    const dates = distributeInMonth(calYear, adjustedMonth, monthCount)

    for (let i = 0; i < monthCount && cursor < selected.length; i++) {
      const item = selected[cursor++]
      suggestedItems.push({
        id             : String(item.id),
        title          : String(item.title),
        main_keyword   : String(item.main_keyword),
        cluster        : (item.cluster as string | null) ?? null,
        funnel_stage   : (item.funnel_stage as string | null) ?? null,
        fase           : (item.fase as string | null) ?? null,
        prioridad_final: item.prioridad_final != null ? Number(item.prioridad_final) : null,
        volume         : item.volume != null ? Number(item.volume) : null,
        tipo_articulo  : (item.tipo_articulo as string | null) ?? null,
        assignee_name  : (item.assignee_name as string | null) ?? (item.redactor_asignado as string | null) ?? null,
        month_number   : m + 1,
        scheduled_date : dates[i] ? toDateStr(dates[i]) : toDateStr(new Date(calYear, adjustedMonth, 1)),
      })
    }
  }

  // ── PASO 5: Resumen por mes ──────────────────────────────
  const quarterLabel  = `Q${quarter}-${year}`
  const { start: qStart, end: qEnd } = quarterRange(year, quarter)

  const monthLabels: string[] = []
  const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  for (let m = 0; m < 3; m++) {
    const calMonth = (startMonth + m) % 12
    monthLabels.push(MESES_ES[calMonth])
  }

  const months = [1, 2, 3].map((mn) => ({
    month_number: mn,
    label       : monthLabels[mn - 1],
    count       : suggestedItems.filter((i) => i.month_number === mn).length,
  }))

  return NextResponse.json({
    ok             : true,
    quarter        : quarterLabel,
    start_date     : toDateStr(qStart),
    end_date       : toDateStr(qEnd),
    total_capacity : totalCapacity,
    total_selected : suggestedItems.length,
    total_available: items.length,
    months,
    items          : suggestedItems,
  })
}
