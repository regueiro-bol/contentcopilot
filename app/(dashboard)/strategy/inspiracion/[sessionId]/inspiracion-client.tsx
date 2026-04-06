'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Lightbulb, TrendingUp, Users, FileText,
  ChevronDown, ChevronRight, Loader2, CheckCircle2, Star,
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

const URGENCIA_STYLE: Record<string, { label: string; cls: string }> = {
  alta:  { label: 'Alta',  cls: 'bg-red-100 text-red-700 border-red-200' },
  media: { label: 'Media', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  baja:  { label: 'Baja',  cls: 'bg-green-100 text-green-700 border-green-200' },
}

const SATURACION_STYLE: Record<string, { label: string; cls: string }> = {
  bajo:  { label: 'Bajo',  cls: 'bg-green-100 text-green-700' },
  medio: { label: 'Medio', cls: 'bg-amber-100 text-amber-700' },
  alto:  { label: 'Alto',  cls: 'bg-red-100 text-red-700' },
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
  const sat     = SATURACION_STYLE[resumen?.nivel_saturacion ?? 'medio'] ?? SATURACION_STYLE.medio

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

      {/* SECCION 1 — Resumen ejecutivo */}
      <Card className="border-indigo-100">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <Lightbulb className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Resumen ejecutivo</h2>
            <Badge className={`text-[10px] ${sat.cls}`}>Saturacion: {sat.label}</Badge>
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

      {/* SECCION 2 — Mapa del ecosistema (3 columnas) */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-500" /> Mapa del ecosistema
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Tu contenido */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-violet-700">Tu contenido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(propio?.temas_cubiertos ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Temas cubiertos</p>
                  <div className="flex flex-wrap gap-1">
                    {propio!.temas_cubiertos!.slice(0, 8).map((t, i) => (
                      <span key={i} className="text-[10px] bg-violet-50 text-violet-700 rounded px-1.5 py-0.5">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {(propio?.gaps_detectados ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Gaps detectados</p>
                  <ul className="space-y-0.5">
                    {propio!.gaps_detectados!.map((g, i) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                        <span className="text-red-400 mt-0.5">•</span>{g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Competencia */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-amber-700">Competencia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(comp?.analisis ?? []).map((c, i) => (
                <div key={i}>
                  <p className="text-[10px] font-semibold text-gray-700">{c.competidor}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {c.temas.slice(0, 4).map((t, j) => (
                      <span key={j} className="text-[10px] bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Oportunidades gap */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-emerald-700">Oportunidades</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {(comp?.gaps_vs_competencia ?? []).map((g, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                    <span className="text-emerald-500 mt-0.5">+</span>{g}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SECCION 3 — Tendencias del sector */}
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
                  <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 font-medium">{t}</span>
                ))}
              </div>
            </div>
          )}

          {(trend?.preguntas_frecuentes ?? []).length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase mb-1.5">Preguntas frecuentes del sector</p>
              <FaqAccordion preguntas={trend!.preguntas_frecuentes!} />
            </div>
          )}

          {(trend?.angulos_originales ?? []).length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase mb-1.5">Angulos originales detectados</p>
              <ul className="space-y-1">
                {trend!.angulos_originales!.map((a, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                    <Lightbulb className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />{a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECCION 4 — Oportunidades accionables */}
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
                  className={`rounded-lg border p-4 transition-all ${isMarcada ? 'border-indigo-300 bg-indigo-50/40 ring-1 ring-indigo-200' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-900">{op.tema}</p>
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

      {/* SECCION 5 — Ideas de contenido */}
      {ideas.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-500" /> Ideas de contenido ({ideas.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ideas.map((idea, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-sm font-medium text-gray-900 leading-snug mb-1.5">{idea.titulo}</p>
                <p className="text-xs text-gray-500 mb-2">{idea.angulo}</p>
                <span className="text-[10px] font-semibold text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">{idea.formato}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// FAQ Accordion
// ─────────────────────────────────────────────────────────────

function FaqAccordion({ preguntas }: { preguntas: string[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  return (
    <div className="space-y-1">
      {preguntas.map((p, i) => (
        <button key={i} type="button" onClick={() => setOpenIdx(openIdx === i ? null : i)}
          className="w-full text-left flex items-center gap-2 text-xs text-gray-700 hover:text-gray-900 py-1.5 px-2 rounded hover:bg-gray-50 transition-colors">
          {openIdx === i ? <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" /> : <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />}
          {p}
        </button>
      ))}
    </div>
  )
}
