'use client'

import { useState } from 'react'
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  AlertTriangle,
  Check,
  X,
  Minus,
  Link2,
} from 'lucide-react'
import { calcularPuntuaciones } from '@/lib/revisor-scoring'

// ---------------------------------------------------------------------------
// Tipos del informe JSON del Agente Revisor GEO-SEO
// ---------------------------------------------------------------------------
type EstadoGEO = 'ok' | 'mejorable' | 'ausente' | 'problema' | 'no_aplica'
type EstadoKeyword = 'ok' | 'atencion' | 'problema'
type EstadoExtension = 'ok' | 'corto' | 'largo'
type EstadoKeywordSec = 'presente' | 'parcial' | 'ausente'
type EstadoEstructura = 'respetada' | 'modificada' | 'incompleta'
type Prioridad = 'alta' | 'media' | 'baja'
type Veredicto = 'listo_para_publicar' | 'revision_menor' | 'revision_necesaria'

interface PrincipioGEO {
  numero: number
  nombre: string
  estado: EstadoGEO
  detalle?: string
}

interface KeywordSecundaria {
  keyword: string
  estado: EstadoKeywordSec
}

interface MejoraPrioritaria {
  prioridad: Prioridad
  titulo: string
  que_hacer: string
  donde?: string
}

interface InformeGEOSEO {
  veredicto: Veredicto
  resumen: string
  // Puntuaciones: se calculan por código (lib/revisor-scoring). Opcionales aquí
  // porque el JSON de Claude ya no las incluye — el dashboard las deriva.
  puntuacion_seo?: number
  puntuacion_geo?: number
  puntuacion_total?: number
  extension: {
    palabras_actual: number
    estado: EstadoExtension
  }
  keyword_principal: {
    keyword?: string
    estado: EstadoKeyword
  }
  estructura_hs: {
    estado: EstadoEstructura
    h1_duplicado?: boolean
    jerarquia_correcta?: boolean
    detalle?: string
  }
  enlaces_internos_check?: {
    total_requeridos: number
    insertados: number
    faltantes: Array<{ anchor: string; url: string }>
  }
  principios_geo: PrincipioGEO[]
  keywords_secundarias: KeywordSecundaria[]
  mejoras_prioritarias: MejoraPrioritaria[]
}

// ---------------------------------------------------------------------------
// Helpers de color / icono
// ---------------------------------------------------------------------------
function colorPuntuacion(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-500'
  return 'text-red-500'
}

function bgBarPuntuacion(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-400'
  return 'bg-red-500'
}

function estadoGEOConfig(estado: EstadoGEO) {
  switch (estado) {
    case 'ok':
      return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'OK', icon: <Check className="h-3 w-3" /> }
    case 'mejorable':
      return { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Mejorable', icon: <AlertTriangle className="h-3 w-3" /> }
    case 'ausente':
      return { bg: 'bg-red-100', text: 'text-red-600', label: 'Ausente', icon: <X className="h-3 w-3" /> }
    case 'problema':
      return { bg: 'bg-red-200', text: 'text-red-700', label: 'Problema', icon: <X className="h-3 w-3" /> }
    case 'no_aplica':
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-500', label: 'N/A', icon: <Minus className="h-3 w-3" /> }
  }
}

function estadoKeywordSecConfig(estado: EstadoKeywordSec) {
  switch (estado) {
    case 'presente':
      return { bg: 'bg-emerald-100 text-emerald-700', icon: <Check className="h-3 w-3" /> }
    case 'parcial':
      return { bg: 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="h-3 w-3" /> }
    case 'ausente':
    default:
      return { bg: 'bg-red-100 text-red-600', icon: <X className="h-3 w-3" /> }
  }
}

function prioridadConfig(p: Prioridad) {
  switch (p) {
    case 'alta':
      return { bg: 'bg-red-100 text-red-700', label: 'Alta' }
    case 'media':
      return { bg: 'bg-amber-100 text-amber-700', label: 'Media' }
    case 'baja':
    default:
      return { bg: 'bg-gray-100 text-gray-600', label: 'Baja' }
  }
}

function estadoExtensionConfig(estado: EstadoExtension) {
  switch (estado) {
    case 'ok':
      return { bg: 'bg-emerald-100 text-emerald-700', label: 'OK' }
    case 'corto':
      return { bg: 'bg-red-100 text-red-600', label: 'Corto' }
    case 'largo':
      return { bg: 'bg-amber-100 text-amber-700', label: 'Largo' }
  }
}

