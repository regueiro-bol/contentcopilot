'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  CalendarDays, CalendarClock,
  ChevronLeft, ChevronRight,
  Plus, X, Loader2, ExternalLink, AlertCircle,
  Archive, Zap, Pencil, ArrowUpRight,
  CheckCircle2, Eye, GripVertical,
} from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, DragStartEvent, DragEndEvent,
  useDroppable, useDraggable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DatePickerPopover } from '@/components/ui/DatePickerPopover'
import { cn } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Cliente { id: string; nombre: string }

interface CalendarioItem {
  id               : string
  client_id        : string
  map_item_id      : string | null
  contenido_id     : string | null
  oportunidad_id   : string | null
  titulo           : string
  keyword          : string | null
  tipo_articulo    : string | null
  funnel_stage     : string | null
  cluster          : string | null
  fecha_publicacion: string   // 'YYYY-MM-DD'
  fecha_entrega    : string | null
  redactor_id      : string | null
  status           : string
  fuente           : string
  notas            : string | null
}

interface ContenidoPreview {
  id               : string
  titulo           : string
  keyword_principal: string | null
  estado           : string
  texto_contenido  : string | null
  brief            : { texto_generado?: string } | null
}

interface Props { clientes: Cliente[] }

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

function mesAQuarter(mes: number): number { return Math.ceil(mes / 3) }
const QUARTER_MESES: Record<number, string> = {
  1: 'Ene–Mar', 2: 'Abr–Jun', 3: 'Jul–Sep', 4: 'Oct–Dic',
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  planificado : { label: 'Planificado',   cls: 'bg-gray-100 text-gray-600'      },
  en_redaccion: { label: 'En redacción',  cls: 'bg-violet-100 text-violet-700'  },
  revision    : { label: 'Revisión',      cls: 'bg-amber-100 text-amber-700'    },
  publicado   : { label: 'Publicado',     cls: 'bg-emerald-100 text-emerald-700' },
  cancelado   : { label: 'Cancelado',     cls: 'bg-red-100 text-red-600'        },
}

const FUNNEL_STYLE: Record<string, string> = {
  tofu: 'bg-sky-100 text-sky-700',
  mofu: 'bg-violet-100 text-violet-700',
  bofu: 'bg-emerald-100 text-emerald-700',
}

const FUENTE_BORDER: Record<string, string> = {
  actualidad: 'border-l-2 border-l-amber-400',
  almacen   : 'border-l-2 border-l-indigo-300',
}

function StatusChipIcon({ status }: { status: string }) {
  if (status === 'publicado')    return <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
  if (status === 'revision')     return <Eye className="h-3 w-3 text-blue-400 shrink-0" />
  if (status === 'en_redaccion') return <Pencil className="h-2.5 w-2.5 text-gray-400 shrink-0" />
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildWeeks(anio: number, mes: number): Date[][] {
  const weeks: Date[][] = []
  const primero = new Date(anio, mes - 1, 1)
  let diaSemana = primero.getDay()
  if (diaSemana === 0) diaSemana = 7
  const inicio = new Date(primero)
  inicio.setDate(primero.getDate() - (diaSemana - 1))
  const cur = new Date(inicio)
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
    if (cur.getMonth() !== mes - 1 && cur.getFullYear() >= anio) {
      if (cur.getMonth() > mes - 1 || cur.getFullYear() > anio) break
    }
  }
  return weeks
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtFecha(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Chip (draggable) ─────────────────────────────────────────────────────────

function CalChip({
  item, isDragOverlay = false, onClick,
}: {
  item: CalendarioItem
  isDragOverlay?: boolean
  onClick?: (item: CalendarioItem) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id })

  const style = isDragOverlay
    ? { opacity: 0.95, cursor: 'grabbing' }
    : {
        transform: CSS.Translate.toString(transform),
        opacity  : isDragging ? 0.3 : 1,
        cursor   : isDragging ? 'grabbing' : 'grab',
      }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => { e.stopPropagation(); onClick?.(item) }}
      className={cn(
        'w-full text-left rounded-md bg-white hover:border-indigo-300 hover:shadow-sm transition-all px-1.5 py-1',
        'border border-gray-200',
        FUENTE_BORDER[item.fuente] ?? 'border-l-2 border-l-gray-200',
        item.status === 'publicado' && 'opacity-70',
        isDragOverlay && 'shadow-lg rotate-1',
      )}
    >
      <div className="flex items-start gap-1">
        {item.fuente === 'actualidad' && (
          <Zap className="h-2.5 w-2.5 text-amber-500 mt-0.5 shrink-0" />
        )}
        <p className={cn(
          'text-[11px] font-medium leading-snug line-clamp-2 flex-1',
          item.status === 'publicado' ? 'text-gray-400' : 'text-gray-800',
        )}>
          {item.titulo}
        </p>
        <StatusChipIcon status={item.status} />
      </div>
    </div>
  )
}

