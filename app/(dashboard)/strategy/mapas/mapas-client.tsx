'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Map,
  Calendar,
  FileText,
  Loader2,
  AlertCircle,
  ChevronRight,
  Archive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArchiveMenu } from '@/components/ui/ArchiveMenu'

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
  archived     : boolean
  total        : number
  planned      : number
  assigned     : number
  published    : number
}

interface Props {
  mapas           : MapaResumen[]
  mapasArchivados : MapaResumen[]
  clienteNombre   : string | null
  clienteId       : string | null
}

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────

export default function MapasClient({ mapas, mapasArchivados, clienteNombre, clienteId }: Props) {
  const [verArchivados,  setVerArchivados]  = useState(false)
  const [accionId,       setAccionId]       = useState<string | null>(null)
  const [error,          setError]          = useState<string | null>(null)

  // Local state para movimientos optimistas
  const [localActivos,    setLocalActivos]    = useState<MapaResumen[]>(mapas)
  const [localArchivados, setLocalArchivados] = useState<MapaResumen[]>(mapasArchivados)

  const lista = verArchivados ? localArchivados : localActivos

  async function handleArchive(m: MapaResumen, toArchive: boolean) {
    setAccionId(m.id)
    setError(null)
    try {
      const res = await fetch(`/api/strategy/mapas/${m.id}`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ archived: toArchive }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Error')
      }
      if (toArchive) {
        setLocalActivos((prev) => prev.filter((x) => x.id !== m.id))
        setLocalArchivados((prev) => [{ ...m, archived: true }, ...prev])
      } else {
        setLocalArchivados((prev) => prev.filter((x) => x.id !== m.id))
        setLocalActivos((prev) => [{ ...m, archived: false }, ...prev])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setAccionId(null)
    }
  }

  async function handleDelete(mapId: string) {
    setAccionId(mapId)
    setError(null)
    try {
      const res = await fetch(`/api/strategy/mapas/${mapId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Error eliminando mapa')
      }
      setLocalActivos((prev) => prev.filter((x) => x.id !== mapId))
      setLocalArchivados((prev) => prev.filter((x) => x.id !== mapId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setAccionId(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Mapas de contenido
          </h1>
          {clienteNombre && (
            <p className="text-sm text-gray-500">{clienteNombre}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-400 tabular-nums">{lista.length} mapa{lista.length !== 1 ? 's' : ''}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setVerArchivados((v) => !v); setError(null) }}
            className={`gap-1.5 text-xs ${verArchivados ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : ''}`}
          >
            <Archive className="h-3.5 w-3.5" />
            {verArchivados ? 'Ver activos' : 'Ver archivados'}
            {!verArchivados && localArchivados.length > 0 && (
              <span className="ml-0.5 text-[10px] font-bold bg-gray-200 text-gray-600 rounded-full px-1.5">
                {localArchivados.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Aviso archivados */}
      {verArchivados && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Archive className="h-3.5 w-3.5 shrink-0" />
          Mapas archivados — solo visibles aquí. Restaura uno para volver a usarlo.
        </div>
      )}

      {/* Empty state */}
      {lista.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Map className="h-10 w-10 text-gray-300 mx-auto mb-4" />
            <p className="text-sm font-semibold text-gray-500">
              {verArchivados ? 'Sin mapas archivados' : 'Sin mapas de contenido'}
            </p>
            {!verArchivados && (
              <p className="text-xs text-gray-400 mt-1">
                Genera un mapa desde una sesión de investigación
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error global */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Lista de mapas */}
      <div className="space-y-3">
        {lista.map((m) => (
          <Card key={m.id} className={`hover:shadow-sm transition-shadow ${m.archived ? 'opacity-75' : ''}`}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                {/* Icono */}
                <div className={`rounded-xl p-2.5 shrink-0 ${m.archived ? 'bg-gray-100 text-gray-400' : 'bg-violet-100 text-violet-600'}`}>
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
                  <div className="flex items-center gap-3 mt-2.5 flex-wrap">
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
                  {!m.archived && m.session_id && (
                    <Link
                      href={`/strategy/${m.session_id}/mapa`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Ver mapa
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  )}
                  <ArchiveMenu
                    archived={m.archived}
                    loading={accionId === m.id}
                    onArchive={() => handleArchive(m, !m.archived)}
                    onDelete={() => handleDelete(m.id)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
