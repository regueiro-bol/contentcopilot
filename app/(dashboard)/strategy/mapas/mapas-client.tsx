'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Map,
  Calendar,
  FileText,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface MapaResumen {
  id           : string
  nombre       : string
  status       : string
  created_at   : string
  session_id   : string | null
  sesion_nombre: string | null
  total        : number
  planned      : number
  assigned     : number
  published    : number
}

interface Props {
  mapas        : MapaResumen[]
  clienteNombre: string | null
  clienteId    : string | null
}

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────

export default function MapasClient({ mapas, clienteNombre, clienteId }: Props) {
  const router = useRouter()
  const [eliminando, setEliminando]     = useState<string | null>(null)
  const [confirmId, setConfirmId]       = useState<string | null>(null)
  const [errorElim, setErrorElim]       = useState<string | null>(null)

  async function handleEliminar(mapId: string) {
    setEliminando(mapId)
    setErrorElim(null)
    try {
      const res = await fetch(`/api/strategy/mapas/${mapId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Error eliminando mapa')
      }
      setConfirmId(null)
      router.refresh()
    } catch (e) {
      setErrorElim(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setEliminando(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Mapas de contenido
          </h1>
          {clienteNombre && (
            <p className="text-sm text-gray-500">{clienteNombre}</p>
          )}
        </div>
        <p className="text-sm text-gray-400 tabular-nums">{mapas.length} mapa{mapas.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Empty state */}
      {mapas.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Map className="h-10 w-10 text-gray-300 mx-auto mb-4" />
            <p className="text-sm font-semibold text-gray-500">Sin mapas de contenido</p>
            <p className="text-xs text-gray-400 mt-1">
              Genera un mapa desde una sesión de investigación
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error global */}
      {errorElim && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {errorElim}
        </div>
      )}

      {/* Lista de mapas */}
      <div className="space-y-3">
        {mapas.map((m) => (
          <Card key={m.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                {/* Icono */}
                <div className="rounded-xl p-2.5 bg-violet-100 text-violet-600 shrink-0">
                  <Map className="h-5 w-5" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-snug">
                    {m.nombre || 'Mapa sin nombre'}
                  </p>
                  {m.sesion_nombre && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Sesión: {m.sesion_nombre}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-500">
                    <Calendar className="h-3 w-3" />
                    {new Date(m.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </div>

                  {/* Stats por estado */}
                  <div className="flex items-center gap-3 mt-2.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
                      <FileText className="h-3 w-3" />
                      {m.total} artículos
                    </span>
                    {m.planned > 0 && (
                      <span className="text-[10px] font-semibold text-gray-500 bg-gray-50 rounded px-1.5 py-0.5">
                        {m.planned} planificados
                      </span>
                    )}
                    {m.assigned > 0 && (
                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">
                        {m.assigned} en pedido
                      </span>
                    )}
                    {m.published > 0 && (
                      <span className="text-[10px] font-semibold text-green-600 bg-green-50 rounded px-1.5 py-0.5">
                        {m.published} publicados
                      </span>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Confirmar eliminación */}
                  {confirmId === m.id ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmId(null)}
                        disabled={eliminando === m.id}
                        className="text-xs h-7 px-2"
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleEliminar(m.id)}
                        disabled={eliminando === m.id}
                        className="text-xs h-7 px-2 gap-1"
                      >
                        {eliminando === m.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Trash2 className="h-3 w-3" />
                        }
                        Eliminar
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setConfirmId(m.id); setErrorElim(null) }}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1"
                      title="Eliminar mapa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}

                  {m.session_id && (
                    <Link
                      href={`/strategy/${m.session_id}/mapa`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Ver mapa
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
