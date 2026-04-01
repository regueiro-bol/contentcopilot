'use client'

import { useState } from 'react'
import { Search, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { colorEstadoContenido, etiquetaEstadoContenido } from '@/lib/utils'
import type { EstadoContenido } from '@/types'
import type { FilaContenido } from './page'

const ESTADOS: EstadoContenido[] = [
  'pendiente', 'borrador', 'revision_seo', 'revision_cliente',
  'devuelto', 'aprobado', 'publicado',
]

export default function ContenidosPageClient({ contenidos }: { contenidos: FilaContenido[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroProyecto, setFiltroProyecto] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroRedactor, setFiltroRedactor] = useState('')

  const clientes = Array.from(new Set(contenidos.map((c) => c.cliente_nombre))).sort()
  const proyectos = Array.from(new Set(contenidos.map((c) => c.proyecto_nombre))).sort()
  const redactores = Array.from(
    new Set(contenidos.map((c) => c.redactor).filter(Boolean) as string[])
  ).sort()

  const contenidosFiltrados = contenidos.filter((c) => {
    const coincideBusqueda =
      c.titulo.toLowerCase().includes(busqueda.toLowerCase()) ||
      (c.keyword_principal?.toLowerCase() ?? '').includes(busqueda.toLowerCase())
    const coincideCliente   = !filtroCliente   || c.cliente_nombre === filtroCliente
    const coincideProyecto  = !filtroProyecto  || c.proyecto_nombre === filtroProyecto
    const coincideEstado    = !filtroEstado    || c.estado === filtroEstado
    const coincideRedactor  = !filtroRedactor  || c.redactor === filtroRedactor
    return coincideBusqueda && coincideCliente && coincideProyecto && coincideEstado && coincideRedactor
  })

  const hayFiltros = filtroCliente || filtroProyecto || filtroEstado || filtroRedactor

  function limpiarFiltros() {
    setFiltroCliente('')
    setFiltroProyecto('')
    setFiltroEstado('')
    setFiltroRedactor('')
    setBusqueda('')
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Contenidos</h2>
          <p className="text-gray-500 text-sm mt-1">
            {contenidosFiltrados.length} contenido{contenidosFiltrados.length !== 1 ? 's' : ''}{' '}
            {hayFiltros ? 'filtrados' : 'en total'}
          </p>
        </div>
        {hayFiltros && (
          <Button variant="outline" size="sm" onClick={limpiarFiltros}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar título o keyword..."
            className="pl-8"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <select
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filtroCliente}
          onChange={(e) => { setFiltroCliente(e.target.value); setFiltroProyecto('') }}
        >
          <option value="">Todos los clientes</option>
          {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filtroProyecto}
          onChange={(e) => setFiltroProyecto(e.target.value)}
        >
          <option value="">Todos los proyectos</option>
          {proyectos
            .filter((p) => !filtroCliente || contenidos.some(
              (c) => c.proyecto_nombre === p && c.cliente_nombre === filtroCliente
            ))
            .map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <select
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>{etiquetaEstadoContenido(e)}</option>
          ))}
        </select>

        {redactores.length > 0 && (
          <select
            className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={filtroRedactor}
            onChange={(e) => setFiltroRedactor(e.target.value)}
          >
            <option value="">Todos los redactores</option>
            {redactores.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      {/* Tabla */}
      {contenidosFiltrados.length === 0 ? (
        <div className="text-center py-16">
          {contenidos.length === 0 ? (
            <>
              <p className="text-gray-500">No hay contenidos todavía.</p>
              <p className="text-gray-400 text-sm mt-1">
                Crea un contenido desde la página de un proyecto.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-500">No hay contenidos que coincidan con los filtros aplicados.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-x-4 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Título / Proyecto</span>
            <span className="hidden md:block">Keyword</span>
            <span className="hidden md:block">Redactor</span>
            <span className="hidden md:block">Entrega</span>
            <span>Estado</span>
          </div>

          <div className="divide-y divide-gray-100">
            {contenidosFiltrados.map((c) => (
              <Link
                key={c.id}
                href={`/contenidos/${c.id}`}
                className="grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-x-4 items-center px-4 py-3 hover:bg-indigo-50/40 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-700 transition-colors">
                    {c.titulo}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/clientes/${c.cliente_id}/proyectos/${c.proyecto_id}`}
                      className="text-xs text-gray-400 truncate hover:text-indigo-500 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.cliente_nombre}
                    </Link>
                    <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                    <Link
                      href={`/clientes/${c.cliente_id}/proyectos/${c.proyecto_id}`}
                      className="text-xs text-gray-400 truncate hover:text-indigo-500 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.proyecto_nombre}
                    </Link>
                  </div>
                </div>

                <div className="hidden md:block min-w-0">
                  {c.keyword_principal ? (
                    <span className="text-xs text-gray-600 bg-gray-100 rounded-full px-2 py-0.5 truncate block max-w-[160px]">
                      {c.keyword_principal}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>

                <div className="hidden md:block">
                  <span className="text-xs text-gray-600">
                    {c.redactor ?? <span className="text-gray-300">Sin asignar</span>}
                  </span>
                </div>

                <div className="hidden md:block">
                  {c.fecha_entrega ? (
                    <span className="text-xs text-gray-600">
                      {new Date(c.fecha_entrega).toLocaleDateString('es-ES', {
                        day: 'numeric', month: 'short',
                      })}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>

                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${colorEstadoContenido(c.estado)}`}>
                  {etiquetaEstadoContenido(c.estado)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
