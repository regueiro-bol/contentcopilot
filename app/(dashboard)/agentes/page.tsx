'use client'

import { useState, useRef, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  FileText, PenTool, CheckSquare, User, BookOpen, Mic,
  Feather, Zap, Map, MessageSquare, X, Send, Loader2,
  Sparkles,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent } from '@/components/ui/dialog'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type Flujo = 'todos' | 'entrada' | 'produccion' | 'revision' | 'planificacion' | 'configuracion'

interface AgenteConfig {
  id: string
  nombre: string
  descripcion: string
  icono: keyof typeof ICONOS
  color: keyof typeof COLORES
  dify_app_id: string
  estado: 'activo' | 'proximamente'
  flujo: Exclude<Flujo, 'todos'>
  uso: string
}

interface Mensaje {
  rol: 'usuario' | 'asistente'
  contenido: string
}

// ---------------------------------------------------------------------------
// Constantes de estilo
// ---------------------------------------------------------------------------
const ICONOS = {
  FileText, PenTool, CheckSquare, User, BookOpen, Mic,
  Feather, Zap, Map, MessageSquare,
}

const COLORES: Record<string, { bg: string; icon: string; badge: string; btn: string }> = {
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700',   btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700 text-white' },
  green:  { bg: 'bg-green-50',  icon: 'text-green-600',  badge: 'bg-green-100 text-green-700',  btn: 'bg-green-600 hover:bg-green-700 text-white' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-600', badge: 'bg-orange-100 text-orange-700', btn: 'bg-orange-600 hover:bg-orange-700 text-white' },
  teal:   { bg: 'bg-teal-50',   icon: 'text-teal-600',   badge: 'bg-teal-100 text-teal-700',   btn: 'bg-teal-600 hover:bg-teal-700 text-white' },
  pink:   { bg: 'bg-pink-50',   icon: 'text-pink-600',   badge: 'bg-pink-100 text-pink-700',   btn: 'bg-pink-600 hover:bg-pink-700 text-white' },
  indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-700', btn: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
  yellow: { bg: 'bg-yellow-50', icon: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-700', btn: 'bg-yellow-600 hover:bg-yellow-700 text-white' },
  cyan:   { bg: 'bg-cyan-50',   icon: 'text-cyan-600',   badge: 'bg-cyan-100 text-cyan-700',   btn: 'bg-cyan-600 hover:bg-cyan-700 text-white' },
  rose:   { bg: 'bg-rose-50',   icon: 'text-rose-600',   badge: 'bg-rose-100 text-rose-700',   btn: 'bg-rose-600 hover:bg-rose-700 text-white' },
}

const ETIQUETAS_FLUJO: Record<Flujo, string> = {
  todos:         'Todos',
  entrada:       'Entrada',
  produccion:    'Producción',
  revision:      'Revisión',
  planificacion: 'Planificación',
  configuracion: 'Configuración',
}

// ---------------------------------------------------------------------------
// Catálogo de agentes
// ---------------------------------------------------------------------------
const AGENTES: AgenteConfig[] = [
  {
    id: 'brief_seo',
    nombre: 'Brief SEO',
    descripcion: 'Procesa el Excel SEO y genera un brief de redacción estructurado y completo',
    icono: 'FileText',
    color: 'blue',
    dify_app_id: process.env.NEXT_PUBLIC_DIFY_BRIEF_SEO_APP_ID ?? '',
    estado: 'activo',
    flujo: 'entrada',
    uso: 'Sube o pega los datos del Excel SEO y obtén un brief listo para el redactor',
  },
  {
    id: 'redactor_copiloto',
    nombre: 'Redactor Copiloto',
    descripcion: 'Asistente en tiempo real mientras escribes. Susurros, borrador automático y revisión',
    icono: 'PenTool',
    color: 'purple',
    dify_app_id: process.env.NEXT_PUBLIC_DIFY_REDACTOR_COPILOTO_APP_ID ?? '',
    estado: 'activo',
    flujo: 'produccion',
    uso: 'Úsalo desde el editor de contenido — botón Abrir Copiloto',
  },
  {
    id: 'revisor_geo_seo',
    nombre: 'Revisor GEO-SEO',
    descripcion: 'Analiza el texto redactado y emite un informe completo de calidad SEO y GEO',
    icono: 'CheckSquare',
    color: 'green',
    dify_app_id: process.env.NEXT_PUBLIC_DIFY_REVISOR_GEO_SEO_APP_ID ?? '',
    estado: 'activo',
    flujo: 'revision',
    uso: 'Úsalo desde el tab Revisiones de cualquier contenido',
  },
  {
    id: 'humanizador',
    nombre: 'Humanizador',
    descripcion: 'Transforma textos con patrones de IA para que suenen genuinamente humanos en español',
    icono: 'User',
    color: 'orange',
    dify_app_id: process.env.NEXT_PUBLIC_DIFY_HUMANIZADOR_APP_ID ?? '',
    estado: 'activo',
    flujo: 'revision',
    uso: 'Pega el texto generado y recibe la versión humanizada lista para publicar',
  },
  {
    id: 'legibilidad',
    nombre: 'Legibilidad Lectora',
    descripcion: 'Adapta densidad, ritmo y léxico del texto al perfil cognitivo del lector objetivo',
    icono: 'BookOpen',
    color: 'teal',
    dify_app_id: process.env.NEXT_PUBLIC_DIFY_LEGIBILIDAD_APP_ID ?? '',
    estado: 'activo',
    flujo: 'revision',
    uso: 'Pega el texto e indica el perfil de lector para recibir la versión adaptada',
  },
  {
    id: 'voz_marca',
    nombre: 'Voz de Marca',
    descripcion: 'Analiza textos del cliente para extraer su voz de marca o audita textos redactados',
    icono: 'Mic',
    color: 'pink',
    dify_app_id: process.env.NEXT_PUBLIC_DIFY_VOZ_MARCA_APP_ID ?? '',
    estado: 'activo',
    flujo: 'configuracion',
    uso: 'Sube textos del cliente para generar su perfil de voz, o audita un texto redactado',
  },
  {
    id: 'perfil_autor',
    nombre: 'Perfil de Autor',
    descripcion: 'Analiza textos de un redactor para extraer y documentar su fingerprint de escritura',
    icono: 'Feather',
    color: 'indigo',
    dify_app_id: process.env.NEXT_PUBLIC_DIFY_PERFIL_AUTOR_APP_ID ?? '',
    estado: 'activo',
    flujo: 'configuracion',
    uso: 'Sube 3 o más textos del redactor para generar su perfil de estilo',
  },
  {
    id: 'geo_optimizer',
    nombre: 'GEO Optimizer',
    descripcion: 'Aplica las 8 optimizaciones GEO directamente al texto para maximizar citabilidad en IA',
    icono: 'Zap',
    color: 'yellow',
    dify_app_id: process.env.NEXT_PUBLIC_DIFY_GEO_OPTIMIZER_APP_ID ?? '',
    estado: 'activo',
    flujo: 'revision',
    uso: 'Pega el texto tras la revisión GEO-SEO para aplicar las mejoras automáticamente',
  },
  {
    id: 'estrategia',
    nombre: 'Estrategia de Contenidos',
    descripcion: 'Planifica calendarios, detecta gaps, prioriza temas e idea contenidos por proyecto',
    icono: 'Map',
    color: 'cyan',
    dify_app_id: process.env.NEXT_PUBLIC_DIFY_ESTRATEGIA_APP_ID ?? '',
    estado: 'activo',
    flujo: 'planificacion',
    uso: 'Solicita un calendario, análisis de gaps o ideas de contenido para un proyecto',
  },
  {
    id: 'asistente_briefing',
    nombre: 'Asistente de Briefing',
    descripcion: 'Transforma notas, emails y mensajes informales en briefs estructurados listos para producción',
    icono: 'MessageSquare',
    color: 'rose',
    dify_app_id: process.env.NEXT_PUBLIC_DIFY_ASISTENTE_BRIEFING_APP_ID ?? '',
    estado: 'activo',
    flujo: 'entrada',
    uso: 'Pega cualquier input informal — notas, emails, WhatsApps — y recibe un brief estructurado',
  },
]

// ---------------------------------------------------------------------------
// Modal de chat
// ---------------------------------------------------------------------------
function ChatModal({
  agente,
  userId,
  open,
  onClose,
}: {
  agente: AgenteConfig
  userId: string
  open: boolean
  onClose: () => void
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [conversacionId, setConversacionId] = useState<string | undefined>()
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const col = COLORES[agente.color]
  const Icono = ICONOS[agente.icono]

  useEffect(() => {
    if (open) {
      setMensajes([])
      setInput('')
      setConversacionId(undefined)
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [open, agente.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, enviando])

  async function enviar() {
    const texto = input.trim()
    if (!texto || enviando) return

    const nuevosMensajes: Mensaje[] = [...mensajes, { rol: 'usuario', contenido: texto }]
    setMensajes(nuevosMensajes)
    setInput('')
    setEnviando(true)

    try {
      const res = await fetch('/api/dify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: texto,
          app_id: agente.dify_app_id,
          conversacion_id: conversacionId ?? '',
          usuario: userId,
          modo: 'blocking',
        }),
      })

      const datos = await res.json()

      if (!res.ok) {
        setMensajes([...nuevosMensajes, {
          rol: 'asistente',
          contenido: `⚠️ Error: ${datos.error ?? 'No se pudo conectar con el agente'}`,
        }])
        return
      }

      if (datos.conversacion_id) setConversacionId(datos.conversacion_id)

      setMensajes([...nuevosMensajes, {
        rol: 'asistente',
        contenido: datos.answer ?? datos.respuesta ?? 'Sin respuesta',
      }])
    } catch {
      setMensajes([...nuevosMensajes, {
        rol: 'asistente',
        contenido: '⚠️ Error de red al conectar con el agente. Inténtalo de nuevo.',
      }])
    } finally {
      setEnviando(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Cabecera */}
        <div className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 ${col.bg}`}>
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${col.bg} ring-1 ring-black/5`}>
              <Icono className={`h-5 w-5 ${col.icon}`} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{agente.nombre}</p>
              <p className="text-xs text-gray-500">{agente.descripcion}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-gray-50/50">
          {mensajes.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-4 ${col.bg}`}>
                <Icono className={`h-7 w-7 ${col.icon}`} />
              </div>
              <p className="text-sm font-semibold text-gray-700">{agente.nombre}</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">{agente.uso}</p>
              <p className="text-xs text-gray-300 mt-4">⌘ Enter para enviar</p>
            </div>
          )}

          {mensajes.map((m, i) => (
            <div key={i} className={`flex ${m.rol === 'usuario' ? 'justify-end' : 'justify-start'}`}>
              {m.rol === 'asistente' && (
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center mr-2.5 shrink-0 mt-0.5 ${col.bg}`}>
                  <Icono className={`h-3.5 w-3.5 ${col.icon}`} />
                </div>
              )}
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  m.rol === 'usuario'
                    ? 'bg-indigo-600 text-white rounded-br-md'
                    : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'
                }`}
              >
                {m.rol === 'asistente' ? (
                  <div className="prose prose-sm prose-gray max-w-none prose-headings:text-gray-900 prose-headings:font-semibold prose-p:text-gray-700 prose-li:text-gray-700 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-strong:text-gray-900">
                    <ReactMarkdown>{m.contenido}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.contenido}</p>
                )}
              </div>
            </div>
          ))}

          {enviando && (
            <div className="flex justify-start">
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center mr-2.5 shrink-0 ${col.bg}`}>
                <Icono className={`h-3.5 w-3.5 ${col.icon}`} />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs text-gray-400">Generando respuesta...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 bg-white px-4 py-3">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Escribe tu mensaje para ${agente.nombre}...`}
              className="min-h-[44px] max-h-36 resize-none text-sm border-gray-200 focus:border-indigo-300 rounded-xl"
              disabled={enviando}
              rows={1}
            />
            <Button
              onClick={enviar}
              disabled={!input.trim() || enviando}
              size="sm"
              className={`h-11 w-11 p-0 rounded-xl shrink-0 ${col.btn}`}
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {mensajes.length > 0 && (
            <button
              onClick={() => { setMensajes([]); setConversacionId(undefined) }}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Limpiar conversación
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Tarjeta de agente
// ---------------------------------------------------------------------------
function AgenteCard({
  agente,
  onUsar,
}: {
  agente: AgenteConfig
  onUsar: (a: AgenteConfig) => void
}) {
  const col = COLORES[agente.color]
  const Icono = ICONOS[agente.icono]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all flex flex-col">
      <div className="p-5 flex-1 space-y-3">
        {/* Cabecera tarjeta */}
        <div className="flex items-start justify-between gap-2">
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${col.bg}`}>
            <Icono className={`h-5 w-5 ${col.icon}`} />
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${col.badge}`}>
              {ETIQUETAS_FLUJO[agente.flujo]}
            </span>
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-50 text-green-700">
              ● Activo
            </span>
          </div>
        </div>

        {/* Nombre y descripción */}
        <div>
          <h3 className="text-sm font-bold text-gray-900">{agente.nombre}</h3>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{agente.descripcion}</p>
        </div>

        {/* Cómo usarlo */}
        <div className="bg-gray-50 rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Cómo usarlo</p>
          <p className="text-xs text-gray-600 leading-relaxed">{agente.uso}</p>
        </div>
      </div>

      {/* Botón */}
      <div className="px-5 pb-5">
        <button
          onClick={() => onUsar(agente)}
          className={`w-full rounded-xl py-2 px-4 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${col.btn}`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Usar agente
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function AgentesPage() {
  const { user } = useUser()
  const userId = user?.id ?? 'anon'

  const [filtro, setFiltro] = useState<Flujo>('todos')
  const [agenteChat, setAgenteChat] = useState<AgenteConfig | null>(null)

  const agentesActivos = AGENTES.filter((a) => a.estado === 'activo')

  const agetesFiltrados = filtro === 'todos'
    ? agentesActivos
    : agentesActivos.filter((a) => a.flujo === filtro)

  const contadorFlujo = (f: Exclude<Flujo, 'todos'>) =>
    agentesActivos.filter((a) => a.flujo === f).length

  const FILTROS: { value: Flujo; label: string; count?: number }[] = [
    { value: 'todos',         label: 'Todos',         count: agentesActivos.length },
    { value: 'entrada',       label: 'Entrada',       count: contadorFlujo('entrada') },
    { value: 'produccion',    label: 'Producción',    count: contadorFlujo('produccion') },
    { value: 'revision',      label: 'Revisión',      count: contadorFlujo('revision') },
    { value: 'planificacion', label: 'Planificación', count: contadorFlujo('planificacion') },
    { value: 'configuracion', label: 'Configuración', count: contadorFlujo('configuracion') },
  ]

  return (
    <div className="space-y-7 max-w-6xl">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">Agentes IA</h2>
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-700">
              {agentesActivos.length} activos
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            10 agentes especializados para el flujo completo de producción de contenidos
          </p>
        </div>
      </div>

      {/* Filtros por flujo */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all border ${
              filtro === f.value
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {f.label}
            {f.count !== undefined && (
              <span className={`text-xs rounded-full px-1.5 py-0 ${
                filtro === f.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Grid de tarjetas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agetesFiltrados.map((agente) => (
          <AgenteCard key={agente.id} agente={agente} onUsar={setAgenteChat} />
        ))}
      </div>

      {agetesFiltrados.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay agentes en esta categoría</p>
        </div>
      )}

      {/* Modal de chat */}
      {agenteChat && (
        <ChatModal
          agente={agenteChat}
          userId={userId}
          open={!!agenteChat}
          onClose={() => setAgenteChat(null)}
        />
      )}
    </div>
  )
}
