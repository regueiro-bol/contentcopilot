'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ClipboardList,
  Upload,
  Table2,
  PlusCircle,
  Eye,
  FileText,
  Sheet,
  ClipboardEdit,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Pedido } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de presentación
// ─────────────────────────────────────────────────────────────────────────────

function BadgeTipo({ tipo }: { tipo: Pedido['tipo'] }) {
  if (tipo === 'docx')
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
        <FileText className="h-3 w-3" />
        DOCX
      </span>
    )
  if (tipo === 'excel')
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
        <Sheet className="h-3 w-3" />
        Excel
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-purple-200">
      <ClipboardEdit className="h-3 w-3" />
      Manual
    </span>
  )
}

function BadgeEstado({ estado }: { estado: Pedido['estado'] }) {
  if (estado === 'completado')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" />
        Completado
      </span>
    )
  if (estado === 'error')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
        <AlertCircle className="h-3 w-3" />
        Error
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
      <Loader2 className="h-3 w-3 animate-spin" />
      Procesando
    </span>
  )
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  pedidos: Pedido[]
  clientes?: { id: string; nombre: string }[]
}

export default function PedidosPageClient({ pedidos }: Props) {
  const router = useRouter()
  const pendientes = pedidos.filter((p) => p.estado === 'procesando').length

  return (
    <div className="space-y-6">
      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <ClipboardList className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Pedidos de contenido</h2>
            <p className="text-sm text-gray-500">
              Gestiona las órdenes de trabajo entrantes
              {pendientes > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                  {pendientes} procesando
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => router.push('/pedidos/nuevo-docx')}
          >
            <Upload className="h-4 w-4" />
            Subir DOCX
          </Button>
          <Button
            className="gap-2 bg-green-600 hover:bg-green-700"
            onClick={() => router.push('/pedidos/nuevo-excel')}
          >
            <Table2 className="h-4 w-4" />
            Subir Excel SEO
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => router.push('/pedidos/nuevo-manual')}
          >
            <PlusCircle className="h-4 w-4" />
            Pedido manual
          </Button>
        </div>
      </div>

      {/* ── Tabla de pedidos ─────────────────────────────────── */}
      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-20 text-center">
          <ClipboardList className="mb-4 h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">No hay pedidos todavía</p>
          <p className="mt-1 text-sm text-gray-400">
            Sube un DOCX, un Excel SEO o crea un pedido manual para empezar.
          </p>
          <div className="mt-6 flex gap-3">
            <Button
              size="sm"
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={() => router.push('/pedidos/nuevo-docx')}
            >
              <Upload className="h-4 w-4" />
              Subir DOCX
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => router.push('/pedidos/nuevo-manual')}
            >
              <PlusCircle className="h-4 w-4" />
              Pedido manual
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Archivo</th>
                <th className="px-4 py-3">Cliente › Proyecto</th>
                <th className="px-4 py-3 text-right">Contenidos</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pedidos.map((pedido) => (
                <tr key={pedido.id} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {formatearFecha(pedido.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <BadgeTipo tipo={pedido.tipo} />
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-gray-500">
                    {pedido.nombre_archivo ?? (pedido.tipo === 'manual' ? 'Pedido manual' : '—')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">
                        {pedido.cliente?.nombre ?? '—'}
                      </span>
                      {pedido.proyecto && (
                        <span className="text-xs text-gray-400">{pedido.proyecto.nombre}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {pedido.contenidos_generados > 0 ? (
                      <Badge variant="secondary">{pedido.contenidos_generados}</Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <BadgeEstado estado={pedido.estado} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {pedido.proyecto_id && (
                      <Link
                        href={`/contenidos?proyecto=${pedido.proyecto_id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver contenidos
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
