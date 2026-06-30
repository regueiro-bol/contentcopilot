'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckSquare,
  Square,
  ChevronLeft,
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PedidoDetectado {
  titulo: string
  url_destino: string | null
  tipo: 'nuevo' | 'actualizacion'
  keyword_principal: string
  volumen_estimado: number | null
  keywords_secundarias: string[]
  title_seo: string | null
  meta_description: string | null
  estructura_hs: string | null
  observaciones_seo: string | null
  enlaces_internos: Array<{ anchor: string; url: string }>
  fuentes_competencia: string[]
  fecha_entrega: string | null
  estado: string
  proyecto_nombre: string | null
}

interface PedidoRow extends PedidoDetectado {
  _selected: boolean
  _expanded: boolean
  _proyecto_id: string
}

interface Proyecto {
  id: string
  nombre: string
}

interface Importacion {
  id: string
  cliente_id: string
  archivo_nombre: string | null
  pedidos_detectados: unknown[]
  estado: string
}

interface Props {
  importacion: Importacion
  cliente: { id: string; nombre: string }
  proyectos: Proyecto[]
  proyectoIdDefault: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function autoMatch(proyectoNombre: string | null, proyectos: Proyecto[]): string {
  if (!proyectoNombre || !proyectos.length) return ''
  const n = proyectoNombre.toLowerCase().trim()
  const match = proyectos.find(
    (p) => p.nombre.toLowerCase().includes(n) || n.includes(p.nombre.toLowerCase()),
  )
  return match?.id ?? ''
}

function ESTADOS_LABEL(e: string) {
  const map: Record<string, string> = {
    pendiente: 'Pendiente',
    revision: 'En revisión',
    aprobado: 'Aprobado',
  }
  return map[e] ?? e
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RevisionClient({ importacion, cliente, proyectos, proyectoIdDefault }: Props) {
  const router = useRouter()

  const [filas, setFilas] = useState<PedidoRow[]>(() =>
    (importacion.pedidos_detectados as PedidoDetectado[]).map((p) => ({
      ...p,
      keywords_secundarias: p.keywords_secundarias ?? [],
      enlaces_internos: p.enlaces_internos ?? [],
      fuentes_competencia: p.fuentes_competencia ?? [],
      _selected: true,
      _expanded: false,
      // Si viene proyecto forzado desde la página de subida, úsalo para todas las filas;
      // de lo contrario, intentar inferir por nombre detectado
      _proyecto_id: proyectoIdDefault ?? autoMatch(p.proyecto_nombre, proyectos),
    })),
  )

  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState<{ creados: number; errores: number } | null>(null)
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null)

  const seleccionadas = filas.filter((f) => f._selected)
  const sinProyecto = seleccionadas.filter((f) => !f._proyecto_id)
  const todoSeleccionado = filas.every((f) => f._selected)

  // ── Mutaciones de estado ──────────────────────────────────────────────────

  function update<K extends keyof PedidoRow>(idx: number, key: K, value: PedidoRow[K]) {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, [key]: value } : f)))
  }

  function toggleExpanded(idx: number) {
    setFilas((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, _expanded: !f._expanded } : f)),
    )
  }

  function toggleTipo(idx: number) {
    setFilas((prev) =>
      prev.map((f, i) =>
        i === idx
          ? { ...f, tipo: f.tipo === 'nuevo' ? 'actualizacion' : 'nuevo' }
          : f,
      ),
    )
  }

  function toggleAll() {
    const newVal = !todoSeleccionado
    setFilas((prev) => prev.map((f) => ({ ...f, _selected: newVal })))
  }

  // ── Confirmar ─────────────────────────────────────────────────────────────

  async function handleConfirmar() {
    setErrorGlobal(null)
    if (seleccionadas.length === 0) {
      setErrorGlobal('Selecciona al menos un pedido')
      return
    }
    if (sinProyecto.length > 0) {
      setErrorGlobal(
        `${sinProyecto.length} pedido${sinProyecto.length > 1 ? 's' : ''} sin proyecto asignado`,
      )
      return
    }

    setConfirmando(true)
    try {
      const pedidos = seleccionadas.map((f) => ({
        titulo: f.titulo,
        url_destino: f.url_destino,
        tipo: f.tipo,
        keyword_principal: f.keyword_principal,
        volumen_estimado: f.volumen_estimado,
        keywords_secundarias: f.keywords_secundarias,
        title_seo: f.title_seo,
        meta_description: f.meta_description,
        estructura_hs: f.estructura_hs,
        observaciones_seo: f.observaciones_seo,
        enlaces_internos: f.enlaces_internos,
        fuentes_competencia: f.fuentes_competencia,
        fecha_entrega: f.fecha_entrega,
        estado: f.estado || 'pendiente',
        proyecto_id: f._proyecto_id,
      }))

      const res = await fetch('/api/pedidos/importar/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importacion_id: importacion.id,
          cliente_id: cliente.id,
          pedidos,
        }),
      })

      const data = await res.json() as { creados?: number; errores?: number; error?: string }

      if (!res.ok) {
        setErrorGlobal(data.error ?? 'Error al confirmar la importación')
        return
      }

      setResultado({ creados: data.creados ?? 0, errores: data.errores ?? 0 })
    } catch {
      setErrorGlobal('Error de red. Inténtalo de nuevo.')
    } finally {
      setConfirmando(false)
    }
  }

  // ── Éxito ─────────────────────────────────────────────────────────────────

  if (resultado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center max-w-md">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Importación completada
          </h2>
          <p className="text-gray-500 text-sm mb-1">
            <span className="font-medium text-gray-800">{resultado.creados}</span> contenidos creados
          </p>
          {resultado.errores > 0 && (
            <p className="text-red-600 text-sm mb-1">{resultado.errores} con errores</p>
          )}
          <div className="mt-6 flex gap-3 justify-center">
            <button
              onClick={() => router.push('/pedidos')}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Ver pedidos
            </button>
            <button
              onClick={() => router.push('/pedidos/importar')}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Nueva importación
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Vista principal ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/pedidos/importar"
              className="text-gray-400 hover:text-gray-600"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-base font-semibold text-gray-900">
                Revisión de pedidos detectados
              </h1>
              <p className="text-xs text-gray-500">
                {cliente.nombre}
                {importacion.archivo_nombre ? ` · ${importacion.archivo_nombre}` : ''}
                {' · '}
                {filas.length} pedidos detectados
              </p>
            </div>
          </div>

          {/* Acciones header */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              {todoSeleccionado ? (
                <><CheckSquare className="w-3.5 h-3.5" /> Deseleccionar todos</>
              ) : (
                <><Square className="w-3.5 h-3.5" /> Seleccionar todos</>
              )}
            </button>
            <Link
              href="/pedidos/importar"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <button
              onClick={handleConfirmar}
              disabled={confirmando || seleccionadas.length === 0}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {confirmando ? 'Confirmando…' : `Confirmar importación (${seleccionadas.length})`}
            </button>
          </div>
        </div>
      </div>

      {/* Error global */}
      {errorGlobal && (
        <div className="max-w-screen-2xl mx-auto px-6 mt-4">
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {errorGlobal}
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="max-w-screen-2xl mx-auto px-6 py-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 min-w-[220px]">
                    Título
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 min-w-[140px]">
                    Keyword
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-28">
                    Tipo
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 min-w-[160px]">
                    Proyecto
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-32">
                    Fecha
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-28">
                    Estado
                  </th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filas.map((fila, idx) => (
                  <>
                    <tr
                      key={idx}
                      className={[
                        'border-b border-gray-100 transition-colors',
                        fila._selected ? '' : 'opacity-40',
                        fila._expanded ? 'bg-indigo-50/30' : 'hover:bg-gray-50',
                      ].join(' ')}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={fila._selected}
                          onChange={() => update(idx, '_selected', !fila._selected)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>

                      {/* Título */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={fila.titulo}
                          onChange={(e) => update(idx, 'titulo', e.target.value)}
                          className="w-full rounded border border-transparent px-1 py-0.5 text-sm text-gray-800 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-0 bg-transparent"
                          placeholder="Título del artículo"
                        />
                      </td>

                      {/* Keyword */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={fila.keyword_principal}
                          onChange={(e) => update(idx, 'keyword_principal', e.target.value)}
                          className="w-full rounded border border-transparent px-1 py-0.5 text-sm text-gray-600 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-0 bg-transparent"
                          placeholder="keyword"
                        />
                      </td>

                      {/* Tipo toggle */}
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggleTipo(idx)}
                          className={[
                            'rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-colors',
                            fila.tipo === 'nuevo'
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                          ].join(' ')}
                        >
                          {fila.tipo === 'nuevo' ? 'Nuevo' : 'Actualización'}
                        </button>
                      </td>

                      {/* Proyecto */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {!fila._proyecto_id && fila._selected && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                          <select
                            value={fila._proyecto_id}
                            onChange={(e) => update(idx, '_proyecto_id', e.target.value)}
                            className={[
                              'w-full rounded border px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400',
                              !fila._proyecto_id && fila._selected
                                ? 'border-amber-300 bg-amber-50'
                                : 'border-gray-200 bg-transparent',
                            ].join(' ')}
                          >
                            <option value="">Sin proyecto</option>
                            {proyectos.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Fecha */}
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={fila.fecha_entrega ?? ''}
                          onChange={(e) =>
                            update(idx, 'fecha_entrega', e.target.value || null)
                          }
                          className="w-full rounded border border-transparent px-1 py-0.5 text-xs text-gray-600 focus:border-indigo-300 focus:bg-white focus:outline-none bg-transparent"
                        />
                      </td>

                      {/* Estado */}
                      <td className="px-3 py-2">
                        <select
                          value={fila.estado || 'pendiente'}
                          onChange={(e) => update(idx, 'estado', e.target.value)}
                          className="w-full rounded border border-gray-200 bg-transparent px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="revision">En revisión</option>
                          <option value="aprobado">Aprobado</option>
                        </select>
                      </td>

                      {/* Expandir */}
                      <td className="px-2 py-2">
                        <button
                          onClick={() => toggleExpanded(idx)}
                          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Ver completo"
                        >
                          {fila._expanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Fila expandida */}
                    {fila._expanded && (
                      <tr key={`${idx}-exp`} className="bg-indigo-50/20 border-b border-indigo-100">
                        <td colSpan={8} className="px-6 pb-5 pt-3">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {/* URL destino */}
                            <FieldEdit
                              label="URL destino"
                              value={fila.url_destino ?? ''}
                              onChange={(v) => update(idx, 'url_destino', v || null)}
                              placeholder="https://…"
                            />

                            {/* Meta title */}
                            <FieldEdit
                              label="Meta title"
                              value={fila.title_seo ?? ''}
                              onChange={(v) => update(idx, 'title_seo', v || null)}
                              placeholder="Título SEO"
                            />

                            {/* Meta description */}
                            <FieldEdit
                              label="Meta description"
                              value={fila.meta_description ?? ''}
                              onChange={(v) => update(idx, 'meta_description', v || null)}
                              placeholder="Descripción SEO…"
                            />

                            {/* Keywords secundarias */}
                            <FieldTextarea
                              label="Keywords secundarias"
                              value={fila.keywords_secundarias.join('\n')}
                              onChange={(v) =>
                                update(
                                  idx,
                                  'keywords_secundarias',
                                  v
                                    .split('\n')
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                )
                              }
                              placeholder="Una por línea"
                              rows={3}
                            />

                            {/* Estructura Hs */}
                            <FieldTextarea
                              label="Estructura Hs"
                              value={fila.estructura_hs ?? ''}
                              onChange={(v) => update(idx, 'estructura_hs', v || null)}
                              placeholder="H1: ...\nH2: ...\nH3: ..."
                              rows={4}
                            />

                            {/* Observaciones / enfoque */}
                            <FieldTextarea
                              label="Brief / Enfoque"
                              value={fila.observaciones_seo ?? ''}
                              onChange={(v) => update(idx, 'observaciones_seo', v || null)}
                              placeholder="Orientaciones editoriales…"
                              rows={4}
                            />

                            {/* Enlaces internos */}
                            <FieldTextarea
                              label='Enlaces internos (formato: "anchor → url", uno por línea)'
                              value={fila.enlaces_internos.map((e) => `${e.anchor} → ${e.url}`).join('\n')}
                              onChange={(v) =>
                                update(
                                  idx,
                                  'enlaces_internos',
                                  v
                                    .split('\n')
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                                    .map((s) => {
                                      const sep = s.indexOf('→')
                                      return sep > -1
                                        ? { anchor: s.slice(0, sep).trim(), url: s.slice(sep + 1).trim() }
                                        : { anchor: s, url: '' }
                                    }),
                                )
                              }
                              placeholder={'liquidez → https://banco.com/liquidez\nriesgo de mercado → https://banco.com/riesgo'}
                              rows={3}
                            />

                            {/* Fuentes competencia */}
                            <FieldTextarea
                              label="Contenido competencia (solo referencia, no citar ni enlazar)"
                              value={fila.fuentes_competencia.join('\n')}
                              onChange={(v) =>
                                update(
                                  idx,
                                  'fuentes_competencia',
                                  v
                                    .split('\n')
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                )
                              }
                              placeholder="Una URL por línea"
                              rows={3}
                            />

                            {/* Volumen */}
                            <div>
                              <p className="mb-1 text-xs font-medium text-gray-500">
                                Volumen estimado
                              </p>
                              <input
                                type="number"
                                value={fila.volumen_estimado ?? ''}
                                onChange={(e) =>
                                  update(
                                    idx,
                                    'volumen_estimado',
                                    e.target.value ? Number(e.target.value) : null,
                                  )
                                }
                                className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {seleccionadas.length} de {filas.length} pedidos seleccionados
            {sinProyecto.length > 0 && (
              <span className="ml-2 text-amber-600">
                · {sinProyecto.length} sin proyecto
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href="/pedidos/importar"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <button
              onClick={handleConfirmar}
              disabled={confirmando || seleccionadas.length === 0}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {confirmando
                ? 'Confirmando…'
                : `Confirmar importación (${seleccionadas.length} pedidos)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldEdit({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
    </div>
  )
}

function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y rounded border border-gray-200 px-2 py-1 text-sm focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
    </div>
  )
}