function estadoKeywordConfig(estado: EstadoKeyword) {
  switch (estado) {
    case 'ok':
      return { bg: 'bg-emerald-100 text-emerald-700', label: 'OK' }
    case 'atencion':
      return { bg: 'bg-amber-100 text-amber-700', label: 'Atención' }
    case 'problema':
    default:
      return { bg: 'bg-red-100 text-red-600', label: 'Problema' }
  }
}

// FIX 2 — el badge de estructura depende SOLO de estructura_hs.estado.
// Los flags h1_duplicado / jerarquia_correcta se muestran como avisos aparte.
function estadoEstructuraConfig(estado: EstadoEstructura) {
  switch (estado) {
    case 'respetada':
      return { bg: 'bg-emerald-100 text-emerald-700', label: 'OK' }
    case 'modificada':
      return { bg: 'bg-amber-100 text-amber-700', label: 'Modificada' }
    case 'incompleta':
    default:
      return { bg: 'bg-red-100 text-red-600', label: 'Incompleta' }
  }
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

/** Barra de progreso animada */
function BarraProgreso({ valor, color }: { valor: number; color: string }) {
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, valor))}%` }}
      />
    </div>
  )
}

/** Badge compacto */
function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
interface Props {
  informe: string
  fecha: string
  agente: string
  onAplicarMejora?: (mejora: MejoraPrioritaria) => void
}

export default function InformeRevisionDashboard({ informe, fecha, agente, onAplicarMejora }: Props) {
  const [mejorasAplicadas, setMejorasAplicadas] = useState<Set<number>>(new Set())

  // Intentar parsear JSON
  let data: InformeGEOSEO | null = null
  let parseError = false

  try {
    // Limpiar posibles bloques de código markdown ```json ... ```
    const cleaned = informe
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
    data = JSON.parse(cleaned) as InformeGEOSEO
  } catch {
    parseError = true
  }

  // ── Fallback: texto sin parsear ──
  if (parseError || !data) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            El agente devolvió formato de texto — actualiza el prompt en Dify para obtener el dashboard visual.
          </p>
        </div>
        <pre className="w-full rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-sans overflow-auto max-h-[500px]">
          {informe}
        </pre>
      </div>
    )
  }

  // ── Puntuaciones calculadas por código (FIX 1) ──
  // Claude ya no puntúa: derivamos SEO/GEO/TOTAL de sus evaluaciones cualitativas.
  const puntuaciones = calcularPuntuaciones(data)

  // ── Cabecera veredicto ──
  const veredictoConfig = {
    listo_para_publicar: {
      bg: 'bg-emerald-500',
      text: 'text-white',
      label: 'Listo para publicar',
      icon: <CheckCircle className="h-10 w-10 text-white" />,
    },
    revision_menor: {
      bg: 'bg-amber-400',
      text: 'text-white',
      label: 'Revisión menor necesaria',
      icon: <AlertCircle className="h-10 w-10 text-white" />,
    },
    revision_necesaria: {
      bg: 'bg-red-500',
      text: 'text-white',
      label: 'Revisión necesaria',
      icon: <XCircle className="h-10 w-10 text-white" />,
    },
  }[data.veredicto] ?? {
    bg: 'bg-gray-400',
    text: 'text-white',
    label: data.veredicto,
    icon: <AlertCircle className="h-10 w-10 text-white" />,
  }

  return (
    <div className="space-y-5">

      {/* ── ZONA 1: Veredicto ── */}
      <div className={`rounded-2xl ${veredictoConfig.bg} p-6 flex items-start gap-5`}>
        <div className="shrink-0 mt-0.5">{veredictoConfig.icon}</div>
        <div>
          <p className={`text-xl font-bold ${veredictoConfig.text} leading-tight`}>
            {veredictoConfig.label}
          </p>
          {data.resumen && (
            <p className={`mt-1.5 text-sm ${veredictoConfig.text} opacity-90 leading-relaxed max-w-2xl`}>
              {data.resumen}
            </p>
          )}
        </div>
      </div>

      {/* ── ZONA 2: Puntuaciones (calculadas por código) ── */}
      {(() => {
        const seoDesgloseTxt = puntuaciones.desgloseSeo
          .map((d) => `${d.label}: ${d.puntos}/${d.max}${d.detalle ? ` (${d.detalle})` : ''}`)
          .join('\n')
        const cards = [
          {
            label: 'SEO',
            valor: puntuaciones.seo,
            caption: `${puntuaciones.desgloseSeo.filter((d) => d.puntos === d.max).length}/${puntuaciones.desgloseSeo.length} checks al máximo`,
            tooltip: `SEO ${puntuaciones.seo}/100\n${seoDesgloseTxt}`,
          },
          {
            label: 'GEO',
            valor: puntuaciones.geo,
            caption: `${puntuaciones.desgloseGeo.ok}/${puntuaciones.desgloseGeo.aplican} principios OK`,
            tooltip: `GEO ${puntuaciones.geo}: ${puntuaciones.desgloseGeo.texto}`,
          },
          {
            label: 'Puntuación total',
            valor: puntuaciones.total,
            caption: '(SEO + GEO) / 2',
            tooltip: `Total ${puntuaciones.total}: media de SEO (${puntuaciones.seo}) y GEO (${puntuaciones.geo})`,
          },
        ]
        return (
          <div className="grid grid-cols-3 gap-4">
            {cards.map(({ label, valor, caption, tooltip }) => (
              <div
                key={label}
                title={tooltip}
                className="rounded-xl border border-gray-200 bg-white p-4 text-center cursor-help"
              >
                <p className={`text-4xl font-extrabold ${colorPuntuacion(valor)} leading-none`}>
                  {valor}
                </p>
                <BarraProgreso valor={valor} color={bgBarPuntuacion(valor)} />
                <p className="text-xs font-semibold text-gray-500 mt-2 uppercase tracking-wide">{label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{caption}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── ZONA 2b: Desglose de cómo se calcularon las puntuaciones ── */}
      <details className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-gray-500 uppercase tracking-wide select-none">
          Cómo se calcularon las puntuaciones
        </summary>
        <div className="mt-3 space-y-3">
          {/* SEO */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              SEO {puntuaciones.seo}/100
            </p>
            <ul className="space-y-0.5">
              {puntuaciones.desgloseSeo.map((d) => (
                <li key={d.label} className="flex items-center justify-between gap-3 text-xs text-gray-600">
                  <span>
                    {d.label}
                    {d.detalle && <span className="text-gray-400"> — {d.detalle}</span>}
                  </span>
                  <span className={`font-mono font-semibold ${d.puntos === d.max ? 'text-emerald-600' : d.puntos === 0 ? 'text-red-500' : 'text-amber-500'}`}>
                    {d.puntos}/{d.max}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {/* GEO */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">
              GEO {puntuaciones.geo}/100
            </p>
            <p className="text-xs text-gray-600">
              {puntuaciones.desgloseGeo.texto}
            </p>
          </div>
          {/* Total */}
          <p className="text-xs text-gray-500">
            Total = (SEO {puntuaciones.seo} + GEO {puntuaciones.geo}) / 2 = {puntuaciones.total}
          </p>
        </div>
      </details>

      {/* ── ZONA 3: Datos rápidos ── */}
      {(data.extension || data.keyword_principal || data.estructura_hs) && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">

            {/* Extensión */}
            {data.extension && (() => {
              const cfg = estadoExtensionConfig(data.extension.estado)
              return (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Extensión</span>
                  <span className="text-xs font-semibold text-gray-800">{data.extension.palabras_actual} palabras</span>
                  <Badge className={cfg.bg}>{cfg.label}</Badge>
                </div>
              )
            })()}

            <span className="text-gray-200">|</span>

            {/* Keyword principal */}
            {data.keyword_principal && (() => {
              const cfg = estadoKeywordConfig(data.keyword_principal.estado)
              return (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Keyword principal</span>
                  {data.keyword_principal.keyword && (
                    <span className="text-xs font-medium text-gray-800">{data.keyword_principal.keyword}</span>
                  )}
                  <Badge className={cfg.bg}>{cfg.label}</Badge>
                </div>
              )
            })()}

            <span className="text-gray-200">|</span>

            {/* Estructura H's — badge depende SOLO de estado (FIX 2) */}
            {data.estructura_hs && (() => {
              const cfg = estadoEstructuraConfig(data.estructura_hs.estado)
              return (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Estructura H&apos;s</span>
                  <Badge className={cfg.bg}>{cfg.label}</Badge>
                </div>
              )
            })()}
          </div>

          {/* Avisos secundarios de estructura — separados del badge principal (FIX 2) */}
          {data.estructura_hs && (data.estructura_hs.h1_duplicado === true || data.estructura_hs.jerarquia_correcta === false) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {data.estructura_hs.h1_duplicado === true && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> H1 duplicado detectado
                </span>
              )}
              {data.estructura_hs.jerarquia_correcta === false && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Jerarquía con saltos
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ZONA 4: Principios GEO ── */}
      {data.principios_geo?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Principios GEO
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.principios_geo.map((p) => {
              const cfg = estadoGEOConfig(p.estado)
              return (
                <div key={p.numero} className="rounded-xl border border-gray-200 bg-white p-3.5 flex items-start gap-3">
                  {/* Número */}
                  <span className="shrink-0 h-6 w-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">
                    {p.numero}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{p.nombre}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </div>
                    {p.detalle && (
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{p.detalle}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── ZONA 5: Keywords secundarias ── */}
      {data.keywords_secundarias?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Keywords secundarias
          </p>
          <div className="flex flex-wrap gap-2">
            {data.keywords_secundarias.map((k) => {
              const cfg = estadoKeywordSecConfig(k.estado)
              return (
                <span key={k.keyword} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cfg.bg}`}>
                  {cfg.icon}
                  {k.keyword}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ── ZONA 5b: Enlaces internos check ── */}
      {data.enlaces_internos_check && data.enlaces_internos_check.total_requeridos > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Enlaces internos
          </p>
          <div className={`rounded-xl border p-3.5 ${
            data.enlaces_internos_check.insertados === data.enlaces_internos_check.total_requeridos
              ? 'border-emerald-200 bg-emerald-50'
              : data.enlaces_internos_check.insertados > 0
              ? 'border-amber-200 bg-amber-50'
              : 'border-red-200 bg-red-50'
          }`}>
            <p className={`text-sm font-semibold ${
              data.enlaces_internos_check.insertados === data.enlaces_internos_check.total_requeridos
                ? 'text-emerald-700'
                : data.enlaces_internos_check.insertados > 0
                ? 'text-amber-700'
                : 'text-red-700'
            }`}>
              {data.enlaces_internos_check.insertados}/{data.enlaces_internos_check.total_requeridos} enlaces insertados
            </p>
            {data.enlaces_internos_check.faltantes.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {data.enlaces_internos_check.faltantes.map((e, i) => (
                  <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    <span>
                      Falta enlazar: <strong>&ldquo;{e.anchor}&rdquo;</strong>
                      {e.url && <> → <span className="font-mono text-[10px] break-all">{e.url}</span></>}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ZONA 6: Mejoras prioritarias ── */}
      {data.mejoras_prioritarias?.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Mejoras prioritarias
            </p>
            {mejorasAplicadas.size > 0 && (
              <span className="text-xs font-medium text-emerald-600">
                {mejorasAplicadas.size} de {data.mejoras_prioritarias.length} aplicadas
              </span>
            )}
          </div>
          <div className="space-y-3">
            {data.mejoras_prioritarias.map((m, i) => {
              const cfg = prioridadConfig(m.prioridad)
              const aplicada = mejorasAplicadas.has(i)
              return (
                <div
                  key={i}
                  style={aplicada ? { borderLeft: '4px solid #4ade80', backgroundColor: 'rgb(240 253 244 / 0.4)' } : {}}
                  className={`rounded-xl border p-4 transition-all ${
                    aplicada ? 'border-green-200' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Badge className={`${cfg.bg} shrink-0 mt-0.5 ${aplicada ? 'opacity-60' : ''}`}>
                      {cfg.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{m.titulo}</p>
                      {m.que_hacer && (
                        <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">
                          <span className="font-medium text-gray-800">Qué hacer: </span>
                          {m.que_hacer}
                        </p>
                      )}
                      {m.donde && (
                        <p className="text-xs text-gray-500 mt-1">
                          <span className="font-medium">Dónde: </span>
                          {m.donde}
                        </p>
                      )}
                      {onAplicarMejora && (
                        <button
                          disabled={aplicada}
                          onClick={() => {
                            setMejorasAplicadas(prev => {
                              const next = new Set(prev)
                              next.add(i)
                              return next
                            })
                            onAplicarMejora?.(m)
                          }}
                          className={`mt-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold px-3 py-1.5 transition-colors ${
                            aplicada
                              ? 'bg-green-50 text-green-600 cursor-default opacity-75'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          {aplicada ? '✓ Aplicada' : 'Aplicar en copiloto →'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Footer: fecha y agente */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <span className="text-xs text-gray-400">{agente}</span>
        <span className="text-gray-200">·</span>
        <span className="text-xs text-gray-400">{fecha}</span>
      </div>
    </div>
  )
}
