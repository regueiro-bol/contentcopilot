'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Lightbulb, TrendingUp, Users, FileText,
  ChevronDown, ChevronRight, Loader2, CheckCircle2, Star,
  Search, BarChart3, Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface Oportunidad {
  id: string; tema: string; por_que_oportunidad: string
  enfoque_recomendado: string; urgencia: 'alta' | 'media' | 'baja'; marcada: boolean
}

interface IdeaContenido {
  titulo: string; angulo: string; formato: string
}

interface Resultado {
  resumen_ejecutivo?: {
    oportunidades_principales?: string[]
    nivel_saturacion?: string
    recomendacion_posicionamiento?: string
  }
  contenido_propio?: {
    temas_cubiertos?: string[]; formatos_usados?: string[]; gaps_detectados?: string[]
  }
  competencia?: {
    analisis?: Array<{ competidor: string; temas: string[] }>
    gaps_vs_competencia?: string[]
  }
  tendencias?: {
    temas_trending?: string[]; preguntas_frecuentes?: string[]; angulos_originales?: string[]
  }
  oportunidades?: Oportunidad[]
  ideas_contenido?: IdeaContenido[]
}

interface Props {
  sessionId: string; clientId: string; clienteNombre: string; clienteSector: string | null
  status: string; resultado: Record<string, unknown>; oportunidadesMarcadas: string[]
  createdAt: string
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const URGENCIA_STYLE: Record<string, { label: string; cls: string; border: string; emoji: string }> = {
  alta:  { label: 'Alta',  cls: 'bg-red-100 text-red-700 border-red-200',       border: 'border-l-red-500',   emoji: '🔴' },
  media: { label: 'Media', cls: 'bg-amber-100 text-amber-700 border-amber-200', border: 'border-l-amber-400', emoji: '🟡' },
  baja:  { label: 'Baja',  cls: 'bg-green-100 text-green-700 border-green-200', border: 'border-l-green-500', emoji: '🟢' },
}

const SATURACION_CFG: Record<string, { label: string; cls: string; barCls: string; pct: number }> = {
  bajo:  { label: 'Bajo',  cls: 'bg-green-100 text-green-700', barCls: 'bg-green-500', pct: 25 },
  medio: { label: 'Medio', cls: 'bg-amber-100 text-amber-700', barCls: 'bg-amber-500', pct: 60 },
  alto:  { label: 'Alto',  cls: 'bg-red-100 text-red-700',     barCls: 'bg-red-500',   pct: 90 },
}

const FORMATO_ICON: Record<string, string> = {
  'guia': '📝', 'articulo': '📝', 'blog': '📝',
  'comparativa': '⚖️', 'versus': '⚖️',
  'faq': '❓', 'preguntas': '❓',
  'video': '🎥', 'tutorial': '🎥',
  'calculadora': '🔧', 'herramienta': '🔧', 'tool': '🔧',
  'listicle': '📋', 'lista': '📋', 'top': '📋',
  'caso': '⭐', 'exito': '⭐', 'caso de exito': '⭐',
  'infografia': '📊', 'datos': '📊',
  'opinion': '💬', 'experta': '💬',
}

function getFormatoIcon(formato: string): string {
  const lower = formato.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [key, icon] of Object.entries(FORMATO_ICON)) {
    if (lower.includes(key)) return icon
  }
  return '📝'
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export default function InspiracionClient({
  sessionId, clientId, clienteNombre, clienteSector, status, resultado, oportunidadesMarcadas, createdAt,
}: Props) {
  const r = resultado as Resultado
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(oportunidadesMarcadas))
  const [toggling, setToggling] = useState<string | null>(null)

  const hasMarcadas = marcadas.size > 0

