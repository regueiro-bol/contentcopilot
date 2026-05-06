/**
 * POST /api/strategy/create-quarterly-plan
 *
 * Crea el plan trimestral en quarterly_plans, inserta las entradas en
 * quarterly_plan_items y crea una entrada en calendario_editorial por
 * cada artículo planificado.
 *
 * Body: {
 *   clientId        : string
 *   quarter         : number  (1-4)
 *   year            : number
 *   articlesPerMonth: number
 *   items: Array<{
 *     id            : string  (content_map_item_id)
 *     title         : string
 *     main_keyword  : string | null
 *     cluster       : string | null
 *     funnel_stage  : string | null
 *     tipo_articulo : string | null
 *     scheduled_date: string  (YYYY-MM-DD)
 *     month_number  : number  (1-3)
 *     assignee_name : string | null
 *   }>
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

function quarterDates(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3
  const start = new Date(year, startMonth, 1)
  const end   = new Date(year, startMonth + 3, 0)
  const toStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: toStr(start), end: toStr(end) }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: {
    clientId        ?: string
    quarter         ?: number
    year            ?: number
    articlesPerMonth?: number
    items           ?: Array<{
      id            : string
      title         : string
      main_keyword  : string | null
      cluster       : string | null
      funnel_stage  : string | null
      tipo_articulo : string | null
      scheduled_date: string
      month_number  : number
      assignee_name : string | null
    }>
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId, quarter, year, articlesPerMonth = 6, items = [] } = body

  if (!clientId)         return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  if (!quarter || !year) return NextResponse.json({ error: 'quarter y year requeridos' }, { status: 400 })
  if (items.length === 0) return NextResponse.json({ error: 'No hay artículos para planificar' }, { status: 400 })

  const supabase    = createAdminClient()
  const quarterStr  = `Q${quarter}-${year}`
  const { start, end } = quarterDates(year, quarter)

  // ── Crear o actualizar el plan trimestral ────────────────
  const { data: plan, error: planErr } = await supabase
    .from('quarterly_plans')
    .upsert(
      {
        client_id        : clientId,
        quarter          : quarterStr,
        year,
        quarter_num      : quarter,
        start_date       : start,
        end_date         : end,
        articles_per_month: articlesPerMonth,
        total_planned    : items.length,
        status           : 'activo',
        updated_at       : new Date().toISOString(),
      },
      { onConflict: 'client_id,quarter' },
    )
    .select('id')
    .single()

  if (planErr || !plan) {
    console.error('[CreateQuarterlyPlan] Error creando plan:', planErr?.message)
    return NextResponse.json({ error: 'Error creando el plan trimestral' }, { status: 500 })
  }

  const planId = plan.id as string

  // ── Eliminar items anteriores del plan (si se regenera) ──
  await supabase
    .from('quarterly_plan_items')
    .delete()
    .eq('plan_id', planId)

  // ── Crear entradas en calendario_editorial ───────────────
  const calendarInserts = items.map((item) => ({
    client_id        : clientId,
    map_item_id      : item.id,
    titulo           : item.title,
    keyword          : item.main_keyword ?? null,
    cluster          : item.cluster ?? null,
    funnel_stage     : item.funnel_stage ?? null,
    tipo_articulo    : item.tipo_articulo ?? 'nuevo',
    fecha_publicacion: item.scheduled_date,
    status           : 'planificado',
    fuente           : 'almacen',
    redactor_id      : item.assignee_name ?? null,
  }))

  const { data: calItems, error: calErr } = await supabase
    .from('calendario_editorial')
    .insert(calendarInserts)
    .select('id, map_item_id')

  if (calErr) {
    console.error('[CreateQuarterlyPlan] Error inserting calendar items:', calErr.message)
    return NextResponse.json({ error: 'Error creando entradas en calendario' }, { status: 500 })
  }

  // Mapa: content_map_item_id → calendario_id
  const calIdByMapItem = new Map<string, string>()
  for (const ci of calItems ?? []) {
    if (ci.map_item_id) calIdByMapItem.set(String(ci.map_item_id), String(ci.id))
  }

  // ── Crear quarterly_plan_items ───────────────────────────
  const planItemInserts = items.map((item, idx) => ({
    plan_id             : planId,
    content_map_item_id : item.id,
    calendario_id       : calIdByMapItem.get(item.id) ?? null,
    scheduled_date      : item.scheduled_date,
    month_number        : item.month_number,
    order_in_week       : idx + 1,
    status              : 'programado',
  }))

  const { error: piErr } = await supabase
    .from('quarterly_plan_items')
    .insert(planItemInserts)

  if (piErr) {
    console.error('[CreateQuarterlyPlan] Error inserting plan items:', piErr.message)
    // No es fatal — el plan y el calendario ya están creados
  }

  // ── Marcar content_map_items como con fecha_calendario ───
  const mapItemIds = items.map((i) => i.id)
  await supabase
    .from('content_map_items')
    .update({ fecha_calendario: null }) // evitar null constraint
    .in('id', mapItemIds)

  console.log(`[CreateQuarterlyPlan] Plan ${planId} — ${items.length} artículos → Q${quarter} ${year}`)

  return NextResponse.json({
    ok        : true,
    plan_id   : planId,
    quarter   : quarterStr,
    created   : calItems?.length ?? 0,
    start_date: start,
    end_date  : end,
  })
}
