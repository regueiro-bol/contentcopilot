import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ExcelJS from 'exceljs'

// ─── Colores por valor ──────────────────────────────────────────────────────

const COLOR_FUNNEL: Record<string, string> = {
  tofu: 'DBEAFE', // azul claro
  mofu: 'FEF9C3', // amarillo claro
  bofu: 'DCFCE7', // verde claro
}

const COLOR_PRIORIDAD: Record<number, string> = {
  1: 'FEE2E2', // rojo claro — Alta
  2: 'FEF9C3', // amarillo claro — Media
  3: 'F3F4F6', // gris claro — Baja
}

const COLOR_CONTENT_STATUS: Record<string, string> = {
  gap: 'DBEAFE',
  existing_content: 'DCFCE7',
  partial: 'FEF9C3',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function etiquetaPrioridad(p: number): string {
  return p === 1 ? 'Alta' : p === 3 ? 'Baja' : 'Media'
}

function etiquetaFunnel(f: string | null): string {
  if (!f) return ''
  return { tofu: 'TOFU', mofu: 'MOFU', bofu: 'BOFU' }[f] ?? f.toUpperCase()
}

function etiquetaContentStatus(s: string | null): string {
  if (!s) return ''
  return {
    gap: 'Gap',
    existing_content: 'Contenido existente',
    partial: 'Parcial',
  }[s] ?? s
}

function formatMonth(ym: string | null): string {
  if (!ym) return ''
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
    'Septiembre','Octubre','Noviembre','Diciembre']
  const [year, month] = ym.split('-').map(Number)
  if (!year || !month) return ym
  return `${MESES[(month - 1) % 12]} ${year}`
}

// ─── Tipo para filas de la BD ────────────────────────────────────────────────

