'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Lightbulb, FileText, Smartphone, Palette, Target,
  Loader2, ChevronRight, Lock, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface Cliente { id: string; nombre: string; sector: string | null }
interface Sesion {
  id: string; client_id: string; client_nombre: string
  status: string; foco: string; created_at: string
}

interface Props {
  clientes: Cliente[]
  sesiones: Sesion[]
  clienteIdInicial: string | null
}

// ─────────────────────────────────────────────────────────────
// Focos
// ─────────────────────────────────────────────────────────────

const FOCOS = [
  { id: 'contenidos',  label: 'Contenidos',       emoji: '📝', desc: 'Analiza blogs, SEO y gaps de contenido', activo: true,  icon: FileText },
  { id: 'rrss',        label: 'Redes Sociales',   emoji: '📱', desc: 'Explora que publican en RRSS',          activo: false, icon: Smartphone },
  { id: 'visual',      label: 'Visual / Diseno',  emoji: '🎨', desc: 'Inspirate en el diseno de referentes',  activo: false, icon: Palette },
  { id: 'global',      label: 'Estrategia Global', emoji: '🎯', desc: 'Vision 360 de todos los canales',     activo: false, icon: Target },
]

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Pendiente',  cls: 'bg-gray-100 text-gray-600' },
  running:   { label: 'Analizando', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completado', cls: 'bg-green-100 text-green-700' },
  error:     { label: 'Error',      cls: 'bg-red-100 text-red-700' },
}

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────

export default function InspiracionLandingClient({ clientes, sesiones, clienteIdInicial }: Props) {
  const router = useRouter()
  const [clienteId, setClienteId] = useState(clienteIdInicial ?? '')
  const [foco, setFoco]           = useState('contenidos')
  const [lanzando, setLanzando]   = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const sesionesCliente = clienteId
    ? sesiones.filter((s) => s.client_id === clienteId)
    : sesiones

  async function handleLanzar() {
    if (!clienteId) return
    setLanzando(true)
    setError(null)
    try {
      const res = await fetch('/api/strategy/inspiracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clienteId, foco }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Error lanzando analisis')
      if (data.session_id) {
        router.push(`/inspiracion/${data.session_id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLanzando(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-amber-500" />
          Agente de Inspiracion
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Analiza tu ecosistema competitivo y detecta oportunidades de contenido antes de disenar tu estrategia.
        </p>
      </div>

      {/* Selector cliente */}
      <Card>
        <CardContent className="p-4">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Selecciona un cliente</label>
          <select
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
            <option value="">Seleccionar cliente...</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}{c.sector ? ` · ${c.sector}` : ''}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Selector de foco */}
      {clienteId && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Selecciona el foco del analisis</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {FOCOS.map((f) => {
              const selected = foco === f.id
              const Icon = f.icon
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={!f.activo}
                  onClick={() => f.activo && setFoco(f.id)}
                  className={`relative rounded-xl border p-4 text-left transition-all ${
                    !f.activo
                      ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
                      : selected
                        ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200'
                        : 'border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm cursor-pointer'
                  }`}
                >
                  {!f.activo && (
                    <span className="absolute top-2 right-2">
                      <Lock className="h-3 w-3 text-gray-400" />
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{f.emoji}</span>
                    <Icon className={`h-4 w-4 ${selected ? 'text-indigo-600' : 'text-gray-400'}`} />
                  </div>
                  <p className={`text-xs font-semibold ${selected ? 'text-indigo-900' : 'text-gray-800'}`}>{f.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{f.desc}</p>
                  {!f.activo && (
                    <p className="text-[9px] text-gray-400 mt-1 uppercase tracking-wide">Proximamente</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Boton lanzar */}
      {clienteId && (
        <div className="flex items-center gap-3">
          <Button
            onClick={handleLanzar}
            disabled={lanzando || !clienteId}
            className="gap-2 bg-amber-600 hover:bg-amber-700"
          >
            {lanzando
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Analizando...</>
              : <><Lightbulb className="h-4 w-4" /> Lanzar analisis</>}
          </Button>
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </div>
          )}
        </div>
      )}

      {/* Historial */}
      {sesionesCliente.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Informes anteriores</p>
            <div className="divide-y divide-gray-100">
              {sesionesCliente.slice(0, 5).map((s) => {
                const st = STATUS_LABEL[s.status] ?? STATUS_LABEL.pending
                return (
                  <div key={s.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm text-gray-800">{s.client_nombre}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(s.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}{s.foco}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${st.cls}`}>{st.label}</Badge>
                      {s.status === 'completed' && (
                        <Link href={`/inspiracion/${s.id}`}
                          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5">
                          Ver <ChevronRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
