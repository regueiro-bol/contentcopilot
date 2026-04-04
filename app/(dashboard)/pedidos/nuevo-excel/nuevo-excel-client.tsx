'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Upload, Table2, CheckSquare, Square,
  Loader2, Check, AlertCircle, Wand2, Sparkles, ChevronDown, ChevronUp,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { SelectorProyecto } from '../selector-proyecto'
import type { FilaExcelSeo, Cliente } from '@/types'
import { crearPedidoDesdeArticulos } from '../actions'

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','unos','unas','de','del','en','a','para','por',
  'con','sin','sobre','como','que','y','o','e','u','al','se','su','sus','mi','tu',
  'es','son','hay','más','todo','todos','toda','todas','este','esta','estos','estas',
  'ese','esa','cómo','qué','cuál',
])

function sugerirKeyword(titulo: string): string {
  return titulo
    .toLowerCase()
    .replace(/[^a-záéíóúüñ\s]/gi, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 4)
    .join(' ')
}

function generarSlug(titulo: string): string {
  return (
    '/' +
    titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type Paso = 'seleccion' | 'previsualizacion' | 'revision' | 'resultado'

interface FilaRevision {
  titulo: string
  keyword: string
  url: string
  tamanyoMin: number
  tamanyoMax: number
  fechaEntrega: string
  estructuraH: string
  yaExiste: boolean
  revisada: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicador de pasos
// ─────────────────────────────────────────────────────────────────────────────

const NOMBRES_PASOS = ['Archivo', 'Previsualización', 'Revisión', 'Listo']
const PASO_IDX: Record<Paso, number> = {
  seleccion: 0, previsualizacion: 1, revision: 2, resultado: 3,
}

function IndicadorPasos({ paso }: { paso: Paso }) {
  const actual = PASO_IDX[paso]
  return (
    <div className="flex items-center gap-1">
      {NOMBRES_PASOS.map((nombre, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <div className="h-px w-6 bg-gray-200 flex-none mx-1" />}
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
              i === actual && 'bg-green-600 text-white',
              i < actual && 'bg-green-500 text-white',
              i > actual && 'bg-gray-200 text-gray-400',
            )}>
              {i < actual ? '✓' : i + 1}
            </div>
            <span className={cn(
              'hidden sm:block text-xs font-medium',
              i === actual && 'text-green-600',
              i < actual && 'text-green-600',
              i > actual && 'text-gray-400',
            )}>
              {nombre}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Semáforo de estado
// ─────────────────────────────────────────────────────────────────────────────

type EstadoFila = 'verde' | 'amarillo' | 'rojo'

function calcEstado(f: FilaRevision): EstadoFila {
  if (f.revisada) return 'verde'
  if (!f.titulo.trim()) return 'rojo'
  if (!f.keyword.trim()) return 'amarillo'
  return 'verde'
}

function Semaforo({ estado }: { estado: EstadoFila }) {
  return (
    <div className={cn(
      'h-2.5 w-2.5 rounded-full shrink-0',
      estado === 'verde' && 'bg-green-500',
      estado === 'amarillo' && 'bg-yellow-400',
      estado === 'rojo' && 'bg-red-500',
    )} />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Card de fila Excel
// ─────────────────────────────────────────────────────────────────────────────

function CardFila({
  fila,
  idx,
  total,
  expandida,
  onToggle,
  onUpdate,
  onGuardar,
}: {
  fila: FilaRevision
  idx: number
  total: number
  expandida: boolean
  onToggle: () => void
  onUpdate: <K extends keyof FilaRevision>(campo: K, valor: FilaRevision[K]) => void
  onGuardar: () => void
}) {
  const estado = calcEstado(fila)
  const sugerencia = sugerirKeyword(fila.titulo)

  return (
    <div className={cn(
      'rounded-xl border bg-white transition-shadow',
      expandida
        ? 'border-green-300 shadow-md'
        : fila.revisada
          ? 'border-green-200 bg-green-50/20'
          : 'border-gray-200',
      !expandida && fila.yaExiste && !fila.revisada && 'opacity-70',
    )}>
      {/* ── Cabecera de la card ─────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
        onClick={onToggle}
      >
        <Semaforo estado={estado} />

        {/* Badge "Revisado" */}
        {fila.revisada && !expandida && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 shrink-0">
            <Check className="h-3 w-3" />
            Revisado
          </span>
        )}

        <span className="text-xs font-medium text-gray-400 shrink-0 tabular-nums">
          {String(idx + 1).padStart(2, '0')} / {total}
        </span>

        <p className={cn(
          'flex-1 text-sm leading-snug line-clamp-1',
          !fila.titulo.trim() ? 'text-red-400 italic font-medium' : fila.revisada ? 'text-gray-900 font-semibold' : 'text-gray-900 font-medium',
        )}>
          {fila.titulo.trim() || 'Sin título'}
        </p>

        {/* Badge ya existe */}
        {fila.yaExiste && !fila.revisada && (
          <span className="hidden sm:inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700 shrink-0">
            Ya existe
          </span>
        )}

        {/* Badge keyword */}
        <div className="hidden sm:block shrink-0">
          {fila.keyword ? (
            <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 max-w-[180px] truncate">
              {fila.keyword}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-yellow-50 border border-yellow-200 px-2.5 py-0.5 text-xs text-yellow-600">
              Sin keyword
            </span>
          )}
        </div>

        <button
          type="button"
          className={cn(
            'shrink-0 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            expandida
              ? 'border-green-200 bg-green-50 text-green-600'
              : fila.revisada
                ? 'border-green-200 text-green-600 hover:border-green-300'
                : 'border-gray-200 text-gray-500 hover:border-green-200 hover:text-green-600',
          )}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
        >
          <Pencil className="h-3 w-3" />
          Editar
        </button>
      </div>

      {/* ── Formulario expandido ────────────────────────────── */}
      {expandida && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-4">

          {/* Fila 1: Título */}
          <div className="space-y-1.5">
            <Label className="text-xs">Título <span className="text-red-500">*</span></Label>
            <Input
              value={fila.titulo}
              onChange={(e) => onUpdate('titulo', e.target.value)}
              className={cn(!fila.titulo.trim() && 'border-red-300 bg-red-50')}
            />
          </div>

          {/* Fila 2: Keyword + URL */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Keyword principal</Label>
              <div className="flex gap-2">
                <Input
                  value={fila.keyword}
                  onChange={(e) => onUpdate('keyword', e.target.value)}
                  placeholder={sugerencia}
                  className={cn(
                    'flex-1',
                    !fila.keyword.trim() && 'bg-yellow-50 border-yellow-300',
                  )}
                />
                {!fila.keyword.trim() && sugerencia && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs px-2.5"
                    onClick={() => onUpdate('keyword', sugerencia)}
                    title="Usar sugerencia automática"
                  >
                    Auto
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">URL destino</Label>
              <Input
                value={fila.url}
                onChange={(e) => onUpdate('url', e.target.value)}
                className="font-mono text-xs"
                placeholder="/ruta-del-articulo"
              />
            </div>
          </div>

          {/* Fila 3: Extensión + Fecha */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Extensión mínima</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={fila.tamanyoMin}
                  onChange={(e) => onUpdate('tamanyoMin', parseInt(e.target.value) || 0)}
                  className="w-24 text-sm"
                />
                <span className="text-gray-400 text-sm">—</span>
                <Input
                  type="number"
                  min={0}
                  value={fila.tamanyoMax}
                  onChange={(e) => onUpdate('tamanyoMax', parseInt(e.target.value) || 0)}
                  className="w-24 text-sm"
                />
                <span className="text-xs text-gray-400">palabras</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Fecha de entrega</Label>
              <Input
                type="date"
                value={fila.fechaEntrega}
                onChange={(e) => onUpdate('fechaEntrega', e.target.value)}
                className="w-44 text-sm"
              />
            </div>
          </div>

          {/* Fila 4: Estructura H's (editable) */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Estructura H&apos;s
              <span className="ml-1 font-normal text-gray-400">(editable — ajusta si el archivo no la tenía correcta)</span>
            </Label>
            <Textarea
              value={fila.estructuraH}
              onChange={(e) => onUpdate('estructuraH', e.target.value)}
              rows={Math.min(Math.max(fila.estructuraH.split('\n').length + 1, 3), 10)}
              placeholder="H1: Título principal&#10;  H2: Subtítulo&#10;    H3: Apartado"
              className="font-mono text-xs resize-y"
            />
          </div>

          {/* Botón guardar */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              onClick={onToggle}
            >
              Cancelar
            </button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              onClick={onGuardar}
            >
              <Check className="h-3.5 w-3.5" />
              Guardar cambios
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  clientes: Pick<Cliente, 'id' | 'nombre'>[]
}

export default function NuevoExcelClient({ clientes }: Props) {
  const router = useRouter()

  // ── Paso 1 ────────────────────────────────────────────────────────────────
  const [clienteId, setClienteId] = useState('')
  const [proyectoId, setProyectoId] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [analizando, setAnalizando] = useState(false)
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null)

  // ── Paso 2 ────────────────────────────────────────────────────────────────
  const [paso, setPaso] = useState<Paso>('seleccion')
  const [filas, setFilas] = useState<FilaExcelSeo[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())

  // ── Paso 3 ────────────────────────────────────────────────────────────────
  const [filasRevision, setFilasRevision] = useState<FilaRevision[]>([])
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set())

  // ── Paso 4 ────────────────────────────────────────────────────────────────
  const [creando, setCreando] = useState(false)
  const [resultado, setResultado] = useState<{ pedidoId: string; contenidosCreados: number } | null>(null)
  const [errorCreacion, setErrorCreacion] = useState<string | null>(null)

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleAnalizar() {
    if (!clienteId || !proyectoId || !archivo) {
      setErrorAnalisis('Rellena todos los campos y selecciona un archivo')
      return
    }
    setAnalizando(true)
    setErrorAnalisis(null)
    try {
      const fd = new FormData()
      fd.append('file', archivo)
      fd.append('cliente_id', clienteId)
      fd.append('proyecto_id', proyectoId)
      const res = await fetch('/api/pedidos/procesar-excel', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al procesar el archivo')
      const filasParsed: FilaExcelSeo[] = data.filas ?? []
      setFilas(filasParsed)
      setSeleccionados(
        new Set(filasParsed.reduce<number[]>((acc, f, i) => (!f.yaExiste ? [...acc, i] : acc), []))
      )
      setPaso('previsualizacion')
    } catch (err) {
      setErrorAnalisis(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setAnalizando(false)
    }
  }

  function toggleSeleccion(idx: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) { next.delete(idx) } else { next.add(idx) }
      return next
    })
  }

  function toggleTodos() {
    setSeleccionados(
      seleccionados.size === filas.length
        ? new Set()
        : new Set(filas.map((_, i) => i))
    )
  }

  function pasarARevision() {
    const revision: FilaRevision[] = filas
      .filter((_, i) => seleccionados.has(i))
      .map((fila) => ({
        titulo: fila.titulo,
        keyword: fila.keyword || '',
        url: fila.url || generarSlug(fila.titulo),
        tamanyoMin: 800,
        tamanyoMax: 1200,
        fechaEntrega: '',
        estructuraH: fila.estructuraH,
        yaExiste: fila.yaExiste,
        revisada: false,
      }))
    setFilasRevision(revision)
    setExpandidas(new Set())
    setPaso('revision')
  }

  function updateFila<K extends keyof FilaRevision>(idx: number, campo: K, valor: FilaRevision[K]) {
    setFilasRevision((prev) => prev.map((f, i) => (i === idx ? { ...f, [campo]: valor } : f)))
  }

  function toggleExpandida(idx: number) {
    setExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) { next.delete(idx) } else { next.add(idx) }
      return next
    })
  }

  function guardarCard(idx: number) {
    // Marcar como revisada y colapsar
    setFilasRevision((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, revisada: true } : f))
    )
    setExpandidas((prev) => {
      const next = new Set(prev)
      next.delete(idx)
      return next
    })
  }

  function expandirTodas() {
    setExpandidas(new Set(filasRevision.map((_, i) => i)))
  }

  function colapsarTodas() {
    setExpandidas(new Set())
  }

  function aplicarSugerencias() {
    setFilasRevision((prev) =>
      prev.map((f) => ({
        ...f,
        keyword: f.keyword || sugerirKeyword(f.titulo),
        url: f.url || generarSlug(f.titulo),
      }))
    )
  }

  async function handleCrear() {
    const validas = filasRevision.filter((f) => f.titulo.trim())
    if (validas.length === 0) return
    setCreando(true)
    setErrorCreacion(null)
    try {
      const filasParaCrear: FilaExcelSeo[] = validas.map((f) => ({
        titulo: f.titulo,
        keyword: f.keyword,
        url: f.url,
        estructuraH: f.estructuraH,
        yaExiste: f.yaExiste,
        tamanyoMin: f.tamanyoMin || undefined,
        tamanyoMax: f.tamanyoMax || undefined,
        fechaEntrega: f.fechaEntrega || undefined,
      }))
      const res = await crearPedidoDesdeArticulos({
        clienteId,
        proyectoId,
        nombreArchivo: archivo?.name ?? 'seo.csv',
        tipo: 'excel',
        articulos: filasParaCrear,
      })
      setResultado(res)
      setPaso('resultado')
      router.refresh()
    } catch (err) {
      setErrorCreacion(err instanceof Error ? err.message : 'Error al crear contenidos')
    } finally {
      setCreando(false)
    }
  }

  // ── Métricas ───────────────────────────────────────────────────────────────
  const nuevasFilas  = filas.filter((f) => !f.yaExiste).length
  const existentes   = filas.filter((f) => f.yaExiste).length
  const autoListos   = filasRevision.filter((f) => !f.revisada && f.titulo.trim() && f.keyword.trim()).length
  const revisados    = filasRevision.filter((f) => f.revisada).length
  const pendientes   = filasRevision.filter((f) => !f.revisada && (!f.titulo.trim() || !f.keyword.trim())).length
  const validas      = filasRevision.filter((f) => f.titulo.trim()).length

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">

      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/pedidos"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a pedidos
        </Link>
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
          <Link href="/pedidos" className="hover:text-gray-600">Pedidos</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-gray-900 font-medium">Nuevo pedido Excel SEO</span>
        </div>
      </div>

      {/* Cabecera */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100">
            <Table2 className="h-5 w-5 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Subir Excel SEO</h1>
        </div>
        <IndicadorPasos paso={paso} />
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Paso 1: Selección de archivo                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {paso === 'seleccion' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cliente <span className="text-red-500">*</span></Label>
              <select
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
              >
                <option value="">Selecciona un cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Proyecto <span className="text-red-500">*</span></Label>
              <SelectorProyecto clienteId={clienteId} valor={proyectoId} onChange={setProyectoId} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Archivo CSV o Excel <span className="text-red-500">*</span></Label>
            <label
              htmlFor="excel-file"
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-colors',
                archivo
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-gray-300 text-gray-500 hover:border-green-300 hover:text-green-600',
              )}
            >
              <Upload className="h-8 w-8" />
              <div className="text-center">
                <p className="font-medium text-sm">
                  {archivo ? archivo.name : 'Arrastra o haz clic para seleccionar'}
                </p>
                {!archivo && (
                  <p className="text-xs text-gray-400 mt-1">.csv o .xlsx — máximo 10 MB · columnas: título, keyword, URL</p>
                )}
              </div>
            </label>
            <input
              id="excel-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setArchivo(f) }}
            />
          </div>

          {errorAnalisis && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorAnalisis}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleAnalizar}
              disabled={analizando || !clienteId || !proyectoId || !archivo}
              className="gap-2 bg-green-600 hover:bg-green-700 min-w-[160px]"
            >
              {analizando
                ? <><Loader2 className="h-4 w-4 animate-spin" />Analizando...</>
                : <>Analizar archivo →</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Paso 2: Previsualización                                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {paso === 'previsualizacion' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{seleccionados.size}</span> de{' '}
              {filas.length} filas seleccionadas
              {existentes > 0 && (
                <span className="ml-2 text-orange-600 text-xs">
                  ({existentes} ya existen — no marcadas por defecto)
                </span>
              )}
            </p>
            <Button variant="outline" size="sm" onClick={toggleTodos}>
              {seleccionados.size === filas.length
                ? <><Square className="h-3.5 w-3.5 mr-1.5" />Deseleccionar todos</>
                : <><CheckSquare className="h-3.5 w-3.5 mr-1.5" />Seleccionar todos</>
              }
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-3 py-3">Título</th>
                  <th className="px-3 py-3">Keyword</th>
                  <th className="px-3 py-3">URL</th>
                  <th className="px-3 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.map((fila, i) => (
                  <tr
                    key={i}
                    className={cn(
                      'cursor-pointer hover:bg-gray-50 transition-colors',
                      seleccionados.has(i) && 'bg-green-50',
                      fila.yaExiste && 'opacity-60',
                    )}
                    onClick={() => toggleSeleccion(i)}
                  >
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={seleccionados.has(i)}
                        onChange={() => toggleSeleccion(i)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                    </td>
                    <td className="px-3 py-3 max-w-[240px]">
                      <p className="font-medium text-gray-900 line-clamp-2">{fila.titulo}</p>
                    </td>
                    <td className="px-3 py-3 max-w-[160px]">
                      <span className="text-xs text-gray-500 line-clamp-1">{fila.keyword || '—'}</span>
                    </td>
                    <td className="px-3 py-3 max-w-[160px]">
                      <span className="truncate block text-xs text-gray-500 font-mono">{fila.url || '—'}</span>
                    </td>
                    <td className="px-3 py-3">
                      {fila.yaExiste
                        ? <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">Ya existe</span>
                        : <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Nuevo</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400">
            {nuevasFilas} nuevas · {existentes} ya existen en este proyecto
          </p>

          <div className="flex justify-between gap-3">
            <Button variant="outline" onClick={() => setPaso('seleccion')}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            <Button
              onClick={pasarARevision}
              disabled={seleccionados.size === 0}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              Revisar {seleccionados.size} filas →
            </Button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Paso 3: Revisión de calidad — Cards expandibles                    */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {paso === 'revision' && (
        <div className="space-y-4">

          {/* Barra de control */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3.5">
            {/* Badges de estado */}
            <div className="flex items-center gap-2 flex-wrap">
              {autoListos > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  {autoListos} {autoListos === 1 ? 'listo' : 'listos'}
                </span>
              )}
              {revisados > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                  <Check className="h-3 w-3" />
                  {revisados} revisado{revisados !== 1 ? 's' : ''}
                </span>
              )}
              {pendientes > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                  <div className="h-2 w-2 rounded-full bg-yellow-400" />
                  {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={aplicarSugerencias}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Aplicar sugerencias
              </Button>

              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={expandirTodas}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors border-r border-gray-200"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Expandir
                </button>
                <button
                  type="button"
                  onClick={colapsarTodas}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                  Colapsar
                </button>
              </div>
            </div>
          </div>

          {/* Lista de cards */}
          <div className="space-y-3">
            {filasRevision.map((fila, i) => (
              <CardFila
                key={i}
                fila={fila}
                idx={i}
                total={filasRevision.length}
                expandida={expandidas.has(i)}
                onToggle={() => toggleExpandida(i)}
                onUpdate={(campo, valor) => updateFila(i, campo, valor)}
                onGuardar={() => guardarCard(i)}
              />
            ))}
          </div>

          {errorCreacion && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorCreacion}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-between gap-3 pt-2">
            <Button variant="outline" onClick={() => setPaso('previsualizacion')}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            <Button
              onClick={handleCrear}
              disabled={creando || validas === 0}
              className="gap-2 bg-green-600 hover:bg-green-700 min-w-[200px]"
            >
              {creando
                ? <><Loader2 className="h-4 w-4 animate-spin" />Creando...</>
                : <>Crear {validas} contenido{validas !== 1 ? 's' : ''} →</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Paso 4: Resultado                                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {paso === 'resultado' && resultado && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 flex flex-col items-center gap-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {resultado.contenidosCreados} contenido{resultado.contenidosCreados !== 1 ? 's' : ''} creado{resultado.contenidosCreados !== 1 ? 's' : ''}
            </p>
            <div className="mt-2 flex items-center justify-center gap-1.5 text-sm text-indigo-600">
              <Sparkles className="h-4 w-4" />
              Los briefs SEO se están generando en background
            </div>
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" onClick={() => router.push('/pedidos')}>
              Volver a pedidos
            </Button>
            <Button onClick={() => router.push('/contenidos')}>
              Ver contenidos
            </Button>
          </div>
        </div>
      )}

      {paso === 'resultado' && !resultado && errorCreacion && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <p className="text-red-700 font-medium">{errorCreacion}</p>
          <Button variant="outline" onClick={() => setPaso('revision')}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
        </div>
      )}
    </div>
  )
}
