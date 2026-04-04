'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Table2, Upload, CheckSquare, Square, Loader2, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { FilaExcelSeo, Cliente } from '@/types'
import { crearPedidoDesdeArticulos } from './actions'

interface Props {
  open: boolean
  onClose: () => void
  clientes: Pick<Cliente, 'id' | 'nombre'>[]
}

interface Proyecto {
  id: string
  nombre: string
}

type Paso = 'seleccion' | 'previsualizacion' | 'resultado'

// ─────────────────────────────────────────────────────────────────────────────
// Selector de proyecto con carga dinámica
// ─────────────────────────────────────────────────────────────────────────────

function SelectorProyecto({
  clienteId,
  valor,
  onChange,
  disabled,
}: {
  clienteId: string
  valor: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [cargando, setCargando] = useState(false)
  const clienteAnterior = useRef('')

  if (clienteId && clienteId !== clienteAnterior.current) {
    clienteAnterior.current = clienteId
    setCargando(true)
    onChange('')
    fetch(`/api/pedidos/proyectos?cliente_id=${clienteId}`)
      .then((r) => r.json())
      .then((d) => setProyectos(d.proyectos ?? []))
      .catch(() => setProyectos([]))
      .finally(() => setCargando(false))
  }

  return (
    <select
      className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || cargando || !clienteId}
    >
      <option value="">
        {cargando ? 'Cargando proyectos...' : !clienteId ? 'Primero selecciona un cliente' : 'Selecciona un proyecto'}
      </option>
      {proyectos.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </select>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal principal
// ─────────────────────────────────────────────────────────────────────────────

export function ModalExcel({ open, onClose, clientes }: Props) {
  const router = useRouter()

  const [clienteId, setClienteId] = useState('')
  const [proyectoId, setProyectoId] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [analizando, setAnalizando] = useState(false)
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null)

  const [paso, setPaso] = useState<Paso>('seleccion')
  const [filas, setFilas] = useState<FilaExcelSeo[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())

  const [creando, setCreando] = useState(false)
  const [resultado, setResultado] = useState<{ pedidoId: string; contenidosCreados: number } | null>(null)
  const [errorCreacion, setErrorCreacion] = useState<string | null>(null)

  function handleClose() {
    if (creando || analizando) return
    setClienteId('')
    setProyectoId('')
    setArchivo(null)
    setAnalizando(false)
    setErrorAnalisis(null)
    setPaso('seleccion')
    setFilas([])
    setSeleccionados(new Set())
    setCreando(false)
    setResultado(null)
    setErrorCreacion(null)
    onClose()
  }

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
      // Por defecto, seleccionar solo las que NO existen ya
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
    const elegibles = filas.reduce<number[]>((acc, _, i) => [...acc, i], [])
    if (seleccionados.size === elegibles.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(elegibles))
    }
  }

  async function handleCrear() {
    const filasSeleccionadas = filas.filter((_, i) => seleccionados.has(i))
    if (filasSeleccionadas.length === 0) return
    setCreando(true)
    setErrorCreacion(null)
    try {
      const res = await crearPedidoDesdeArticulos({
        clienteId,
        proyectoId,
        nombreArchivo: archivo?.name ?? 'seo.csv',
        tipo: 'excel',
        articulos: filasSeleccionadas,
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

  const nombreCliente = clientes.find((c) => c.id === clienteId)?.nombre ?? ''
  const nuevasFilas = filas.filter((f) => !f.yaExiste).length
  const existentes = filas.filter((f) => f.yaExiste).length

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-green-600" />
            Subir Excel SEO
          </DialogTitle>
          <DialogDescription>
            {paso === 'seleccion' && 'Selecciona el cliente, proyecto y sube el archivo CSV o Excel.'}
            {paso === 'previsualizacion' &&
              `${filas.length} filas detectadas — ${nuevasFilas} nuevas, ${existentes} ya existen.`}
            {paso === 'resultado' && 'El pedido ha sido procesado correctamente.'}
          </DialogDescription>
        </DialogHeader>

        {/* ── Paso 1: Selección ─────────────────────────────── */}
        {paso === 'seleccion' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Cliente <span className="text-red-500">*</span></Label>
              <select
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              <SelectorProyecto
                clienteId={clienteId}
                valor={proyectoId}
                onChange={setProyectoId}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Archivo CSV o Excel <span className="text-red-500">*</span></Label>
              <label
                htmlFor="excel-file"
                className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 hover:border-green-400 hover:text-green-600 transition-colors"
              >
                <Upload className="h-4 w-4" />
                {archivo ? archivo.name : 'Seleccionar archivo (.csv o .xlsx, máx. 10 MB)'}
              </label>
              <input
                id="excel-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setArchivo(f)
                }}
              />
              <p className="text-xs text-gray-400">
                El archivo debe tener columnas de título, keyword y URL. Se detectan automáticamente.
              </p>
            </div>

            {errorAnalisis && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {errorAnalisis}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={handleAnalizar}
                disabled={analizando || !clienteId || !proyectoId || !archivo}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                {analizando ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Analizando...</>
                ) : (
                  <>Analizar</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Paso 2: Previsualización ──────────────────────── */}
        {paso === 'previsualizacion' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{seleccionados.size}</span> de{' '}
                {filas.length} filas seleccionadas
                {existentes > 0 && (
                  <span className="ml-2 text-orange-600">
                    ({existentes} ya existen — no marcadas por defecto)
                  </span>
                )}
              </p>
              <Button variant="outline" size="sm" onClick={toggleTodos}>
                {seleccionados.size === filas.length ? (
                  <><Square className="h-3.5 w-3.5 mr-1.5" />Deseleccionar todos</>
                ) : (
                  <><CheckSquare className="h-3.5 w-3.5 mr-1.5" />Seleccionar todos</>
                )}
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2">Keyword</th>
                    <th className="px-3 py-2">URL</th>
                    <th className="px-3 py-2">Estructura H&apos;s</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filas.map((fila, i) => (
                    <tr
                      key={i}
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                        seleccionados.has(i) ? 'bg-green-50' : ''
                      } ${fila.yaExiste ? 'opacity-60' : ''}`}
                      onClick={() => toggleSeleccion(i)}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={seleccionados.has(i)}
                          onChange={() => toggleSeleccion(i)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900 line-clamp-2">{fila.titulo}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{fila.keyword || '—'}</td>
                      <td className="px-3 py-2 max-w-[140px]">
                        <span className="truncate block text-xs text-gray-500">{fila.url || '—'}</span>
                      </td>
                      <td className="px-3 py-2">
                        {fila.estructuraH ? (
                          <pre className="max-h-16 overflow-y-auto whitespace-pre-wrap text-xs text-gray-400 font-mono">
                            {fila.estructuraH}
                          </pre>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {fila.yaExiste ? (
                          <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                            Ya existe
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Nuevo
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {errorCreacion && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {errorCreacion}
              </p>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setPaso('seleccion')}>
                Volver
              </Button>
              <Button
                onClick={handleCrear}
                disabled={creando || seleccionados.size === 0}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                {creando ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Creando...</>
                ) : (
                  <>Crear {seleccionados.size} contenido{seleccionados.size !== 1 ? 's' : ''}</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Paso 3: Resultado ─────────────────────────────── */}
        {paso === 'resultado' && resultado && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">
                {resultado.contenidosCreados} contenido{resultado.contenidosCreados !== 1 ? 's' : ''} creado{resultado.contenidosCreados !== 1 ? 's' : ''}
              </p>
              {nombreCliente && (
                <p className="mt-1 text-gray-500">
                  Los briefs SEO se generan en background con el Agente Brief SEO.
                </p>
              )}
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={handleClose}>Cerrar</Button>
              <Button
                className="gap-2"
                onClick={() => {
                  handleClose()
                  router.push('/contenidos')
                }}
              >
                Ver contenidos
              </Button>
            </div>
          </div>
        )}

        {paso === 'resultado' && !resultado && errorCreacion && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <p className="text-red-600">{errorCreacion}</p>
            <Button variant="outline" onClick={() => setPaso('previsualizacion')}>Volver</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
