'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  ExternalLink,
  AlertCircle,
  Archive,
  Zap,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

interface Props { clientes: Cliente[] }

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  planificado : { label: 'Planificado',   cls: 'bg-gray-100 text-gray-600'     },
  en_redaccion: { label: 'En redacción',  cls: 'bg-violet-100 text-violet-700' },
  revision    : { label: 'Revisión',      cls: 'bg-amber-100 text-amber-700'   },
  publicado   : { label: 'Publicado',     cls: 'bg-emerald-100 text-emerald-700'},
  cancelado   : { label: 'Cancelado',     cls: 'bg-red-100 text-red-600'       },
}

const TIPO_STYLE: Record<string, string> = {
  nuevo       : 'bg-green-100 text-green-700',
  actualizacion: 'bg-blue-100 text-blue-700',
  mejora      : 'bg-amber-100 text-amber-700',
  actualidad  : 'bg-rose-100 text-rose-700',
}

const FUNNEL_STYLE: Record<string, string> = {
  tofu: 'bg-green-100 text-green-700',
  mofu: 'bg-amber-100 text-amber-700',
  bofu: 'bg-red-100 text-red-700',
}

function FuenteIcon({ fuente }: { fuente: string }) {
  if (fuente === 'almacen')    return <Archive className="h-2.5 w-2.5 shrink-0" title="Almacén" />
  if (fuente === 'actualidad') return <Zap     className="h-2.5 w-2.5 shrink-0" title="Actualidad" />
  return <Pencil className="h-2.5 w-2.5 shrink-0" title="Manual" />
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Devuelve las semanas del mes: cada semana es un array de 7 fechas (Lun-Dom).
 *  Los días fuera del mes aparecen como fecha real (para mostrar en gris). */
function buildCalendarWeeks(anio: number, mes: number): Date[][] {
  // mes es 1-based
  const primero = new Date(anio, mes - 1, 1)
  // ISO: lunes=1, domingo=7 → queremos lunes como primer día de semana
  const diaSemana = primero.getDay() === 0 ? 7 : primero.getDay() // 1-7
  const inicio    = new Date(primero)
  inicio.setDate(primero.getDate() - (diaSemana - 1))

  const weeks: Date[][] = []
  let cur = new Date(inicio)
  while (cur.getMonth() !== mes % 12 || cur.getFullYear() !== (cur.getMonth() === 0 && mes === 12 ? anio + 1 : anio)
    ? cur <= new Date(anio, mes - 1, new Date(anio, mes, 0).getDate())
    : false
  ) {
    // Simpler loop: 6 rows max
    if (weeks.length >= 6) break
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
    // Stop if we've passed the end of the month
    if (cur.getMonth() !== mes - 1 && weeks.length >= 4) {
      // Check if all remaining days are in next month
      const mesActual = mes - 1
      if (new Date(anio, mesActual + 1, 0).getDate() < cur.getDate() + 7) break
      if (cur.getMonth() !== mesActual) break
    }
  }
  return weeks
}

function buildWeeks(anio: number, mes: number): Date[][] {
  const weeks: Date[][] = []
  const primero = new Date(anio, mes - 1, 1)
  let diaSemana = primero.getDay() // 0=dom,1=lun...
  if (diaSemana === 0) diaSemana = 7 // domingo = 7

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
    // Si la primera celda de la siguiente semana ya es del mes siguiente, paramos
    if (cur.getMonth() !== mes - 1 && cur.getFullYear() >= anio) {
      const esMesSig = cur.getMonth() > mes - 1 || cur.getFullYear() > anio
      if (esMesSig) break
    }
  }
  return weeks
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CalendarioClient({ clientes }: Props) {
  const hoy      = new Date()
  const [clienteId, setClienteId]   = useState(clientes[0]?.id ?? '')
  const [mes, setMes]               = useState(hoy.getMonth() + 1)   // 1-12
  const [anio, setAnio]             = useState(hoy.getFullYear())

  const [items, setItems]           = useState<CalendarioItem[]>([])
  const [cargando, setCargando]     = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Panel lateral
  const [panelItem, setPanelItem]   = useState<CalendarioItem | null>(null)
  // Edición en panel
  const [panelEdits, setPanelEdits] = useState<Partial<CalendarioItem>>({})
  const [guardandoPanel, setGuardandoPanel] = useState(false)

  // Modal añadir
  const [modalOpen, setModalOpen]   = useState(false)
  const [modalData, setModalData]   = useState({
    titulo           : '',
    keyword          : '',
    fecha_publicacion: toDateStr(hoy),
    fecha_entrega    : '',
    tipo_articulo    : 'nuevo',
    funnel_stage     : '',
    cluster          : '',
    fuente           : 'manual',
    notas            : '',
  })
  const [guardandoModal, setGuardandoModal] = useState(false)
  const [errorModal, setErrorModal] = useState<string | null>(null)

  // Overrides optimistas
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<CalendarioItem>>>({})

  // ── Cargar items del mes ─────────────────────────────────
  const cargar = useCallback(async () => {
    if (!clienteId) return
    setCargando(true)
    setError(null)
    try {
      const res  = await fetch(`/api/strategy/calendario?client_id=${clienteId}&mes=${mes}&anio=${anio}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error cargando calendario')
      setItems(data.items)
      setLocalOverrides({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCargando(false)
    }
  }, [clienteId, mes, anio])

  useEffect(() => { cargar() }, [cargar])

  // ── Navegación de mes ────────────────────────────────────
  function mesAnterior() {
    if (mes === 1) { setMes(12); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }
  function mesSiguiente() {
    if (mes === 12) { setMes(1); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  // ── Items merged con overrides ───────────────────────────
  const itemsMerged = useMemo(
    () => items.map(i => localOverrides[i.id] ? { ...i, ...localOverrides[i.id] } : i),
    [items, localOverrides],
  )

  // Indexado por fecha para el grid
  const itemsPorFecha = useMemo(() => {
    const map: Record<string, CalendarioItem[]> = {}
    for (const i of itemsMerged) {
      if (!map[i.fecha_publicacion]) map[i.fecha_publicacion] = []
      map[i.fecha_publicacion].push(i)
    }
    return map
  }, [itemsMerged])

  // ── KPIs ─────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    planificados : itemsMerged.filter(i => i.status === 'planificado').length,
    en_redaccion : itemsMerged.filter(i => i.status === 'en_redaccion').length,
    publicados   : itemsMerged.filter(i => i.status === 'publicado').length,
  }), [itemsMerged])

  // ── Grid ─────────────────────────────────────────────────
  const weeks = useMemo(() => buildWeeks(anio, mes), [anio, mes])

  // ── Guardar cambios panel lateral ────────────────────────
  async function guardarPanel() {
    if (!panelItem || Object.keys(panelEdits).length === 0) return
    setGuardandoPanel(true)
    setLocalOverrides(p => ({ ...p, [panelItem.id]: { ...p[panelItem.id], ...panelEdits } }))
    try {
      const res = await fetch(`/api/strategy/calendario/${panelItem.id}`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(panelEdits),
      })
      if (!res.ok) throw new Error('Error guardando')
      setPanelEdits({})
      // Actualizar panelItem con los cambios
      setPanelItem(p => p ? { ...p, ...panelEdits } : p)
    } catch {
      setLocalOverrides(p => { const n = { ...p }; delete n[panelItem.id]; return n })
    } finally {
      setGuardandoPanel(false)
    }
  }

  // ── Cancelar entrada desde panel ─────────────────────────
  async function cancelarEntrada() {
    if (!panelItem) return
    if (!confirm('¿Cancelar esta entrada del calendario?')) return
    setLocalOverrides(p => ({ ...p, [panelItem.id]: { status: 'cancelado' } }))
    setPanelItem(null)
    await fetch(`/api/strategy/calendario/${panelItem.id}`, { method: 'DELETE' })
  }

  // ── Añadir artículo ──────────────────────────────────────
  async function handleAñadir(e: React.FormEvent) {
    e.preventDefault()
    if (!modalData.titulo || !modalData.fecha_publicacion) return
    setGuardandoModal(true)
    setErrorModal(null)
    try {
      const res = await fetch('/api/strategy/calendario', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          client_id        : clienteId,
          titulo           : modalData.titulo,
          keyword          : modalData.keyword || null,
          fecha_publicacion: modalData.fecha_publicacion,
          fecha_entrega    : modalData.fecha_entrega || null,
          tipo_articulo    : modalData.tipo_articulo,
          funnel_stage     : modalData.funnel_stage || null,
          cluster          : modalData.cluster || null,
          fuente           : modalData.fuente,
          notas            : modalData.notas || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error creando entrada')
      // Añadir el nuevo item al estado local
      if (data.entrada) setItems(p => [...p, data.entrada])
      setModalOpen(false)
      setModalData({ titulo:'', keyword:'', fecha_publicacion: toDateStr(hoy), fecha_entrega:'', tipo_articulo:'nuevo', funnel_stage:'', cluster:'', fuente:'manual', notas:'' })
    } catch (e) {
      setErrorModal(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setGuardandoModal(false)
    }
  }

  const clienteNombre = clientes.find(c => c.id === clienteId)?.nombre ?? '—'
  const hayPanelEdits = Object.keys(panelEdits).length > 0

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
          {/* Selector cliente */}
          <select
            value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none cursor-pointer"
          >
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <Button size="sm" onClick={() => setModalOpen(true)} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4" />
            Añadir artículo
          </Button>
        </div>
      </div>

      {/* ── Navegación mes + KPIs ──────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Navegación */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={mesAnterior} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <h2 className="text-base font-semibold text-gray-900 min-w-[140px] text-center">
            {MESES[mes - 1]} {anio}
          </h2>
          <button type="button" onClick={mesSiguiente} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
          {cargando && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
        </div>
        {/* KPIs */}
        <div className="flex items-center gap-2">
          {[
            { label: 'Planificados',  value: kpis.planificados,  color: 'text-gray-700'    },
            { label: 'En redacción',  value: kpis.en_redaccion,  color: 'text-violet-700'  },
            { label: 'Publicados',    value: kpis.publicados,    color: 'text-emerald-700' },
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

      {/* ── Error ─────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* ── Grid mensual ──────────────────────────────────── */}
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
            <div key={wi} className="grid grid-cols-7 divide-x divide-gray-100 min-h-[110px]">
              {week.map((dia, di) => {
                const diaStr    = toDateStr(dia)
                const esMesActual = dia.getMonth() === mes - 1
                const esHoy     = diaStr === toDateStr(hoy)
                const articulosDia = itemsPorFecha[diaStr] ?? []

                return (
                  <div
                    key={di}
                    className={cn(
                      'p-1.5 min-h-[110px] flex flex-col gap-1',
                      !esMesActual && 'bg-gray-50/60',
                    )}
                  >
                    {/* Número del día */}
                    <span className={cn(
                      'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                      esHoy
                        ? 'bg-indigo-600 text-white font-bold'
                        : esMesActual ? 'text-gray-700' : 'text-gray-300',
                    )}>
                      {dia.getDate()}
                    </span>

                    {/* Artículos del día */}
                    {articulosDia.map(item => {
                      const st  = STATUS_STYLE[item.status] ?? STATUS_STYLE.planificado
                      const tip = TIPO_STYLE[item.tipo_articulo ?? 'nuevo'] ?? 'bg-gray-100 text-gray-500'
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => { setPanelItem(item); setPanelEdits({}) }}
                          className="w-full text-left rounded-md border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm transition-all px-1.5 py-1 group"
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <FuenteIcon fuente={item.fuente} />
                            <span className={`text-[9px] font-bold rounded-full px-1.5 py-0 ${st.cls}`}>
                              {st.label}
                            </span>
                          </div>
                          <p className="text-[11px] font-medium text-gray-800 leading-snug line-clamp-2">
                            {item.titulo}
                          </p>
                          {item.tipo_articulo && (
                            <span className={`text-[9px] font-bold rounded-full px-1.5 py-0 ${tip}`}>
                              {item.tipo_articulo}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Panel lateral ─────────────────────────────────── */}
      {panelItem && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => { if (!hayPanelEdits) setPanelItem(null) }}
          />
          {/* Panel */}
          <div className="fixed right-0 top-0 h-full w-[420px] max-w-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div className="flex-1 pr-3">
                <div className="flex items-center gap-2 mb-1">
                  <FuenteIcon fuente={panelItem.fuente} />
                  <span className="text-xs text-gray-500 capitalize">{panelItem.fuente}</span>
                  {panelItem.funnel_stage && (
                    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${FUNNEL_STYLE[panelItem.funnel_stage] ?? ''}`}>
                      {panelItem.funnel_stage.toUpperCase()}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 leading-snug">{panelItem.titulo}</h3>
                {panelItem.keyword && (
                  <p className="text-xs text-gray-500 mt-0.5">{panelItem.keyword}</p>
                )}
              </div>
              <button type="button" onClick={() => setPanelItem(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cuerpo scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Cluster */}
              {panelItem.cluster && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Cluster</p>
                  <p className="text-sm text-gray-700">{panelItem.cluster}</p>
                </div>
              )}

              {/* Estado */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Estado</p>
                <select
                  value={panelEdits.status ?? panelItem.status}
                  onChange={e => setPanelEdits(p => ({ ...p, status: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-full bg-white outline-none"
                >
                  {Object.entries(STATUS_STYLE).filter(([k]) => k !== 'cancelado').map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              {/* Tipo artículo */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Tipo</p>
                <select
                  value={panelEdits.tipo_articulo ?? panelItem.tipo_articulo ?? 'nuevo'}
                  onChange={e => setPanelEdits(p => ({ ...p, tipo_articulo: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-full bg-white outline-none"
                >
                  <option value="nuevo">Nuevo</option>
                  <option value="actualizacion">Actualización</option>
                  <option value="mejora">Mejora</option>
                  <option value="actualidad">Actualidad</option>
                </select>
              </div>

              {/* Fecha publicación */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Fecha publicación</p>
                <input
                  type="date"
                  value={panelEdits.fecha_publicacion ?? panelItem.fecha_publicacion}
                  onChange={e => setPanelEdits(p => ({ ...p, fecha_publicacion: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-full outline-none"
                />
              </div>

              {/* Fecha entrega */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Fecha entrega</p>
                <input
                  type="date"
                  value={panelEdits.fecha_entrega ?? panelItem.fecha_entrega ?? ''}
                  onChange={e => setPanelEdits(p => ({ ...p, fecha_entrega: e.target.value || null }))}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-full outline-none"
                />
              </div>

              {/* Redactor */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Redactor</p>
                <input
                  type="text"
                  placeholder="Nombre o email del redactor..."
                  value={panelEdits.redactor_id ?? panelItem.redactor_id ?? ''}
                  onChange={e => setPanelEdits(p => ({ ...p, redactor_id: e.target.value || null }))}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-full outline-none placeholder:text-gray-300"
                />
              </div>

              {/* Notas */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Notas</p>
                <textarea
                  rows={3}
                  placeholder="Notas editoriales..."
                  value={panelEdits.notas ?? panelItem.notas ?? ''}
                  onChange={e => setPanelEdits(p => ({ ...p, notas: e.target.value || null }))}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-full outline-none resize-none placeholder:text-gray-300"
                />
              </div>

            </div>

            {/* Footer acciones */}
            <div className="p-4 border-t border-gray-100 space-y-2">
              {hayPanelEdits && (
                <Button
                  onClick={guardarPanel}
                  disabled={guardandoPanel}
                  className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700"
                  size="sm"
                >
                  {guardandoPanel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Guardar cambios
                </Button>
              )}
              {panelItem.contenido_id && (
                <Link
                  href={`/contenidos/${panelItem.contenido_id}`}
                  className="flex items-center justify-center gap-1.5 w-full text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg py-2 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ir al pedido
                </Link>
              )}
              <button
                type="button"
                onClick={cancelarEntrada}
                className="w-full text-sm font-medium text-red-600 hover:text-red-800 py-1.5 transition-colors"
              >
                Cancelar entrada
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal añadir artículo ─────────────────────────── */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Añadir artículo al calendario</h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleAñadir} className="p-5 space-y-3">
              {errorModal && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{errorModal}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Título *</label>
                <input
                  required
                  type="text"
                  placeholder="Título del artículo"
                  value={modalData.titulo}
                  onChange={e => setModalData(p => ({ ...p, titulo: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Keyword principal</label>
                <input
                  type="text"
                  placeholder="keyword principal"
                  value={modalData.keyword}
                  onChange={e => setModalData(p => ({ ...p, keyword: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Fecha publicación *</label>
                  <input
                    required
                    type="date"
                    value={modalData.fecha_publicacion}
                    onChange={e => setModalData(p => ({ ...p, fecha_publicacion: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Fecha entrega</label>
                  <input
                    type="date"
                    value={modalData.fecha_entrega}
                    onChange={e => setModalData(p => ({ ...p, fecha_entrega: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Tipo</label>
                  <select
                    value={modalData.tipo_articulo}
                    onChange={e => setModalData(p => ({ ...p, tipo_articulo: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none bg-white"
                  >
                    <option value="nuevo">Nuevo</option>
                    <option value="actualizacion">Actualización</option>
                    <option value="mejora">Mejora</option>
                    <option value="actualidad">Actualidad</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Funnel</label>
                  <select
                    value={modalData.funnel_stage}
                    onChange={e => setModalData(p => ({ ...p, funnel_stage: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none bg-white"
                  >
                    <option value="">— sin asignar —</option>
                    <option value="tofu">TOFU</option>
                    <option value="mofu">MOFU</option>
                    <option value="bofu">BOFU</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Cluster</label>
                <input
                  type="text"
                  placeholder="Cluster temático (opcional)"
                  value={modalData.cluster}
                  onChange={e => setModalData(p => ({ ...p, cluster: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Fuente</label>
                <select
                  value={modalData.fuente}
                  onChange={e => setModalData(p => ({ ...p, fuente: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none bg-white"
                >
                  <option value="manual">✏️ Manual</option>
                  <option value="almacen">🗂 Almacén</option>
                  <option value="actualidad">⚡ Actualidad</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Notas</label>
                <textarea
                  rows={2}
                  placeholder="Notas editoriales..."
                  value={modalData.notas}
                  onChange={e => setModalData(p => ({ ...p, notas: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-indigo-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={guardandoModal} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                  {guardandoModal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Añadir al calendario
                </Button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