  async function handleToggle(opId: string) {
    setToggling(opId)
    const nuevaMarcada = !marcadas.has(opId)
    const res = await fetch(`/api/strategy/inspiracion/${sessionId}/marcar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oportunidad_id: opId, marcada: nuevaMarcada }),
    })
    if (res.ok) {
      setMarcadas((prev) => {
        const next = new Set(prev)
        if (nuevaMarcada) next.add(opId); else next.delete(opId)
        return next
      })
    }
    setToggling(null)
  }

  if (status === 'running') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-4" />
        <p className="text-sm font-medium">Agente de Inspiracion analizando...</p>
        <p className="text-xs text-gray-400 mt-1">Esto puede tardar hasta 2 minutos</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <Card className="border-red-200">
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-600 font-medium">Error generando el informe de inspiracion</p>
          <p className="text-xs text-gray-400 mt-1">Intentalo de nuevo</p>
        </CardContent>
      </Card>
    )
  }

  if (status !== 'completed' || !r.resumen_ejecutivo) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Lightbulb className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Sesion pendiente</p>
        </CardContent>
      </Card>
    )
  }

  // ── Informe completado ────────────────────────────────────
  const resumen = r.resumen_ejecutivo
  const propio  = r.contenido_propio
  const comp    = r.competencia
  const trend   = r.tendencias
  const ops     = r.oportunidades ?? []
  const ideas   = r.ideas_contenido ?? []
  const satKey  = resumen?.nivel_saturacion ?? 'medio'
  const sat     = SATURACION_CFG[satKey] ?? SATURACION_CFG.medio

  // KPI counts
  const numCompetidores = (comp?.analisis ?? []).length
  const numGaps = (comp?.gaps_vs_competencia ?? []).length + (propio?.gaps_detectados ?? []).length
  const numOps  = ops.length
  const numIdeas = ideas.length

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Informe de Inspiracion</h1>
          <p className="text-sm text-gray-500">
            {clienteNombre}{clienteSector ? ` · ${clienteSector}` : ''} ·{' '}
            {new Date(createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Button asChild size="sm" disabled={!hasMarcadas}
          className={`gap-2 ${hasMarcadas ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-300 cursor-not-allowed'}`}>
          <Link href={`/strategy/nueva?cliente=${clientId}&inspiracion=${sessionId}`}>
            Pasar a investigacion de keywords
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {hasMarcadas && (
        <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {marcadas.size} oportunidad{marcadas.size !== 1 ? 'es' : ''} seleccionada{marcadas.size !== 1 ? 's' : ''} para la investigacion
        </div>
      )}

      {/* MEJORA 1 — KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Competidores analizados', value: numCompetidores, icon: Users,     color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Gaps detectados',         value: numGaps,         icon: Search,    color: 'text-red-600',   bg: 'bg-red-50' },
          { label: 'Oportunidades',           value: numOps,          icon: Target,    color: 'text-indigo-600',bg: 'bg-indigo-50' },
          { label: 'Ideas generadas',         value: numIdeas,        icon: Lightbulb, color: 'text-violet-600',bg: 'bg-violet-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-[10px] text-gray-500">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* SECCION 1 — Resumen ejecutivo */}
      <Card className="border-indigo-100">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <Lightbulb className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Resumen ejecutivo</h2>
            <Badge className={`text-[10px] ${sat.cls}`}>Saturacion: {sat.label}</Badge>
            {/* MEJORA 2 — Barra de saturacion */}
            <div className="w-[200px] h-2 bg-gray-200 rounded-full overflow-hidden ml-1">
              <div className={`h-full rounded-full transition-all ${sat.barCls}`} style={{ width: `${sat.pct}%` }} />
            </div>
          </div>

          {resumen?.oportunidades_principales && resumen.oportunidades_principales.length > 0 && (
            <ul className="space-y-1.5 mb-4">
              {resumen.oportunidades_principales.map((op, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <Star className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  {op}
                </li>
              ))}
            </ul>
          )}

          {resumen?.recomendacion_posicionamiento && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-xs font-medium text-blue-800 mb-1">Recomendacion de posicionamiento</p>
              <p className="text-sm text-blue-700 leading-relaxed">{resumen.recomendacion_posicionamiento}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MEJORA 3 — Mapa del ecosistema visual */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-gray-500" /> Mapa del ecosistema
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-0 items-stretch">
          {/* TU */}
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Tu contenido
            </p>
            {(propio?.temas_cubiertos ?? []).length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-emerald-600 uppercase mb-1">Temas cubiertos</p>
                <ul className="space-y-0.5">
                  {propio!.temas_cubiertos!.slice(0, 6).map((t, i) => (
                    <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5">+</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(propio?.gaps_detectados ?? []).length > 0 && (
              <div>
                <p className="text-[10px] text-red-500 uppercase mb-1">Gaps</p>
                <ul className="space-y-0.5">
                  {propio!.gaps_detectados!.slice(0, 4).map((g, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-red-400 mt-0.5">-</span>{g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Flecha vs */}
          <div className="hidden md:flex items-center justify-center px-2">
            <span className="text-gray-400 text-sm font-bold">vs</span>
          </div>

          {/* COMPETENCIA */}
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50/40 p-4">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Competencia
            </p>
            {(comp?.analisis ?? []).map((c, i) => (
              <div key={i} className="mb-2">
                <p className="text-[10px] font-semibold text-gray-700">{c.competidor}</p>
                <ul className="space-y-0.5 mt-0.5">
                  {c.temas.slice(0, 3).map((t, j) => (
                    <li key={j} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">•</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Flecha = */}
          <div className="hidden md:flex items-center justify-center px-2">
            <span className="text-gray-400 text-lg">=</span>
          </div>

          {/* OPORTUNIDADES */}
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> Oportunidades
            </p>
            <ul className="space-y-1">
              {(comp?.gaps_vs_competencia ?? []).map((g, i) => (
                <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                  <Target className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />{g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* MEJORA 4 — Tendencias del sector con tags colorados */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" /> Tendencias del sector
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(trend?.temas_trending ?? []).length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase mb-1.5">Temas trending</p>
              <div className="flex flex-wrap gap-1.5">
                {trend!.temas_trending!.map((t, i) => (
                  <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 font-medium">{t}</span>
                ))}
              </div>
            </div>
          )}

          {(trend?.preguntas_frecuentes ?? []).length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase mb-1.5">Preguntas frecuentes del sector</p>
              <div className="space-y-1">
                {trend!.preguntas_frecuentes!.map((p, i) => (
                  <FaqItem key={i} pregunta={p} />
                ))}
              </div>
            </div>
          )}

          {(trend?.angulos_originales ?? []).length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase mb-1.5">Angulos originales detectados</p>
              <div className="flex flex-wrap gap-1.5">
                {trend!.angulos_originales!.map((a, i) => (
                  <span key={i} className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2.5 py-0.5 font-medium flex items-center gap-1">
                    <Lightbulb className="h-3 w-3" />{a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MEJORA 5 — Oportunidades accionables mejoradas */}
      {ops.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" /> Oportunidades ({ops.length})
            {hasMarcadas && <span className="text-[10px] text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">{marcadas.size} seleccionadas</span>}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ops.map((op) => {
              const isMarcada = marcadas.has(op.id)
              const urg = URGENCIA_STYLE[op.urgencia] ?? URGENCIA_STYLE.media
              return (
                <div key={op.id}
                  className={`rounded-lg border border-l-4 p-4 transition-all ${urg.border} ${
                    isMarcada ? 'bg-indigo-50/50 ring-1 ring-indigo-200' : 'bg-white'
                  }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{urg.emoji}</span>
                      <p className="text-sm font-semibold text-gray-900">{op.tema}</p>
                    </div>
                    <Badge className={`text-[10px] shrink-0 ${urg.cls}`}>{urg.label}</Badge>
                  </div>
                  <p className="text-xs text-gray-600 mb-1.5"><span className="font-medium text-gray-700">Por que:</span> {op.por_que_oportunidad}</p>
                  <p className="text-xs text-gray-600 mb-3"><span className="font-medium text-gray-700">Enfoque:</span> {op.enfoque_recomendado}</p>
                  <button type="button" onClick={() => handleToggle(op.id)} disabled={toggling === op.id}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-lg px-3 py-1.5 transition-colors ${
                      isMarcada
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {toggling === op.id ? <Loader2 className="h-3 w-3 animate-spin" />
                      : isMarcada ? <CheckCircle2 className="h-3 w-3" />
                      : <span className="h-3 w-3 rounded-full border-2 border-gray-400 inline-block" />}
                    {isMarcada ? 'Incluida en estrategia' : 'Incluir en estrategia'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* MEJORA 6 — Ideas de contenido con iconos de formato */}
      {ideas.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-500" /> Ideas de contenido ({ideas.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ideas.map((idea, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-sm transition-shadow">
                <p className="text-sm font-medium text-gray-900 leading-snug mb-1.5">{idea.titulo}</p>
                <p className="text-xs text-gray-500 mb-2">{idea.angulo}</p>
                <span className="text-[10px] font-semibold text-violet-700 bg-violet-50 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                  <span>{getFormatoIcon(idea.formato)}</span>
                  {idea.formato}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// FAQ Item colapsable (chip verde)
// ─────────────────────────────────────────────────────────────

function FaqItem({ pregunta }: { pregunta: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button type="button" onClick={() => setOpen(!open)}
      className={`w-full text-left flex items-center gap-2 text-xs rounded-lg px-3 py-2 transition-colors border ${
        open ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-green-50/50'
      }`}>
      <span className="text-green-500 shrink-0">❓</span>
      <span className="flex-1">{pregunta}</span>
      {open ? <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" /> : <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />}
    </button>
  )
}