// ─── Day cell (droppable) ──────────────────────────────────────────────────────

function DayCell({
  dateStr, esMesActual, esHoy, articulosDia, onDayClick, onChipClick,
}: {
  dateStr      : string
  esMesActual  : boolean
  esHoy        : boolean
  articulosDia : CalendarioItem[]
  onDayClick   : (dateStr: string) => void
  onChipClick  : (item: CalendarioItem) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateStr })
  const dayNum = parseInt(dateStr.split('-')[2], 10)

  return (
    <div
      ref={setNodeRef}
      onClick={() => onDayClick(dateStr)}
      className={cn(
        'p-1.5 min-h-[110px] flex flex-col gap-1 transition-colors cursor-pointer',
        !esMesActual && 'bg-gray-50/60',
        isOver && 'bg-indigo-50/50 ring-1 ring-inset ring-indigo-300',
      )}
    >
      <span className={cn(
        'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full shrink-0',
        esHoy
          ? 'bg-indigo-600 text-white font-bold'
          : esMesActual ? 'text-gray-700' : 'text-gray-300',
      )}>
        {dayNum}
      </span>

      {articulosDia.map(item => (
        <CalChip key={item.id} item={item} onClick={onChipClick} />
      ))}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CalendarioClient({ clientes }: Props) {
  const hoy = new Date()
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? '')
  const [mes,  setMes]            = useState(hoy.getMonth() + 1)
  const [anio, setAnio]           = useState(hoy.getFullYear())

  const [items,    setItems]    = useState<CalendarioItem[]>([])
  const [cargando, setCargando] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [toast,    setToast]    = useState<string | null>(null)

  // Optimistic overrides (fecha_publicacion changes)
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<CalendarioItem>>>({})

  // Preview panel
  const [previewItem,      setPreviewItem]      = useState<CalendarioItem | null>(null)
  const [previewContenido, setPreviewContenido] = useState<ContenidoPreview | null>(null)
  const [previewLoading,   setPreviewLoading]   = useState(false)
  const [previewDatePos,   setPreviewDatePos]   = useState({ top: 0, left: 0 })
  const [previewDateOpen,  setPreviewDateOpen]  = useState(false)
  const [previewDateSaving,setPreviewDateSaving]= useState(false)
  const changeFechaRef = useRef<HTMLButtonElement>(null)

  // Modal añadir contenido existente
  const [modalContenido,    setModalContenido]    = useState(false)
  const [contenidosSinFecha, setContenidosSinFecha] = useState<Array<{
    id: string; titulo: string; keyword_principal: string | null; estado: string
  }>>([])
  const [loadingContenidos, setLoadingContenidos] = useState(false)
  const [selContenidoId,    setSelContenidoId]    = useState<string | null>(null)
  const [fechaContenido,    setFechaContenido]    = useState(toDateStr(hoy))
  const [busquedaContenido, setBusquedaContenido] = useState('')
  const [guardandoContenido,setGuardandoContenido]= useState(false)
  const [errorContenido,    setErrorContenido]    = useState<string | null>(null)

  // Drag & drop
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [draggingItem, setDraggingItem] = useState<CalendarioItem | null>(null)

  // ── Cargar ────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!clienteId) return
    setCargando(true); setError(null)
    try {
      const res  = await fetch(`/api/strategy/calendario?client_id=${clienteId}&mes=${mes}&anio=${anio}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error cargando')
      setItems(data.items)
      setLocalOverrides({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally { setCargando(false) }
  }, [clienteId, mes, anio])

  useEffect(() => { cargar() }, [cargar])

  // ── Fetch preview contenido ────────────────────────────────
  useEffect(() => {
    if (!previewItem?.contenido_id) { setPreviewContenido(null); return }
    setPreviewLoading(true)
    fetch(`/api/contenidos/${previewItem.contenido_id}/preview`)
      .then(r => r.json())
      .then(d => setPreviewContenido(d))
      .catch(() => setPreviewContenido(null))
      .finally(() => setPreviewLoading(false))
  }, [previewItem?.contenido_id])

  // ── Navegación ─────────────────────────────────────────────
  function mesAnterior()  { if (mes === 1) { setMes(12); setAnio(a => a-1) } else setMes(m => m-1) }
  function mesSiguiente() { if (mes === 12){ setMes(1);  setAnio(a => a+1) } else setMes(m => m+1) }

  // ── Merged items ───────────────────────────────────────────
  const itemsMerged = useMemo(
    () => items.map(i => localOverrides[i.id] ? { ...i, ...localOverrides[i.id] } : i),
    [items, localOverrides],
  )

  const itemsPorFecha = useMemo(() => {
    const map: Record<string, CalendarioItem[]> = {}
    for (const i of itemsMerged) {
      if (!map[i.fecha_publicacion]) map[i.fecha_publicacion] = []
      map[i.fecha_publicacion].push(i)
    }
    return map
  }, [itemsMerged])

  const kpis = useMemo(() => ({
    planificados: itemsMerged.filter(i => i.status === 'planificado').length,
    en_redaccion: itemsMerged.filter(i => i.status === 'en_redaccion').length,
    publicados  : itemsMerged.filter(i => i.status === 'publicado').length,
  }), [itemsMerged])

  const weeks = useMemo(() => buildWeeks(anio, mes), [anio, mes])

  // ── Drag & drop handlers ───────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    const item = itemsMerged.find(i => i.id === event.active.id)
    setDraggingItem(item ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingItem(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const entradaId   = String(active.id)
    const nuevaFecha  = String(over.id)   // over.id is the dateStr
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) return  // not a date cell

    const prevItem = itemsMerged.find(i => i.id === entradaId)
    if (!prevItem || prevItem.fecha_publicacion === nuevaFecha) return

    // Optimistic update
    setLocalOverrides(p => ({ ...p, [entradaId]: { fecha_publicacion: nuevaFecha } }))

    try {
      const res = await fetch(`/api/strategy/calendario/${entradaId}`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ fecha_publicacion: nuevaFecha }),
      })
      if (!res.ok) throw new Error('Error actualizando')
      const fechaFmt = new Date(nuevaFecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
      showToast(`✓ Movido al ${fechaFmt}`)
    } catch {
      // Revert
      setLocalOverrides(p => { const n = { ...p }; delete n[entradaId]; return n })
      showToast('Error al mover la entrada')
    }
  }

  // ── Preview panel ──────────────────────────────────────────
  function openPreview(item: CalendarioItem) {
    setPreviewItem(item)
    setPreviewDateOpen(false)
  }

  function openPreviewDatePicker() {
    if (!changeFechaRef.current) return
    const rect = changeFechaRef.current.getBoundingClientRect()
    const top  = rect.bottom + 8
    const left = Math.max(8, rect.right - 284)
    setPreviewDatePos({ top, left })
    setPreviewDateOpen(true)
  }

  async function handleCambiarFechaPreview(nuevaFecha: string) {
    if (!previewItem) return
    setPreviewDateSaving(true)
    setPreviewDateOpen(false)
    // Optimistic
    const entradaId = previewItem.id
    setLocalOverrides(p => ({ ...p, [entradaId]: { fecha_publicacion: nuevaFecha } }))
    setPreviewItem(p => p ? { ...p, fecha_publicacion: nuevaFecha } : p)
    try {
      const res = await fetch(`/api/strategy/calendario/${entradaId}`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ fecha_publicacion: nuevaFecha }),
      })
      if (!res.ok) throw new Error()
      const fechaFmt = new Date(nuevaFecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
      showToast(`✓ Replanificado para el ${fechaFmt}`)
    } catch {
      setLocalOverrides(p => { const n = { ...p }; delete n[entradaId]; return n })
      setPreviewItem(p => p ? { ...p, fecha_publicacion: previewItem.fecha_publicacion } : p)
    } finally {
      setPreviewDateSaving(false)
    }
  }

  // ── Day click ──────────────────────────────────────────────
  function handleClickDay(dateStr: string) {
    setFechaContenido(dateStr)
    setSelContenidoId(null)
    setBusquedaContenido('')
    setErrorContenido(null)
    abrirModalContenido(dateStr)
  }

  // ── Modal contenido existente ──────────────────────────────
  async function abrirModalContenido(fechaInicial?: string) {
    setModalContenido(true)
    if (fechaInicial) setFechaContenido(fechaInicial)
    else setFechaContenido(toDateStr(hoy))
    setSelContenidoId(null)
    setBusquedaContenido('')
    setErrorContenido(null)
    if (!clienteId) return
    setLoadingContenidos(true)
    try {
      const res = await fetch(`/api/contenidos/sin-fecha?client_id=${clienteId}`)
      const data = await res.json()
      setContenidosSinFecha(data.contenidos ?? [])
    } catch { setContenidosSinFecha([]) }
    finally { setLoadingContenidos(false) }
  }

  async function handleAñadirContenido(e: React.FormEvent) {
    e.preventDefault()
    if (!selContenidoId || !fechaContenido) return
    const sel = contenidosSinFecha.find(c => c.id === selContenidoId)
    if (!sel) return
    setGuardandoContenido(true); setErrorContenido(null)
    try {
      const res = await fetch('/api/strategy/calendario', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          client_id        : clienteId,
          titulo           : sel.titulo,
          keyword          : sel.keyword_principal ?? null,
          fecha_publicacion: fechaContenido,
          contenido_id     : selContenidoId,
          fuente           : 'manual',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error añadiendo')
      if (data.entrada) setItems(p => [...p, data.entrada])
      setModalContenido(false)
      const fechaFmt = new Date(fechaContenido + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
      showToast(`✓ Añadido al calendario para el ${fechaFmt}`)
    } catch (err) {
      setErrorContenido(err instanceof Error ? err.message : 'Error desconocido')
    } finally { setGuardandoContenido(false) }
  }

  const contenidosFiltrados = contenidosSinFecha.filter(c =>
    !busquedaContenido || c.titulo.toLowerCase().includes(busquedaContenido.toLowerCase())
  )

  // ── Toast ──────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const clienteNombre = clientes.find(c => c.id === clienteId)?.nombre ?? '—'

  // ── Helpers preview ────────────────────────────────────────
  function getPreviewText(): string | null {
    if (!previewContenido) return null
    if (previewContenido.texto_contenido?.trim()) {
      const words = previewContenido.texto_contenido.split(/\s+/).slice(0, 420).join(' ')
      return words + (previewContenido.texto_contenido.split(/\s+/).length > 420 ? ' …' : '')
    }
    // Fall back to brief first section
    const briefText = previewContenido.brief?.texto_generado
    if (briefText) {
      // Extract first section (up to 400 words)
      const words = briefText.split(/\s+/).slice(0, 400).join(' ')
      return words + (briefText.split(/\s+/).length > 400 ? ' …' : '')
    }
    return null
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-indigo-600 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Calendario Editorial</h1>
            <p className="text-sm text-gray-500">{clienteNombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none cursor-pointer"
          >
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <Link
            href="/strategy/almacen"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Archive className="h-3.5 w-3.5" />
            Banco
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Button size="sm" onClick={() => abrirModalContenido()} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4" />
            Añadir contenido
          </Button>
        </div>
      </div>

      {/* ── Navegación mes + KPIs ──────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={mesAnterior} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <div className="min-w-[160px] text-center">
            <h2 className="text-base font-semibold text-gray-900">{MESES[mes - 1]} {anio}</h2>
            <p className="text-[10px] text-indigo-500 font-semibold -mt-0.5">
              Q{mesAQuarter(mes)} · {QUARTER_MESES[mesAQuarter(mes)]}
            </p>
          </div>
          <button type="button" onClick={mesSiguiente} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
          {cargando && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
        </div>
        <div className="flex items-center gap-2">
          {[
            { label: 'Planificados', value: kpis.planificados, color: 'text-gray-700'    },
            { label: 'En redacción', value: kpis.en_redaccion, color: 'text-violet-700'  },
            { label: 'Publicados',   value: kpis.publicados,   color: 'text-emerald-700' },
          ].map(({ label, value, color }) => (
            <Card key={label} className="min-w-[90px]">
              <CardContent className="p-2.5 text-center">
                <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
                <p className="text-[10px] text-gray-500">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* ── Grid mensual con DnD ───────────────────────────── */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {/* Cabecera días */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DIAS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500">{d}</div>
            ))}
          </div>
          {/* Semanas */}
          <div className="divide-y divide-gray-100">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 divide-x divide-gray-100">
                {week.map((dia) => {
                  const diaStr     = toDateStr(dia)
                  const esMesActual = dia.getMonth() === mes - 1
                  const esHoy      = diaStr === toDateStr(hoy)
                  return (
                    <DayCell
                      key={diaStr}
                      dateStr={diaStr}
                      esMesActual={esMesActual}
                      esHoy={esHoy}
                      articulosDia={itemsPorFecha[diaStr] ?? []}
                      onDayClick={handleClickDay}
                      onChipClick={openPreview}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {draggingItem
            ? <CalChip item={draggingItem} isDragOverlay />
            : null}
        </DragOverlay>
      </DndContext>

      {/* ── Panel preview ──────────────────────────────────── */}
      {previewItem && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => { setPreviewItem(null); setPreviewDateOpen(false) }}
          />
          <div className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div className="flex-1 pr-3">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {previewItem.funnel_stage && (
                    <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5', FUNNEL_STYLE[previewItem.funnel_stage] ?? 'bg-gray-100 text-gray-600')}>
                      {previewItem.funnel_stage.toUpperCase()}
                    </span>
                  )}
                  <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5', STATUS_STYLE[previewItem.status]?.cls ?? 'bg-gray-100 text-gray-600')}>
                    {STATUS_STYLE[previewItem.status]?.label ?? previewItem.status}
                  </span>
                </div>
                <h2 className="text-sm font-bold text-gray-900 leading-snug">{previewItem.titulo}</h2>
                {previewItem.keyword && (
                  <p className="text-xs text-gray-500 mt-0.5">{previewItem.keyword}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Planificado para el {fmtFecha(previewItem.fecha_publicacion)}
                </p>
              </div>
              <button type="button" onClick={() => { setPreviewItem(null); setPreviewDateOpen(false) }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto p-5">
              {previewLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                </div>
              ) : (
                <>
                  {(() => {
                    const text = getPreviewText()
                    const hasBorrador = !!previewContenido?.texto_contenido?.trim()
                    return text ? (
                      <div>
                        {!hasBorrador && (
                          <div className="flex items-center gap-1.5 mb-3">
                            <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                              Sin borrador — mostrando brief
                            </span>
                          </div>
                        )}
                        <div className="prose prose-sm prose-gray max-w-none text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                          {text}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
                        <CalendarClock className="h-8 w-8" />
                        <p className="text-sm">Sin contenido todavía</p>
                        <p className="text-xs text-gray-300">El borrador aparecerá aquí cuando esté generado</p>
                      </div>
                    )
                  })()}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 flex items-center gap-2">
              {previewItem.contenido_id && (
                <Link
                  href={`/contenidos/${previewItem.contenido_id}`}
                  target="_blank"
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg py-2 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver contenido completo
                </Link>
              )}
              <button
                ref={changeFechaRef}
                type="button"
                onClick={openPreviewDatePicker}
                disabled={previewDateSaving}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
              >
                {previewDateSaving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CalendarClock className="h-3.5 w-3.5" />
                }
                Cambiar fecha
              </button>
            </div>
          </div>

          {/* DatePicker del preview */}
          {previewDateOpen && (
            <DatePickerPopover
              currentDate={previewItem.fecha_publicacion}
              saving={previewDateSaving}
              position={previewDatePos}
              confirmLabel="Replanificar"
              onConfirm={handleCambiarFechaPreview}
              onClose={() => setPreviewDateOpen(false)}
            />
          )}
        </>
      )}

      {/* ── Modal añadir contenido existente ──────────────── */}
      {modalContenido && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setModalContenido(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Añadir contenido al calendario</h2>
              <button type="button" onClick={() => setModalContenido(false)}>
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleAñadirContenido} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {errorContenido && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{errorContenido}
                  </div>
                )}

                <div>
                  <input
                    type="text"
                    placeholder="Buscar contenido..."
                    value={busquedaContenido}
                    onChange={e => setBusquedaContenido(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
                  />
                </div>

                {loadingContenidos ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                  </div>
                ) : contenidosFiltrados.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    {busquedaContenido ? 'No hay resultados' : 'Todos los contenidos ya tienen fecha asignada'}
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {contenidosFiltrados.map((c) => (
                      <label
                        key={c.id}
                        className={cn(
                          'flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors',
                          selContenidoId === c.id
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300',
                        )}
                      >
                        <input
                          type="radio"
                          name="contenido"
                          value={c.id}
                          checked={selContenidoId === c.id}
                          onChange={() => setSelContenidoId(c.id)}
                          className="mt-0.5 accent-indigo-600"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 leading-snug">{c.titulo}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {c.keyword_principal && (
                              <span className="text-[10px] text-gray-500">{c.keyword_principal}</span>
                            )}
                            <span className={cn('text-[10px] px-1.5 py-0 rounded-full font-medium',
                              c.estado === 'aprobado'  ? 'bg-green-100 text-green-700' :
                              c.estado === 'borrador'  ? 'bg-blue-100 text-blue-700'  :
                              c.estado === 'pendiente' ? 'bg-gray-100 text-gray-600'  :
                              'bg-amber-100 text-amber-700'
                            )}>
                              {c.estado.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Fecha de publicación *</label>
                  <input
                    required
                    type="date"
                    value={fechaContenido}
                    onChange={e => setFechaContenido(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
                <Button type="button" variant="outline" size="sm" onClick={() => setModalContenido(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={guardandoContenido || !selContenidoId}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                >
                  {guardandoContenido ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Añadir al calendario
                </Button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Toast ─────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[10000] bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
