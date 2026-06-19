'use client'

import { useState, useEffect, KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  AlertCircle,
  X,
  Check,
  Info,
  Search,
  Users,
  Target,
  Globe,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface ProyectoContext {
  proyecto: {
    id                   : string
    nombre               : string
    descripcion          : string
    tono_voz             : string
    keywords_objetivo    : string[]
    keywords_prohibidas  : string[]
    perfil_lector        : string
    tematicas_autorizadas: string[]
    tematicas_vetadas    : string[]
  }
  cliente: {
    nombre                : string
    identidad_corporativa : string
    restricciones_globales: string[]
  }
  brand_context: {
    tone_of_voice : string | null
    style_keywords: string[]
    restrictions  : string | null
  } | null
  competidores: string[]
  stats: {
    contenidos_publicados : number
    estrategias_anteriores: number
    keywords_trabajadas   : string[]
  }
}

// ─────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────

function TagsInput({
  tags,
  onChange,
  placeholder,
  maxTags,
  disabled,
}: {
  tags    : string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxTags?    : number
  disabled?   : boolean
}) {
  const [inputVal, setInputVal] = useState('')
  const canAdd = !maxTags || tags.length < maxTags

  function addTag(value: string) {
    const tag = value.trim()
    if (tag && !tags.includes(tag) && canAdd) {
      onChange([...tags, tag])
    }
    setInputVal('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(inputVal)
    } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div
      className={cn(
        'min-h-[42px] flex flex-wrap gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 max-w-[260px]"
        >
          <span className="truncate">{tag}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="shrink-0 text-indigo-400 hover:text-indigo-700"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {canAdd && !disabled && (
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (inputVal.trim()) addTag(inputVal) }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[160px] border-none bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
      )}
      {!canAdd && !disabled && (
        <span className="text-xs text-gray-400 self-center">Máximo {maxTags}</span>
      )}
    </div>
  )
}

// ─── Tarjeta de contexto del proyecto ────────────────────────

function ContextCard({ ctx }: { ctx: ProyectoContext }) {
  const [expanded, setExpanded] = useState(false)

  const restricciones = [
    ...ctx.cliente.restricciones_globales,
    ...ctx.proyecto.keywords_prohibidas.map((k) => `Kw. prohibida: "${k}"`),
  ]

  const hasDetails =
    ctx.proyecto.tono_voz ||
    ctx.proyecto.perfil_lector ||
    ctx.proyecto.keywords_objetivo.length > 0 ||
    restricciones.length > 0 ||
    ctx.stats.keywords_trabajadas.length > 0

  return (
    <Card className="border-indigo-200 bg-gradient-to-b from-indigo-50/60 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-semibold text-indigo-700">
          <span className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Contexto del proyecto
          </span>
          {hasDetails && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
            >
              {expanded ? <><ChevronUp className="h-3.5 w-3.5" />Menos</> : <><ChevronDown className="h-3.5 w-3.5" />Ver más</>}
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Stats siempre visibles */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-white border border-indigo-100 py-2">
            <p className="text-lg font-bold text-indigo-700">{ctx.stats.contenidos_publicados}</p>
            <p className="text-[11px] text-gray-500">publicados</p>
          </div>
          <div className="rounded-lg bg-white border border-indigo-100 py-2">
            <p className="text-lg font-bold text-indigo-700">{ctx.stats.estrategias_anteriores}</p>
            <p className="text-[11px] text-gray-500">estrategias</p>
          </div>
          <div className="rounded-lg bg-white border border-indigo-100 py-2">
            <p className="text-lg font-bold text-indigo-700">{ctx.stats.keywords_trabajadas.length}</p>
            <p className="text-[11px] text-gray-500">kw. trabajadas</p>
          </div>
        </div>

        {/* Detalles expandibles */}
        {expanded && (
          <div className="space-y-3 pt-1">

            {ctx.proyecto.tono_voz && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Tono de voz</p>
                <p className="text-sm text-gray-700 line-clamp-3">{ctx.proyecto.tono_voz}</p>
              </div>
            )}

            {ctx.proyecto.perfil_lector && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Audiencia</p>
                <p className="text-sm text-gray-700 line-clamp-3">{ctx.proyecto.perfil_lector}</p>
              </div>
            )}

            {ctx.proyecto.keywords_objetivo.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Keywords objetivo ({ctx.proyecto.keywords_objetivo.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ctx.proyecto.keywords_objetivo.slice(0, 12).map((kw) => (
                    <span key={kw} className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 font-medium">
                      {kw}
                    </span>
                  ))}
                  {ctx.proyecto.keywords_objetivo.length > 12 && (
                    <span className="text-xs text-gray-400 self-center">
                      +{ctx.proyecto.keywords_objetivo.length - 12} más
                    </span>
                  )}
                </div>
              </div>
            )}

            {restricciones.length > 0 && (
              <div className="flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700 space-y-0.5">
                  {restricciones.slice(0, 4).map((r, i) => <p key={i}>{r}</p>)}
                  {restricciones.length > 4 && <p>+{restricciones.length - 4} más</p>}
                </div>
              </div>
            )}

            {ctx.stats.keywords_trabajadas.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Keywords ya con contenido ({ctx.stats.keywords_trabajadas.length})
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {ctx.stats.keywords_trabajadas.map((kw) => (
                    <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 font-medium">
                      <Check className="h-2.5 w-2.5" />{kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </CardContent>
    </Card>
  )
}

// ─── Badge de auto-completado ─────────────────────────────────

function AutoBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-600 leading-none">
      <Sparkles className="h-2.5 w-2.5" />
      Auto-completado
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Estado y tipos del formulario
// ─────────────────────────────────────────────────────────────

type TipoProyecto = 'blog' | 'landing' | 'campana' | 'mixto' | ''

interface BriefingForm {
  clienteId    : string
  nombre       : string
  tipoProyecto : TipoProyecto
  objetivos    : string
  competidores : string[]
  seedTopics   : string
}

const FORM_VACIO: BriefingForm = {
  clienteId    : '',
  nombre       : '',
  tipoProyecto : '',
  objetivos    : '',
  competidores : [],
  seedTopics   : '',
}

const TIPOS_PROYECTO: { value: TipoProyecto; label: string }[] = [
  { value: 'blog',    label: 'Blog' },
  { value: 'landing', label: 'Landing Pages' },
  { value: 'campana', label: 'Campaña' },
  { value: 'mixto',   label: 'Mixto' },
]

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface Props {
  clientes              : { id: string; nombre: string }[]
  inspiracionSeeds?     : string[]
  inspiracionObjetivos? : string
  inspiracionCompetidores?: string[]
  inspiracionSessionId? : string | null
  inspiracionReciente?  : { id: string; created_at: string } | null
  clienteIdInicial?     : string | null
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export default function NuevaEstrategiaClient({
  clientes,
  inspiracionSeeds = [],
  inspiracionObjetivos = '',
  inspiracionCompetidores = [],
  inspiracionSessionId = null,
  inspiracionReciente = null,
  clienteIdInicial = null,
}: Props) {
  const router = useRouter()

  // ── Estado del wizard ──────────────────────────────────────
  const [paso, setPaso] = useState<1 | 2>(1)
  const [form, setForm] = useState<BriefingForm>({
    ...FORM_VACIO,
    clienteId  : clienteIdInicial ?? '',
    seedTopics : inspiracionSeeds.length > 0 ? inspiracionSeeds.join('\n') : '',
    objetivos  : inspiracionObjetivos,
    competidores: inspiracionCompetidores,
  })
  const preRellenado = inspiracionSessionId && (inspiracionSeeds.length > 0 || inspiracionObjetivos)

  // ── Estado proyectos ───────────────────────────────────────
  const [proyectos,    setProyectos]    = useState<{ id: string; nombre: string }[]>([])
  const [proyectoId,   setProyectoId]   = useState('')
  const [loadingProys, setLoadingProys] = useState(false)

  // ── Estado contexto del proyecto ───────────────────────────
  const [proyectoCtx,  setProyectoCtx]  = useState<ProyectoContext | null>(null)
  const [loadingCtx,   setLoadingCtx]   = useState(false)
  // Tracks which form fields were auto-filled from project context
  const [autoFilled,   setAutoFilled]   = useState<Set<string>>(new Set())

  // ── Estado sugerencias IA ──────────────────────────────────
  const [sugirendoSeeds, setSugirendoSeeds]     = useState(false)
  const [seedsSugeridos, setSeedsSugeridos]     = useState<string[]>([])
  const [seedsAceptados, setSeedsAceptados]     = useState<Set<string>>(new Set())
  const [seedsDescartados, setSeedsDescartados] = useState<Set<string>>(new Set())
  const [errorSugerencias, setErrorSugerencias] = useState<string | null>(null)

  // ── Estado lanzar research ─────────────────────────────────
  const [lanzando, setLanzando] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [progreso, setProgreso] = useState('')

  // ── Helpers ────────────────────────────────────────────────
  function set<K extends keyof BriefingForm>(campo: K, valor: BriefingForm[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  const seedsTextarea: string[] = form.seedTopics
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const seedsFinales: string[] = Array.from(
    new Set([...seedsTextarea, ...Array.from(seedsAceptados)]),
  )

  const clienteSeleccionado = clientes.find((c) => c.id === form.clienteId)
  const proyectoSeleccionado = proyectos.find((p) => p.id === proyectoId)

  // Derivado: si el cliente tiene proyectos disponibles
  const tieneProyectos = !loadingProys && proyectos.length > 0
  const proyectoOkay   = tieneProyectos ? proyectoId !== '' : form.nombre.trim() !== ''

  const puedeAvanzar =
    form.clienteId.trim() !== '' &&
    proyectoOkay &&
    seedsFinales.length > 0

  // ── Efecto: cargar proyectos cuando cambia el cliente ──────
  useEffect(() => {
    setProyectoId('')
    setProyectos([])
    setProyectoCtx(null)
    set('nombre', '')

    if (!form.clienteId) return

    setLoadingProys(true)
    fetch(`/api/pedidos/proyectos?cliente_id=${form.clienteId}`)
      .then((r) => r.json())
      .then((data) => setProyectos(data.proyectos ?? []))
      .catch(console.error)
      .finally(() => setLoadingProys(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.clienteId])

  // ── Efecto: cargar contexto y auto-rellenar cuando cambia el proyecto ──
  useEffect(() => {
    setProyectoCtx(null)
    setAutoFilled(new Set())

    if (!proyectoId) {
      set('nombre', '')
      // Restaurar inspiracion si la hay; si no, limpiar
      set('objetivos',   inspiracionObjetivos || '')
      set('competidores', inspiracionCompetidores.length ? inspiracionCompetidores : [])
      set('seedTopics',  inspiracionSeeds.length ? inspiracionSeeds.join('\n') : '')
      return
    }

    // Auto-fill nombre
    const proy = proyectos.find((p) => p.id === proyectoId)
    if (proy) set('nombre', proy.nombre)

    setLoadingCtx(true)
    fetch(`/api/strategy/project-context?proyecto_id=${proyectoId}`)
      .then((r) => r.json())
      .then((ctx: ProyectoContext) => {
        setProyectoCtx(ctx)

        const filled = new Set<string>()

        // Campo 1: Objetivos ← descripcion + keywords_objetivo
        const objParts: string[] = []
        if (ctx.proyecto.descripcion) objParts.push(ctx.proyecto.descripcion)
        if (ctx.proyecto.keywords_objetivo.length > 0) {
          objParts.push('Keywords objetivo: ' + ctx.proyecto.keywords_objetivo.join(', '))
        }
        if (objParts.length > 0) {
          set('objetivos', objParts.join('\n\n'))
          filled.add('objetivos')
        }

        // Campo 2: Competidores ← URLs editoriales del cliente
        if (ctx.competidores.length > 0) {
          set('competidores', ctx.competidores)
          filled.add('competidores')
        }

        // Campo 3: Seeds ← keywords_objetivo del proyecto
        if (ctx.proyecto.keywords_objetivo.length > 0) {
          set('seedTopics', ctx.proyecto.keywords_objetivo.join('\n'))
          filled.add('seedTopics')
        }

        setAutoFilled(filled)
      })
      .catch(console.error)
      .finally(() => setLoadingCtx(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId])

  // ── Acción: sugerir seeds ──────────────────────────────────
  async function handleSugerirSeeds() {
    setSugirendoSeeds(true)
    setErrorSugerencias(null)
    setSeedsSugeridos([])

    try {
      const res = await fetch('/api/strategy/suggest-seeds', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          cliente       : clienteSeleccionado?.nombre ?? '',
          objetivos     : form.objetivos,
          seeds_actuales: seedsTextarea,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorSugerencias(data.error ?? 'Error generando sugerencias')
        return
      }

      const nuevos = (data.seeds as string[]).filter(
        (s) => !seedsTextarea.includes(s),
      )
      setSeedsSugeridos(nuevos)
      setSeedsAceptados(new Set())
      setSeedsDescartados(new Set())
    } catch (e) {
      setErrorSugerencias(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setSugirendoSeeds(false)
    }
  }

  // ── Acción: aceptar/descartar chip ────────────────────────
  function toggleChip(seed: string, aceptar: boolean) {
    setSeedsAceptados((prev) => {
      const next = new Set(prev)
      if (aceptar) next.add(seed)
      else next.delete(seed)
      return next
    })
    setSeedsDescartados((prev) => {
      const next = new Set(prev)
      if (!aceptar) next.add(seed)
      else next.delete(seed)
      return next
    })
  }

  // ── Acción: lanzar research ────────────────────────────────
  async function handleLanzarResearch() {
    setLanzando(true)
    setError(null)
    setProgreso('Iniciando investigación...')

    try {
      setProgreso('Consultando DataForSEO — keyword ideas...')
      const res = await fetch('/api/strategy/research', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          nombre       : form.nombre.trim(),
          cliente_id   : form.clienteId,
          proyecto_id  : proyectoId || null,
          tipo_proyecto: form.tipoProyecto,
          objetivos    : form.objetivos.trim(),
          competidores : form.competidores,
          seeds        : seedsFinales,
        }),
      })

      let data: { error?: string; session_id?: string; total_keywords?: number } = {}
      const rawText = await res.text()
      try {
        data = JSON.parse(rawText)
      } catch {
        console.error('[Research] Respuesta no-JSON del servidor:', rawText.substring(0, 500))
        throw new Error(
          res.status === 504
            ? 'La investigación tardó demasiado (timeout). Inténtalo de nuevo.'
            : `Error del servidor (${res.status}). Inténtalo de nuevo.`
        )
      }

      if (!res.ok) {
        throw new Error(data.error ?? 'Error en la investigación')
      }

      setProgreso(`✓ ${data.total_keywords} keywords encontradas. Redirigiendo...`)
      router.push(`/strategy/${data.session_id}/keywords`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      setLanzando(false)
      setProgreso('')
    }
  }

  // ── Render paso 1: Briefing ────────────────────────────────
  const renderPaso1 = () => {
    // Keywords ya trabajadas (para cruzar con seeds)
    const trabajadasSet = new Set(
      (proyectoCtx?.stats.keywords_trabajadas ?? []).map((k) => k.toLowerCase())
    )
    const seedsYaTrabajadas = seedsFinales.filter((s) => trabajadasSet.has(s.toLowerCase()))

    return (
      <div className="space-y-5">

        {/* Sección 1: Identificación */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Users className="h-4 w-4 text-indigo-500" />
              1 · Identificación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">

              {/* Cliente */}
              <div className="space-y-1.5">
                <Label htmlFor="es-cliente">
                  Cliente <span className="text-red-500">*</span>
                </Label>
                <select
                  id="es-cliente"
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.clienteId}
                  onChange={(e) => set('clienteId', e.target.value)}
                >
                  <option value="">Selecciona un cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Proyecto */}
              <div className="space-y-1.5">
                <Label htmlFor="es-proyecto">
                  Proyecto <span className="text-red-500">*</span>
                </Label>

                {/* Sin cliente seleccionado */}
                {!form.clienteId && (
                  <select
                    id="es-proyecto"
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm opacity-60 cursor-not-allowed"
                    disabled
                  >
                    <option>Primero selecciona un cliente</option>
                  </select>
                )}

                {/* Cargando proyectos */}
                {form.clienteId && loadingProys && (
                  <div className="flex h-10 items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />Cargando proyectos…
                  </div>
                )}

                {/* Sin proyectos → nombre libre */}
                {form.clienteId && !loadingProys && proyectos.length === 0 && (
                  <div className="space-y-1.5">
                    <Input
                      id="es-nombre"
                      placeholder="Ej: Estrategia SEO Q3 2025"
                      value={form.nombre}
                      onChange={(e) => set('nombre', e.target.value)}
                    />
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Sin proyectos activos. Escribe un nombre libre para esta sesión.
                    </p>
                  </div>
                )}

                {/* Con proyectos → selector */}
                {form.clienteId && !loadingProys && proyectos.length > 0 && (
                  <select
                    id="es-proyecto"
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={proyectoId}
                    onChange={(e) => setProyectoId(e.target.value)}
                  >
                    <option value="">Selecciona un proyecto</option>
                    {proyectos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Tipo de proyecto */}
            <div className="space-y-1.5">
              <Label>Tipo de proyecto</Label>
              <div className="flex flex-wrap gap-2">
                {TIPOS_PROYECTO.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('tipoProyecto', form.tipoProyecto === value ? '' : value)}
                    className={cn(
                      'rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors',
                      form.tipoProyecto === value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contexto del proyecto (solo cuando hay proyecto seleccionado) */}
        {loadingCtx && (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-1 px-1">
            <Loader2 className="h-4 w-4 animate-spin" />Cargando contexto del proyecto…
          </div>
        )}
        {proyectoCtx && <ContextCard ctx={proyectoCtx} />}

        {/* Sección 2: Objetivos y contexto */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Target className="h-4 w-4 text-indigo-500" />
              2 · Objetivos y contexto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="es-obj">Objetivos de contenido</Label>
                {autoFilled.has('objetivos') && <AutoBadge />}
              </div>
              <Textarea
                id="es-obj"
                rows={3}
                placeholder="Ej: Posicionar como referente en preparación de oposiciones para el Estado. Atraer candidatos en fase de decisión (transaccional) y en fase de información (informacional)."
                value={form.objetivos}
                className={autoFilled.has('objetivos') ? 'bg-indigo-50/50 border-indigo-200' : ''}
                onChange={(e) => {
                  set('objetivos', e.target.value)
                  setAutoFilled((prev) => { const next = new Set(prev); next.delete('objetivos'); return next })
                }}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label>Competidores <span className="text-xs text-gray-400 font-normal">(hasta 5 URLs)</span></Label>
                {autoFilled.has('competidores') && <AutoBadge />}
              </div>
              <TagsInput
                tags={form.competidores}
                onChange={(t) => {
                  set('competidores', t)
                  setAutoFilled((prev) => { const next = new Set(prev); next.delete('competidores'); return next })
                }}
                placeholder="https://competidor.es — pulsa Enter para añadir"
                maxTags={5}
              />
              <p className="text-xs text-gray-400">
                Escribe la URL y pulsa{' '}
                <kbd className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px]">Enter</kbd>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sección 3: Keywords semilla */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Search className="h-4 w-4 text-indigo-500" />
              3 · Keywords semilla <span className="text-red-500">*</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="es-seeds">Una keyword por línea</Label>
                {autoFilled.has('seedTopics') && <AutoBadge />}
              </div>
              <Textarea
                id="es-seeds"
                rows={8}
                placeholder={`academia oposiciones\npreparar oposiciones estado\noposiciones administración pública\ntemario oposiciones auxiliar administrativo\ncurso online oposiciones`}
                value={form.seedTopics}
                className={cn('font-mono text-sm', autoFilled.has('seedTopics') && 'bg-indigo-50/50 border-indigo-200')}
                onChange={(e) => {
                  set('seedTopics', e.target.value)
                  setAutoFilled((prev) => { const next = new Set(prev); next.delete('seedTopics'); return next })
                }}
              />
              {autoFilled.has('seedTopics') ? (
                <p className="text-xs text-indigo-600 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Keywords pre-cargadas desde el contexto del proyecto. Puedes añadir más o eliminar las que no procedan.
                </p>
              ) : (
                <p className="text-xs text-gray-400">
                  {seedsTextarea.length > 0
                    ? `${seedsTextarea.length} keyword${seedsTextarea.length !== 1 ? 's' : ''} introducida${seedsTextarea.length !== 1 ? 's' : ''}`
                    : 'Pega o escribe tus keywords semilla, una por línea'}
                </p>
              )}
            </div>

            {/* Aviso seeds ya trabajadas */}
            {seedsYaTrabajadas.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  <span className="font-medium">{seedsYaTrabajadas.length} seed{seedsYaTrabajadas.length !== 1 ? 's' : ''} ya tiene contenido</span>
                  {' '}en este proyecto: {seedsYaTrabajadas.slice(0, 5).join(', ')}
                  {seedsYaTrabajadas.length > 5 ? '…' : '.'}
                  {' '}Se incluirán igual para detectar nuevas oportunidades.
                </p>
              </div>
            )}

            {/* Botón sugerir con IA */}
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSugerirSeeds}
                disabled={sugirendoSeeds || (!form.clienteId && !form.objetivos && seedsTextarea.length === 0)}
                className="gap-2 text-indigo-700 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-400"
              >
                {sugirendoSeeds ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Generando sugerencias...</>
                ) : (
                  <><Sparkles className="h-4 w-4" />Sugerir seeds con IA</>
                )}
              </Button>
              {form.clienteId === '' && form.objetivos === '' && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Selecciona cliente u objetivos primero
                </p>
              )}
            </div>

            {/* Error sugerencias */}
            {errorSugerencias && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorSugerencias}
              </div>
            )}

            {/* Chips de sugerencias IA */}
            {seedsSugeridos.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-indigo-400" />
                  Sugerencias de IA — acepta las que quieras incluir
                </p>
                <div className="flex flex-wrap gap-2">
                  {seedsSugeridos
                    .filter((s) => !seedsDescartados.has(s))
                    .map((seed) => {
                      const aceptado = seedsAceptados.has(seed)
                      const yaTrabajada = trabajadasSet.has(seed.toLowerCase())
                      return (
                        <div key={seed} className="flex items-center gap-0.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                              aceptado
                                ? 'bg-green-100 text-green-700 border-green-300'
                                : yaTrabajada
                                  ? 'bg-gray-100 text-gray-400 border-gray-200'
                                  : 'bg-gray-50 text-gray-600 border-gray-200',
                            )}
                          >
                            {aceptado && <Check className="h-3 w-3" />}
                            {yaTrabajada && !aceptado && <Check className="h-3 w-3 text-green-500" />}
                            {seed}
                            {yaTrabajada && !aceptado && (
                              <span className="text-[10px] text-green-600 font-normal">ya existe</span>
                            )}
                          </span>
                          {!aceptado && (
                            <button
                              type="button"
                              onClick={() => toggleChip(seed, true)}
                              className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
                              title="Aceptar"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleChip(seed, false)}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors"
                            title="Descartar"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })}
                </div>
                {seedsAceptados.size > 0 && (
                  <p className="text-xs text-green-600 font-medium">
                    {seedsAceptados.size} sugerencia{seedsAceptados.size !== 1 ? 's' : ''} aceptada{seedsAceptados.size !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {/* Total seeds */}
            {seedsFinales.length > 0 && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                <p className="text-xs font-medium text-indigo-700">
                  Total: <span className="text-sm font-bold">{seedsFinales.length}</span> keywords semilla listas para el research
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Botón siguiente */}
        <div className="flex justify-between items-center gap-3 pb-6">
          <Button variant="outline" asChild>
            <Link href="/strategy">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Cancelar
            </Link>
          </Button>
          <Button
            type="button"
            onClick={() => setPaso(2)}
            disabled={!puedeAvanzar}
            className="gap-2"
          >
            Revisar y lanzar
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ── Render paso 2: Resumen + Lanzar ───────────────────────
  const renderPaso2 = () => (
    <div className="space-y-5">

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Info className="h-4 w-4 text-indigo-500" />
            Resumen del briefing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cliente</dt>
              <dd className="mt-0.5 font-medium text-gray-900">{clienteSeleccionado?.nombre ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Proyecto</dt>
              <dd className="mt-0.5 font-medium text-gray-900">{proyectoSeleccionado?.nombre ?? (form.nombre || '—')}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tipo</dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {TIPOS_PROYECTO.find((t) => t.value === form.tipoProyecto)?.label ?? 'No especificado'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Seeds totales</dt>
              <dd className="mt-0.5 font-bold text-indigo-700 text-base">{seedsFinales.length}</dd>
            </div>
          </dl>

          {form.objetivos && (
            <div>
              <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Objetivos</dt>
              <dd className="mt-1 text-sm text-gray-700 leading-relaxed">{form.objetivos}</dd>
            </div>
          )}

          {form.competidores.length > 0 && (
            <div>
              <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Globe className="h-3 w-3" /> Competidores
              </dt>
              <dd className="flex flex-wrap gap-1.5">
                {form.competidores.map((c) => (
                  <span key={c} className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600 font-medium">
                    {c}
                  </span>
                ))}
              </dd>
            </div>
          )}

          {proyectoCtx && (
            <div className="flex items-center gap-4 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-700">
              <span>{proyectoCtx.stats.contenidos_publicados} contenidos publicados</span>
              <span className="text-indigo-300">·</span>
              <span>{proyectoCtx.stats.keywords_trabajadas.length} keywords ya trabajadas</span>
            </div>
          )}

          <div>
            <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Keywords semilla ({seedsFinales.length})
            </dt>
            <dd className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {seedsFinales.map((s) => (
                <span key={s} className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-700 font-medium border border-indigo-100">
                  {s}
                </span>
              ))}
            </dd>
          </div>
        </CardContent>
      </Card>

      <Card className="border-indigo-200 bg-indigo-50/40">
        <CardContent className="p-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-indigo-700">{seedsFinales.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">keywords semilla</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-indigo-700">~{Math.min(seedsFinales.length * 25, 1000).toLocaleString('es-ES')}</p>
              <p className="text-xs text-gray-500 mt-0.5">keywords estimadas</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-indigo-700">~30s</p>
              <p className="text-xs text-gray-500 mt-0.5">tiempo estimado</p>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-gray-500">
            El research consulta DataForSEO para España (location 2724, idioma español).
          </p>
        </CardContent>
      </Card>

      {lanzando && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6 text-center space-y-3">
          <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm font-medium text-indigo-800">{progreso || 'Procesando...'}</p>
          <p className="text-xs text-indigo-600">
            Esto puede tardar hasta 60 segundos. No cierres esta página.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error en la investigación</p>
            <p className="mt-0.5 text-red-500">{error}</p>
          </div>
        </div>
      )}

      <div className="flex justify-between gap-3 pb-6">
        <Button
          variant="outline"
          onClick={() => { setPaso(1); setError(null); setProgreso('') }}
          disabled={lanzando}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver al briefing
        </Button>
        <Button
          onClick={handleLanzarResearch}
          disabled={lanzando}
          className="gap-2 min-w-[200px] bg-indigo-600 hover:bg-indigo-700"
        >
          {lanzando ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Investigando...</>
          ) : (
            <><Search className="h-4 w-4" />Iniciar investigación</>
          )}
        </Button>
      </div>
    </div>
  )

  // ── Render principal ───────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl">

      <div className="mb-6">
        <Link
          href="/strategy"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a Estrategia
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100">
          <Search className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nueva Estrategia de Contenidos</h1>
          <p className="text-sm text-gray-500">Briefing + investigación de keywords con DataForSEO</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-6 flex items-center gap-3">
        {[
          { num: 1, label: 'Briefing' },
          { num: 2, label: 'Lanzar Research' },
        ].map(({ num, label }, idx) => (
          <div key={num} className="flex items-center gap-2">
            {idx > 0 && <div className="h-px w-8 bg-gray-200" />}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  paso === num
                    ? 'bg-indigo-600 text-white'
                    : paso > num
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500',
                )}
              >
                {paso > num ? <Check className="h-3.5 w-3.5" /> : num}
              </div>
              <span
                className={cn(
                  'text-sm font-medium',
                  paso === num ? 'text-gray-900' : 'text-gray-400',
                )}
              >
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Banner pre-rellenado desde inspiracion */}
      {paso === 1 && preRellenado && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 mb-5">
          <Check className="h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">Briefing pre-rellenado desde el Agente de Inspiración.</span>
            <span className="text-emerald-600 ml-1">Revisa y ajusta antes de lanzar el research.</span>
          </div>
        </div>
      )}

      {paso === 1 ? renderPaso1() : renderPaso2()}
    </div>
  )
}
