'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Upload, FileText, CheckSquare, Square,
  Loader2, Check, AlertCircle, Wand2, Sparkles, ChevronDown, ChevronUp,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { SelectorProyecto } from '../selector-proyecto'
import type { ArticuloDetectado, Cliente } from '@/types'
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
  comentarios: string[]
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
              i === actual && 'bg-blue-600 text-white',
              i < actual && 'bg-green-500 text-white',
              i > actual && 'bg-gray-200 text-gray-400',
            )}>
              {i < actual ? '✓' : i + 1}
            </div>
            <span className={cn(
              'hidden sm:block text-xs font-medium',
              i === actual && 'text-blue-600',
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
// Card de artículo
// ─────────────────────────────────────────────────────────────────────────────

function CardArticulo({
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
  // Texto editable de comentarios (join con doble salto)
  const comentariosTexto = fila.comentarios.join('\n\n')

  function handleComentariosChange(texto: string) {
    const arr = texto.split(/\n\n+/).map((s) => s.trim()).filter(Boolean)
    onUpdate('comentarios', arr)
  }

  return (
    <div className={cn(
      'rounded-xl border bg-white transition-shadow',
      expandida
        ? 'border-blue-300 shadow-md'
        : fila.revisada
          ? 'border-green-200 bg-green-50/20'
          : 'border-gray-200',
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
              ? 'border-blue-200 bg-blue-50 text-blue-600'
              : fila.revisada
                ? 'border-green-200 text-green-600 hover:border-green-300'
                : 'border-gray-200 text-gray-500 hover:border-blue-200 hover:text-blue-600',
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
              <span className="ml-1 font-normal text-gray-400">(editable — ajusta si el parser no la captó bien)</span>
            </Label>
            <Textarea
              value={fila.estructuraH}
              onChange={(e) => onUpdate('estructuraH', e.target.value)}
              rows={Math.min(Math.max(fila.estructuraH.split('\n').length + 1, 3), 10)}
              placeholder="H1: Título principal&#10;  H2: Subtítulo&#10;    H3: Apartado"
              className="font-mono text-xs resize-y"
            />
          </div>

          {/* Fila 5: Notas del documento (editable) */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Notas del documento
              <span className="ml-1 font-normal text-gray-400">
                ({fila.comentarios.length} nota{fila.comentarios.length !== 1 ? 's' : ''} — editable)
              </span>
            </Label>
            <Textarea
              value={comentariosTexto}
              onChange={(e) => handleComentariosChange(e.target.value)}
              rows={Math.min(Math.max(fila.comentarios.length * 2 + 1, 3), 12)}
              placeholder="Escribe aquí las notas del redactor…&#10;&#10;Separa cada nota con una línea en blanco."
              className="text-sm bg-amber-50 border-amber-200 placeholder:text-amber-300 focus-visible:ring-amber-400 resize-y"
            />
            <p className="text-xs text-gray-400">
              Separa cada nota con una línea en blanco. Se numerarán automáticamente al guardar.
            </p>
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

export default function NuevoDocxClient({ clientes }: Props) {
  const router = useRouter()

  // ── Paso 1 ────────────────────────────────────────────────────────────────
  const [clienteId, setClienteId] = useState('')
  const [proyectoId, setProyectoId] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [analizando, setAnalizando] = useState(false)
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null)

  // ── Paso 2 ────────────────────────────────────────────────────────────────
  const [paso, setPaso] = useState<Paso>('seleccion')
  const [articulos, setArticulos] = useState<ArticuloDetectado[]>([])
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
      const res = await fetch('/api/pedidos/procesar-docx', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al procesar el documento')
      const arts: ArticuloDetectado[] = data.articulos ?? []
      setArticulos(arts)
      setSeleccionados(new Set(arts.map((_, i) => i)))
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
      seleccionados.size === articulos.length
        ? new Set()
        : new Set(articulos.map((_, i) => i))
    )
  }

  function pasarARevision() {
    const filas: FilaRevision[] = articulos
      .filter((_, i) => seleccionados.has(i))
      .map((art) => ({
        titulo: art.titulo,
        keyword: art.keyword || '',
        url: generarSlug(art.titulo),
        tamanyoMin: 800,
        tamanyoMax: 1200,
        fechaEntrega: '',
        estructuraH: art.estructuraH,
        comentarios: art.comentarios,
        revisada: false,
      }))
    setFilasRevision(filas)
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
      const articulosParaCrear: ArticuloDetectado[] = validas.map((f) => ({
        titulo: f.titulo,
        keyword: f.keyword,
        estructuraH: f.estructuraH,
        comentarios: f.comentarios,
        url: f.url || undefined,
        tamanyoMin: f.tamanyoMin || undefined,
        tamanyoMax: f.tamanyoMax || undefined,
        fechaEntrega: f.fechaEntrega || undefined,
      }))
      const res = await crearPedidoDesdeArticulos({
        clienteId,
        proyectoId,
        nombreArchivo: archivo?.name ?? 'documento.docx',
        tipo: 'docx',
        articulos: articulosParaCrear,
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

  // ── Métricas revisión ──────────────────────────────────────────────────────
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
          <span className="text-gray-900 font-medium">Nuevo pedido DOCX</span>
        </div>
      </div>

      {/* Cabecera con indicador de pasos */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Subir DOCX</h1>
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
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <Label>Archivo DOCX <span className="text-red-500">*</span></Label>
            <label
              htmlFor="docx-file"
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-colors',
                archivo
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-600',
              )}
            >
              <Upload className="h-8 w-8" />
              <div className="text-center">
                <p className="font-medium text-sm">
                  {archivo ? archivo.name : 'Arrastra o haz clic para seleccionar'}
                </p>
                {!archivo && (
                  <p className="text-xs text-gray-400 mt-1">Formato .docx — máximo 20 MB</p>
                )}
              </div>
            </label>
            <input
              id="docx-file"
              type="file"
              accept=".docx"
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
              className="gap-2 bg-blue-600 hover:bg-blue-700 min-w-[160px]"
            >
              {analizando
                ? <><Loader2 className="h-4 w-4 animate-spin" />Analizando...</>
                : <>Analizar documento →</>
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
              {articulos.length} artículos seleccionados
            </p>
            <Button variant="outline" size="sm" onClick={toggleTodos}>
              {seleccionados.size === articulos.length
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
                  <th className="px-3 py-3">Estructura H&apos;s</th>
                  <th className="px-3 py-3">Notas</th>
                  <th className="px-3 py-3">Keyword</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {articulos.map((art, i) => (
                  <tr
                    key={i}
                    className={cn(
                      'cursor-pointer hover:bg-gray-50 transition-colors',
                      seleccionados.has(i) && 'bg-blue-50',
                    )}
                    onClick={() => toggleSeleccion(i)}
                  >
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={seleccionados.has(i)}
                        onChange={() => toggleSeleccion(i)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      <p className="font-medium text-gray-900 line-clamp-2">{art.titulo}</p>
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      {art.estructuraH
                        ? <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-gray-500 font-mono">{art.estructuraH}</pre>
                        : <span className="text-gray-400 text-xs">—</span>
                      }
                    </td>
                    <td className="px-3 py-3">
                      {art.comentarios.length > 0
                        ? <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{art.comentarios.length}</span>
                        : <span className="text-gray-400 text-xs">—</span>
                      }
                    </td>
                    <td className="px-3 py-3 max-w-[150px]">
                      <span className="text-xs text-gray-500 line-clamp-1">{art.keyword || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between gap-3">
            <Button variant="outline" onClick={() => setPaso('seleccion')}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            <Button
              onClick={pasarARevision}
              disabled={seleccionados.size === 0}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              Revisar {seleccionados.size} artículos →
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
              <CardArticulo
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
              className="gap-2 bg-blue-600 hover:bg-blue-700 min-w-[200px]"
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