interface MapItemRow {
  id                : string
  title             : string
  slug              : string | null
  main_keyword      : string
  secondary_keywords: unknown
  cluster           : string | null
  funnel_stage      : string | null
  volume            : number | null
  difficulty        : number | null
  priority          : number
  suggested_month   : string | null
  status            : string
  contenido_id      : string | null
  sort_order        : number
  content_status    : string | null
  existing_url      : string | null
  similarity_score  : number | null
  gsc_opportunity   : number | null
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  // Cargar sesión (para nombre de cliente)
  const { data: session } = await supabase
    .from('vista_strategy_sessions')
    .select('id, nombre, client_nombre')
    .eq('id', params.sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

  // Cargar mapa más reciente
  const { data: map } = await supabase
    .from('content_maps')
    .select('id, nombre')
    .eq('session_id', params.sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!map) return NextResponse.json({ error: 'No hay mapa generado para esta sesión' }, { status: 404 })

  // Cargar items del mapa
  const { data: rawItems, error } = await supabase
    .from('content_map_items')
    .select(
      'id, title, slug, main_keyword, secondary_keywords, cluster, funnel_stage, volume, difficulty, priority, suggested_month, status, contenido_id, sort_order, content_status, existing_url, similarity_score'
    )
    .eq('map_id', map.id)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[export-excel] Supabase error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items: MapItemRow[] = ((rawItems ?? []) as Omit<MapItemRow, 'gsc_opportunity'>[]).map(
    (r) => ({ ...r, gsc_opportunity: null })
  )

  // ── Generar Excel ────────────────────────────────────────────────────────

  try {

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ContentCopilot'
  wb.created = new Date()

  // ── Hoja 1: Mapa Completo ────────────────────────────────────────────────

  const ws1 = wb.addWorksheet('Mapa Completo')

  // Fila de título del cliente
  ws1.mergeCells('A1:N1')
  const titleCell = ws1.getCell('A1')
  titleCell.value = `Mapa de contenidos — ${session.client_nombre}`
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E1E1E' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  ws1.getRow(1).height = 28

  ws1.addRow([]) // fila vacía

  // Cabeceras
  const HEADERS = [
    'Mes',
    'Título',
    'Keyword principal',
    'Keywords secundarias',
    'Cluster',
    'Funnel',
    'Volumen',
    'Dificultad',
    'Prioridad',
    'Estado gap',
    'URL existente',
    'Score similitud',
    'Oportunidad GSC',
    'Slug',
  ]

  const headerRow = ws1.addRow(HEADERS)
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF6366F1' } },
    }
  })

  // Columnas: anchos
  ws1.columns = [
    { key: 'mes',          width: 14 },
    { key: 'titulo',       width: 38 },
    { key: 'kw',           width: 28 },
    { key: 'kw_sec',       width: 28 },
    { key: 'cluster',      width: 18 },
    { key: 'funnel',       width: 10 },
    { key: 'volumen',      width: 10 },
    { key: 'dificultad',   width: 12 },
    { key: 'prioridad',    width: 11 },
    { key: 'estado_gap',   width: 20 },
    { key: 'url',          width: 28 },
    { key: 'score',        width: 14 },
    { key: 'oportunidad',  width: 14 },
    { key: 'slug',         width: 32 },
  ]

  // Filas de datos
  for (const item of items) {
    const kwSec = Array.isArray(item.secondary_keywords)
      ? (item.secondary_keywords as string[]).join(', ')
      : ''

    const rowData = [
      formatMonth(item.suggested_month),
      item.title,
      item.main_keyword,
      kwSec,
      item.cluster ?? '',
      etiquetaFunnel(item.funnel_stage),
      item.volume ?? '',
      item.difficulty ?? '',
      etiquetaPrioridad(item.priority),
      etiquetaContentStatus(item.content_status),
      item.existing_url ?? '',
      item.similarity_score != null ? Math.round(item.similarity_score * 100) / 100 : '',
      item.gsc_opportunity ?? '',
      item.slug ?? '',
    ]

    const dataRow = ws1.addRow(rowData)
    dataRow.height = 20

    // Color por funnel (columna F = índice 6)
    const funnelColor = item.funnel_stage ? COLOR_FUNNEL[item.funnel_stage] : null
    if (funnelColor) {
      const cell = dataRow.getCell(6)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${funnelColor}` } }
    }

    // Color por prioridad (columna I = índice 9)
    const prioColor = COLOR_PRIORIDAD[item.priority]
    if (prioColor) {
      const cell = dataRow.getCell(9)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${prioColor}` } }
    }

    // Color por content_status (columna J = índice 10)
    const statusColor = item.content_status ? COLOR_CONTENT_STATUS[item.content_status] : null
    if (statusColor) {
      const cell = dataRow.getCell(10)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${statusColor}` } }
    }

    // Alineación general
    dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNum <= 2 || colNum === 14 ? 'left' : 'center',
        wrapText: false,
      }
      cell.font = { size: 10 }
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      }
    })
  }

  // Fijar cabecera + título
  ws1.views = [{ state: 'frozen', ySplit: 3 }]

  // ── Hoja 2: Resumen KPIs ─────────────────────────────────────────────────

  const ws2 = wb.addWorksheet('Resumen')

  ws2.columns = [
    { width: 26 },
    { width: 16 },
  ]

  const addKpiRow = (label: string, value: string | number, bgArgb?: string) => {
    const r = ws2.addRow([label, value])
    r.height = 20
    r.getCell(1).font = { bold: true, size: 10 }
    r.getCell(2).alignment = { horizontal: 'center' }
    r.getCell(2).font = { size: 10 }
    if (bgArgb) {
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } }
      r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } }
    }
    r.eachCell((c) => {
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
    })
    return r
  }

  // Título resumen
  ws2.mergeCells('A1:B1')
  const sumTitle = ws2.getCell('A1')
  sumTitle.value = `Resumen — ${session.client_nombre}`
  sumTitle.font = { bold: true, size: 13, color: { argb: 'FF1E1E1E' } }
  sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
  sumTitle.alignment = { horizontal: 'center', vertical: 'middle' }
  ws2.getRow(1).height = 26
  ws2.addRow([])

  // KPIs generales
  addKpiRow('Total artículos', items.length, 'FFF9FAFB')
  addKpiRow('Con fecha asignada', items.filter((i) => i.suggested_month).length)
  addKpiRow('Sin fecha', items.filter((i) => !i.suggested_month).length)

  ws2.addRow([])

  // Por funnel
  const byFunnel = { tofu: 0, mofu: 0, bofu: 0, sin: 0 }
  for (const i of items) {
    if (i.funnel_stage === 'tofu') byFunnel.tofu++
    else if (i.funnel_stage === 'mofu') byFunnel.mofu++
    else if (i.funnel_stage === 'bofu') byFunnel.bofu++
    else byFunnel.sin++
  }
  addKpiRow('TOFU', byFunnel.tofu, `FF${COLOR_FUNNEL.tofu}`)
  addKpiRow('MOFU', byFunnel.mofu, `FF${COLOR_FUNNEL.mofu}`)
  addKpiRow('BOFU', byFunnel.bofu, `FF${COLOR_FUNNEL.bofu}`)
  if (byFunnel.sin > 0) addKpiRow('Sin funnel', byFunnel.sin)

  ws2.addRow([])

  // Por prioridad
  const byPrio = { alta: 0, media: 0, baja: 0 }
  for (const i of items) {
    if (i.priority === 1) byPrio.alta++
    else if (i.priority === 3) byPrio.baja++
    else byPrio.media++
  }
  addKpiRow('Prioridad Alta', byPrio.alta, `FF${COLOR_PRIORIDAD[1]}`)
  addKpiRow('Prioridad Media', byPrio.media, `FF${COLOR_PRIORIDAD[2]}`)
  addKpiRow('Prioridad Baja', byPrio.baja, `FF${COLOR_PRIORIDAD[3]}`)

  ws2.addRow([])

  // Por content_status
  const byStatus = { gap: 0, existing_content: 0, partial: 0, sin: 0 }
  for (const i of items) {
    if (i.content_status === 'gap') byStatus.gap++
    else if (i.content_status === 'existing_content') byStatus.existing_content++
    else if (i.content_status === 'partial') byStatus.partial++
    else byStatus.sin++
  }
  addKpiRow('Gaps de contenido', byStatus.gap, `FF${COLOR_CONTENT_STATUS.gap}`)
  addKpiRow('Contenido existente', byStatus.existing_content, `FF${COLOR_CONTENT_STATUS.existing_content}`)
  addKpiRow('Contenido parcial', byStatus.partial, `FF${COLOR_CONTENT_STATUS.partial}`)
  if (byStatus.sin > 0) addKpiRow('Sin analizar', byStatus.sin)

  ws2.addRow([])

  // Volumen total estimado
  const totalVolumen = items.reduce((acc, i) => acc + (i.volume ?? 0), 0)
  addKpiRow('Volumen total estimado', totalVolumen.toLocaleString('es-ES'), 'FFF9FAFB')

  // Clusters únicos
  const clusters = new Set(items.map((i) => i.cluster).filter(Boolean))
  addKpiRow('Clusters', clusters.size, 'FFF9FAFB')

  // ── Serializar y devolver ────────────────────────────────────────────────

  const buffer = await wb.xlsx.writeBuffer()

  const clientSlug = session.client_nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  const filename = `mapa-contenidos-${clientSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })

  } catch (e) {
    console.error('[export-excel] Error generando Excel:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
