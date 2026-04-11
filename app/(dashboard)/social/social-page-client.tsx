'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Share2, ChevronDown, AlertTriangle, Calendar, FileText,
  Send, Loader2, ExternalLink, ShieldCheck, BarChart2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import SocialCalendar      from '@/components/social/SocialCalendar'
import SocialPosts         from '@/components/social/SocialPosts'
import SocialPublication   from '@/components/social/SocialPublication'
import SocialKPIsDashboard from '@/components/social/SocialKPIsDashboard'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cliente {
  id    : string
  nombre: string
  sector: string | null
}

interface StrategyStatus {
  completedCount   : number
  overallStatus    : 'not_started' | 'in_progress' | 'completed'
  phase6           : { completed: boolean }
  clientValidated  : boolean
  clientValidatedAt: string | null
}

interface Props {
  clientes: Cliente[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SocialPageClient({ clientes }: Props) {
  const searchParams = useSearchParams()

  const [clienteId,      setClienteId]      = useState<string>('')
  const [status,         setStatus]         = useState<StrategyStatus | null>(null)
  const [loadingStatus,  setLoadingStatus]  = useState(false)
  const [activeTab,      setActiveTab]      = useState('calendario')
  const [autoOpenPlan,   setAutoOpenPlan]   = useState(false)

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId)

  // ── Read URL params on mount ──
  useEffect(() => {
    const paramClientId = searchParams.get('clientId')
    const paramAction   = searchParams.get('action')
    if (paramClientId && clientes.some((c) => c.id === paramClientId)) {
      setClienteId(paramClientId)
      if (paramAction === 'generate-calendar') {
        setActiveTab('calendario')
        setAutoOpenPlan(true)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!clienteId) { setStatus(null); return }
    setLoadingStatus(true)
    fetch(`/api/social/strategy-status/${clienteId}`)
      .then((r) => r.json())
      .then((data: StrategyStatus) => setStatus(data))
      .catch(console.error)
      .finally(() => setLoadingStatus(false))
  }, [clienteId])

  const estrategiaCompleta = status?.phase6?.completed === true

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-pink-100 flex items-center justify-center">
          <Share2 className="h-5 w-5 text-pink-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Social Media</h1>
          <p className="text-sm text-gray-500">Calendario, producción y publicación de contenido social</p>
        </div>
      </div>

      {/* Selector de cliente */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Cliente
        </label>
        <div className="relative max-w-sm">
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-8 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500"
          >
            <option value="">Selecciona un cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* Estado vacío */}
      {!clienteId && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-pink-50 flex items-center justify-center mb-4">
            <Share2 className="h-8 w-8 text-pink-300" />
          </div>
          <p className="text-gray-500 text-sm">Selecciona un cliente para ver su módulo de Social Media</p>
        </div>
      )}

      {/* Loading */}
      {clienteId && loadingStatus && (
        <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando estado…</span>
        </div>
      )}

      {/* Contenido cuando hay cliente y estado cargado */}
      {clienteId && !loadingStatus && status && (
        <div className="space-y-4">
          {/* Badge de estado */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">
                {clienteSeleccionado?.nombre}
              </h2>
              {status.overallStatus === 'not_started' && (
                <Badge variant="secondary">Sin estrategia</Badge>
              )}
              {status.overallStatus === 'in_progress' && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                  Estrategia en progreso ({status.completedCount}/6 fases)
                </Badge>
              )}
              {status.overallStatus === 'completed' && !status.clientValidated && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  Estrategia completa
                </Badge>
              )}
              {status.clientValidated && (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1 flex items-center">
                  <ShieldCheck className="h-3 w-3" /> Estrategia validada
                </Badge>
              )}
            </div>
            <Link href={`/clientes/${clienteId}?tab=social`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <ExternalLink className="h-3.5 w-3.5" />
                Ficha del cliente
              </Button>
            </Link>
          </div>

          {/* Banner: sin estrategia */}
          {!estrategiaCompleta && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">
                  Este cliente no tiene estrategia social configurada
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Ve a la ficha del cliente → pestaña Social Media para configurarla.
                  {status.overallStatus === 'in_progress' && ` (${status.completedCount}/6 fases completadas)`}
                </p>
              </div>
              <Link href={`/clientes/${clienteId}?tab=social`}>
                <Button size="sm" className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ir a ficha del cliente
                </Button>
              </Link>
            </div>
          )}

          {/* Tabs de ejecución (solo si estrategia completa) */}
          {estrategiaCompleta && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="calendario" className="gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Calendario
                </TabsTrigger>
                <TabsTrigger value="piezas" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Piezas
                </TabsTrigger>
                <TabsTrigger value="publicacion" className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  Publicación
                </TabsTrigger>
                <TabsTrigger value="kpis" className="gap-1.5">
                  <BarChart2 className="h-3.5 w-3.5" />
                  KPIs
                </TabsTrigger>
              </TabsList>

              <TabsContent value="calendario" className="mt-4">
                <SocialCalendar
                  clientId           = {clienteId}
                  autoOpenPlanModal  = {autoOpenPlan}
                />
              </TabsContent>
              <TabsContent value="piezas">
                {clienteId
                  ? <SocialPosts clientId={clienteId} />
                  : <PlaceholderSprint sprint={7} titulo="Producción de piezas" descripcion="Selecciona un cliente para gestionar sus piezas de contenido." />
                }
              </TabsContent>
              <TabsContent value="publicacion" className="mt-4">
                {clienteId
                  ? <SocialPublication clientId={clienteId} />
                  : <PlaceholderSprint sprint={8} titulo="Publicación" descripcion="Selecciona un cliente para gestionar sus publicaciones." />
                }
              </TabsContent>
              <TabsContent value="kpis" className="mt-4">
                {clienteId
                  ? <SocialKPIsDashboard clientId={clienteId} />
                  : <PlaceholderSprint sprint={8} titulo="KPIs y métricas" descripcion="Selecciona un cliente para ver su dashboard de métricas." />
                }
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Placeholder de sprint ────────────────────────────────────────────────────

function PlaceholderSprint({
  sprint,
  titulo,
  descripcion,
}: {
  sprint     : number
  titulo     : string
  descripcion: string
}) {
  return (
    <div className="mt-4 rounded-xl border-2 border-dashed border-gray-200 p-12 flex flex-col items-center text-center">
      <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
        <Share2 className="h-6 w-6 text-gray-400" />
      </div>
      <p className="font-medium text-gray-700">{titulo}</p>
      <p className="text-sm text-gray-400 mt-1 max-w-sm">{descripcion}</p>
      <Badge variant="secondary" className="mt-3">Sprint {sprint}</Badge>
    </div>
  )
}
