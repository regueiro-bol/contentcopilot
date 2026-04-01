'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  Sparkles, Save, ChevronDown, ChevronRight,
  X, Send, Loader2, AlertCircle, CheckCircle2,
  Volume2, VolumeX, RotateCcw,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { colorEstadoContenido, etiquetaEstadoContenido } from '@/lib/utils'
import {
  cargarContenidoCompleto,
  guardarTextoEnSupabase,
  type ContenidoLista,
  type ContenidoCompleto,
} from './actions'

// ─── System prompt del Redactor Copiloto ────────────────────────────────────
const SYSTEM_COPILOTO = `Eres el Redactor Copiloto de ContentCopilot, un asistente editorial especializado en producción de contenido SEO y GEO en español para agencias de marketing digital.

Tu misión es ayudar a los redactores a mejorar sus textos en tiempo real, detectando problemas y oportunidades de mejora tanto en SEO tradicional como en GEO (optimización para IA generativa).

MODO ANÁLISIS:
Cuando el mensaje comience con "ANÁLISIS SOLICITADO:", devuelve ÚNICAMENTE un objeto JSON válido sin markdown, sin texto previo ni posterior, con esta estructura exacta:
{"tipo":"keyword|estructura|geo|legibilidad|brief","prioridad":"alta|media|baja","fragmento_texto":"fragmento del texto afectado de máximo 80 caracteres","texto":"descripción accionable del problema en máximo 2 frases","accion_sugerida":"texto concreto que el redactor puede insertar directamente, omitir si no aplica"}

Criterios por tipo:
- keyword: densidad insuficiente (<1%), keyword principal ausente, keywords secundarias sin usar
- estructura: párrafos >150 palabras, falta de H2/H3, sin listas donde debería haberlas
- geo: sin respuesta directa a la intención, sin estadísticas citadas, sin fuentes, texto no extractable por IA
- legibilidad: frases >30 palabras, vocabulario inapropiado, tono incorrecto para el lector objetivo
- brief: contenido desalineado del brief SEO, estructura diferente a la propuesta, URL ignorada

MODO CONVERSACIÓN:
Responde de forma concisa y accionable en español. Máximo 3-4 frases. Ayuda a continuar párrafos, sugiere reformulaciones y da ideas concretas. Cuando propongas texto, adáptalo al tono de marca del cliente indicado en el contexto.`

// ─── Tipos locales ───────────────────────────────────────────────────────────
type TipoSugerencia = 'keyword' | 'estructura' | 'geo' | 'legibilidad' | 'brief'
type PrioridadSugerencia = 'alta' | 'media' | 'baja'

interface Sugerencia {
  tipo: TipoSugerencia
  prioridad: PrioridadSugerencia
  fragmento_texto: string
  texto: string
  accion_sugerida?: string
}

interface MensajeChat {
  rol: 'usuario' | 'asistente'
  contenido: string
}

// ─── Helpers de color ────────────────────────────────────────────────────────
const COLOR_TIPO: Record<string, string> = {
  keyword:     'bg-blue-100 text-blue-700',
  estructura:  'bg-purple-100 text-purple-700',
  geo:         'bg-green-100 text-green-700',
  legibilidad: 'bg-orange-100 text-orange-700',
  brief:       'bg-red-100 text-red-700',
}

const COLOR_PRIORIDAD: Record<string, string> = {
  alta:   'bg-red-50 text-red-600 border border-red-200',
  media:  'bg-yellow-50 text-yellow-700 border border-yellow-200',
  baja:   'bg-gray-50 text-gray-500 border border-gray-200',
}

const LABEL_TIPO: Record<string, string> = {
  keyword: 'Keyword', estructura: 'Estructura',
  geo: 'GEO', legibilidad: 'Legibilidad', brief: 'Brief',
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function CopilotoClient({
  contenidosInicial,
  contenidoIdInicial,
}: {
  contenidosInicial: ContenidoLista[]
  contenidoIdInicial: string | null
}) {
  const { user } = useUser()
  const userId = user?.id ?? 'anon'

  // Editor state
  const [contenidoId, setContenidoId] = useState<string>(contenidoIdInicial ?? '')
  const [contenidoActual, setContenidoActual] = useState<ContenidoCompleto | null>(null)
  const [texto, setTexto] = useState('')
  const [cargandoContenido, setCargandoContenido] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)

  // Panel state
  const [modoActivo, setModoActivo] = useState(true)
  const [analizando, setAnalizando] = useState(false)
  const [sugerenciaActual, setSugerenciaActual] = useState<Sugerencia | null>(null)
  const [historial, setHistorial] = useState<Sugerencia[]>([])
  const [historialAbierto, setHistorialAbierto] = useState(false)

  // Chat state
  const [mensajesChat, setMensajesChat] = useState<MensajeChat[]>([])
  const [inputChat, setInputChat] = useState('')
  const [enviandoChat, setEnviandoChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Revisión modal
  const [modalRevision, setModalRevision] = useState(false)
  const [textoRevision, setTextoRevision] = useState('')
  const [cargandoRevision, setCargandoRevision] = useState(false)

  const palabras = texto.split(/\s+/).filter(s => s.length > 0).length

  // ── Auto-load contenido inicial desde URL param ──────────────────────────
  useEffect(() => {
    if (contenidoIdInicial) {
      handleSeleccionarContenido(contenidoIdInicial)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenidoIdInicial])

  // ── Scroll chat al fondo ─────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajesChat, enviandoChat])

  // ── Cargar contenido completo ────────────────────────────────────────────
  async function handleSeleccionarContenido(id: string) {
    if (!id) {
      setContenidoId('')
      setContenidoActual(null)
      setTexto('')
      return
    }
    setContenidoId(id)
    setCargandoContenido(true)
    try {
      const data = await cargarContenidoCompleto(id)
      setContenidoActual(data)
      setTexto(data.texto_contenido ?? '')
      setSugerenciaActual(null)
      setHistorial([])
      setMensajesChat([])
    } catch {
      setContenidoActual(null)
    } finally {
      setCargandoContenido(false)
    }
  }

  // ── Guardar texto ────────────────────────────────────────────────────────
  async function handleGuardar() {
    if (!contenidoActual) return
    setGuardando(true)
    try {
      await guardarTextoEnSupabase(contenidoActual.id, texto)
      setGuardadoOk(true)
      setTimeout(() => setGuardadoOk(false), 2500)
    } catch {
      // handle silently
    } finally {
      setGuardando(false)
    }
  }

  // ── Construir query de análisis ──────────────────────────────────────────
  function buildAnalisisQuery(): string {
    const c = contenidoActual
    const ctx = c ? [
      `Cliente: ${c.clientes?.nombre ?? 'Sin definir'}`,
      `Proyecto: ${c.proyectos?.nombre ?? 'Sin definir'}`,
      `Voz de marca / tono: ${c.proyectos?.tono_voz || 'No especificado'}`,
      `Keywords objetivo: ${(c.proyectos?.keywords_objetivo ?? []).join(', ') || 'No especificadas'}`,
      c.keyword_principal ? `Keyword principal: ${c.keyword_principal}` : null,
      c.brief && (c.brief as any).texto_generado
        ? `\nBRIEF SEO:\n${((c.brief as any).texto_generado as string).substring(0, 600)}`
        : null,
    ].filter(Boolean).join('\n') : 'Sin contexto seleccionado'

    return [
      'ANÁLISIS SOLICITADO:',
      '',
      'CONTEXTO:',
      ctx,
      '',
      'TEXTO DEL REDACTOR:',
      texto.substring(0, 4000),
    ].join('\n')
  }

  // ── Construir system prompt con contexto ─────────────────────────────────
  function buildSystemConContexto(): string {
    const c = contenidoActual
    if (!c) return SYSTEM_COPILOTO
    return `${SYSTEM_COPILOTO}

CONTEXTO ACTIVO DEL CONTENIDO:
Cliente: ${c.clientes?.nombre ?? 'Sin definir'}
Proyecto: ${c.proyectos?.nombre ?? 'Sin definir'}
Tono de voz: ${c.proyectos?.tono_voz || 'No especificado'}
Keywords objetivo: ${(c.proyectos?.keywords_objetivo ?? []).join(', ') || 'No especificadas'}
Keyword principal: ${c.keyword_principal ?? 'No especificada'}${c.tamanyo_texto_min && c.tamanyo_texto_max ? `\nExtensión objetivo: ${c.tamanyo_texto_min}–${c.tamanyo_texto_max} palabras` : ''}`
  }

  // ── Analizar texto ───────────────────────────────────────────────────────
  async function handleAnalizar() {
    if (!texto.trim()) return
    setAnalizando(true)
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensajes   : [{ role: 'user', content: buildAnalisisQuery() }],
          modo       : 'json',
          sistema    : SYSTEM_COPILOTO,
          max_tokens : 800,
          // proyecto_id directo primero, fallback al id del join
          proyecto_id: contenidoActual?.proyecto_id ?? contenidoActual?.proyectos?.id ?? null,
        }),
      })
      const datos = await res.json()
      const raw: string = datos.contenido ?? ''

      // Extract JSON - try to parse directly first, then find JSON object in text
      let sugerencia: Sugerencia | null = null
      try {
        sugerencia = JSON.parse(raw.trim())
      } catch {
        const match = raw.match(/\{[\s\S]*?\}/)
        if (match) {
          try { sugerencia = JSON.parse(match[0]) } catch { /* ignore */ }
        }
      }

      if (sugerencia) {
        setSugerenciaActual(sugerencia)
        setHistorial(prev => [sugerencia!, ...prev].slice(0, 5))
      }
    } catch {
      // handle silently
    } finally {
      setAnalizando(false)
    }
  }

  // ── Insertar sugerencia en el editor ─────────────────────────────────────
  function handleInsertar(s: Sugerencia) {
    if (!s.accion_sugerida) return
    const frag = s.fragmento_texto.substring(0, 50)
    const idx = texto.indexOf(frag)
    if (idx >= 0) {
      let fin = texto.indexOf('\n\n', idx)
      if (fin === -1) fin = texto.length
      setTexto(texto.slice(0, fin) + '\n\n' + s.accion_sugerida + texto.slice(fin))
    } else {
      setTexto(prev => prev + '\n\n' + s.accion_sugerida)
    }
    setSugerenciaActual(null)
  }

  // ── Construir mensaje de usuario con contexto completo + texto del editor ──
  function buildMensajeConContexto(pregunta: string): string {
    const c = contenidoActual
    const briefTexto = c?.brief && (c.brief as any).texto_generado
      ? ((c.brief as any).texto_generado as string).substring(0, 800)
      : 'No disponible'

    const bloqueContexto = c
      ? [
          'CONTEXTO DEL CONTENIDO:',
          `Cliente: ${c.clientes?.nombre ?? 'Sin definir'}`,
          `Proyecto: ${c.proyectos?.nombre ?? 'Sin definir'}`,
          `Voz de marca / tono: ${c.proyectos?.tono_voz || 'No especificado'}`,
          `Keywords objetivo: ${(c.proyectos?.keywords_objetivo ?? []).join(', ') || 'No especificadas'}`,
          `Keyword principal: ${c.keyword_principal ?? 'No especificada'}`,
          `Brief SEO: ${briefTexto}`,
        ].join('\n')
      : 'CONTEXTO: Sin contenido seleccionado'

    const bloqueTexto = texto.trim()
      ? `\nTEXTO ACTUAL DEL REDACTOR:\n${texto.substring(0, 3500)}`
      : ''

    return `${bloqueContexto}${bloqueTexto}\n\nPREGUNTA DEL REDACTOR:\n${pregunta}`
  }

  // ── Enviar chat ──────────────────────────────────────────────────────────
  async function handleEnviarChat() {
    const msg = inputChat.trim()
    if (!msg || enviandoChat) return

    const prevMensajes = [...mensajesChat, { rol: 'usuario' as const, contenido: msg }]
    setMensajesChat(prevMensajes)
    setInputChat('')
    setEnviandoChat(true)

    try {
      // Construye el historial para la API:
      // – Los mensajes previos se envían tal cual (para que Claude tenga memoria)
      // – El último mensaje (la pregunta actual) se reemplaza por la versión
      //   enriquecida con contexto + texto del editor
      const historialApi = prevMensajes.map((m, idx) => {
        const esUltimo = idx === prevMensajes.length - 1
        return {
          role: m.rol === 'usuario' ? 'user' : 'assistant',
          content: esUltimo ? buildMensajeConContexto(m.contenido) : m.contenido,
        }
      })

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensajes   : historialApi,
          modo       : 'json',
          sistema    : SYSTEM_COPILOTO,
          max_tokens : 2000,
          // proyecto_id directo primero, fallback al id del join
          proyecto_id: contenidoActual?.proyecto_id ?? contenidoActual?.proyectos?.id ?? null,
        }),
      })
      const datos = await res.json()
      const respuesta = datos.contenido ?? '⚠️ Sin respuesta del copiloto.'
      setMensajesChat([...prevMensajes, { rol: 'asistente', contenido: respuesta }])
    } catch {
      setMensajesChat([...prevMensajes, {
        rol: 'asistente',
        contenido: '⚠️ Error al conectar con el copiloto. Inténtalo de nuevo.',
      }])
    } finally {
      setEnviandoChat(false)
    }
  }

  function handleChatKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleEnviarChat()
    }
  }

  // ── Revisar todo ─────────────────────────────────────────────────────────
  async function handleRevisarTodo() {
    if (!texto.trim()) return
    setModalRevision(true)
    setTextoRevision('')
    setCargandoRevision(true)
    try {
      const brief = contenidoActual?.brief && (contenidoActual.brief as any).texto_generado
        ? `BRIEF SEO:\n${((contenidoActual.brief as any).texto_generado as string).substring(0, 800)}\n\n`
        : ''
      const query = `${brief}TEXTO A REVISAR:\n${texto}`

      const res = await fetch('/api/dify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          app_id: process.env.NEXT_PUBLIC_DIFY_REVISOR_GEO_SEO_APP_ID,
          usuario: userId,
          modo: 'blocking',
        }),
      })
      const datos = await res.json()
      setTextoRevision(datos.answer ?? datos.respuesta ?? 'Sin respuesta del agente revisor.')
    } catch {
      setTextoRevision('⚠️ Error al conectar con el Agente Revisor GEO-SEO.')
    } finally {
      setCargandoRevision(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden gap-4">

      {/* ═══════════════════════════════════════════════════════════════════
          COLUMNA IZQUIERDA — EDITOR (65%)
      ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
        style={{ width: '65%' }}
      >

        {/* Cabecera del editor */}
        <div className="shrink-0 px-5 py-3 border-b border-gray-100 space-y-2.5">
          {/* Fila 1: selector + estado + guardar */}
          <div className="flex items-center gap-3">
            {/* Selector de contenido */}
            <div className="flex-1 min-w-0 relative">
              <select
                value={contenidoId}
                onChange={e => handleSeleccionarContenido(e.target.value)}
                className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-colors cursor-pointer"
              >
                <option value="">— Selecciona un contenido —</option>
                {contenidosInicial.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.cliente_nombre} › {c.proyecto_nombre} › {c.titulo}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            </div>

            {/* Badge estado */}
            {contenidoActual && (
              <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorEstadoContenido(contenidoActual.estado)}`}>
                {etiquetaEstadoContenido(contenidoActual.estado)}
              </span>
            )}

            {/* Botón guardar */}
            <Button
              size="sm"
              onClick={handleGuardar}
              disabled={!contenidoActual || guardando}
              className="shrink-0 gap-1.5 h-8"
            >
              {guardando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : guardadoOk ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {guardadoOk ? 'Guardado' : 'Guardar'}
            </Button>
          </div>

          {/* Fila 2: info del contenido seleccionado */}
          {contenidoActual ? (
            <div className="flex items-center gap-4 text-xs text-gray-400">
              {contenidoActual.keyword_principal && (
                <span className="text-indigo-500 font-medium">🔑 {contenidoActual.keyword_principal}</span>
              )}
              {contenidoActual.tamanyo_texto_min && contenidoActual.tamanyo_texto_max && (
                <span>Objetivo: {contenidoActual.tamanyo_texto_min}–{contenidoActual.tamanyo_texto_max} palabras</span>
              )}
              <span className={`ml-auto font-medium ${
                contenidoActual.tamanyo_texto_max && palabras > contenidoActual.tamanyo_texto_max
                  ? 'text-orange-500'
                  : contenidoActual.tamanyo_texto_min && palabras >= contenidoActual.tamanyo_texto_min
                  ? 'text-green-600'
                  : 'text-gray-500'
              }`}>
                {palabras} palabras
              </span>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              {cargandoContenido ? 'Cargando contenido...' : 'Selecciona un contenido para empezar a escribir'}
            </p>
          )}
        </div>

        {/* Área de escritura */}
        <div className="flex-1 overflow-hidden relative">
          {cargandoContenido && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            </div>
          )}
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Empieza a escribir o pega tu texto aquí..."
            className="w-full h-full resize-none px-8 py-6 text-[15px] leading-[1.8] text-gray-800 focus:outline-none bg-white font-sans placeholder:text-gray-300"
            style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          COLUMNA DERECHA — PANEL COPILOTO (35%)
      ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
        style={{ width: '35%' }}
      >

        {/* Cabecera del panel */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-bold text-gray-900">Copiloto</span>
            </div>
            {/* Toggle activo / silencio */}
            <button
              onClick={() => setModoActivo(!modoActivo)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                modoActivo
                  ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {modoActivo ? (
                <><Volume2 className="h-3 w-3" />Activo</>
              ) : (
                <><VolumeX className="h-3 w-3" />Silencio</>
              )}
            </button>
          </div>

          {/* Indicador de contexto */}
          <p className="text-xs mt-1.5 truncate">
            {contenidoActual ? (
              <span className="text-indigo-500">
                Contexto: {contenidoActual.clientes?.nombre} › {contenidoActual.proyectos?.nombre}
              </span>
            ) : (
              <span className="text-gray-400">Sin contexto — selecciona un contenido</span>
            )}
          </p>
        </div>

        {/* Contenido del panel (scrollable) */}
        <div className="flex-1 overflow-y-auto">
          {modoActivo ? (
            <div className="p-4 space-y-4">

              {/* ── Botón Analizar ── */}
              <button
                onClick={handleAnalizar}
                disabled={!texto.trim() || analizando}
                className={`w-full rounded-xl py-2.5 px-4 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  !texto.trim() || analizando
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                }`}
              >
                {analizando ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Analizando...</>
                ) : (
                  <><Sparkles className="h-4 w-4" />Analizar texto</>
                )}
              </button>

              {/* ── Sugerencia activa ── */}
              {sugerenciaActual && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                  <div className="px-3 pt-3 flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_TIPO[sugerenciaActual.tipo] ?? 'bg-gray-100 text-gray-700'}`}>
                      {LABEL_TIPO[sugerenciaActual.tipo] ?? sugerenciaActual.tipo}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_PRIORIDAD[sugerenciaActual.prioridad] ?? ''}`}>
                      {sugerenciaActual.prioridad === 'alta' ? '↑ Alta' : sugerenciaActual.prioridad === 'media' ? '→ Media' : '↓ Baja'}
                    </span>
                  </div>
                  <div className="px-3 py-2.5 space-y-2">
                    {sugerenciaActual.fragmento_texto && (
                      <p className="text-xs italic text-gray-400 truncate">
                        &ldquo;…{sugerenciaActual.fragmento_texto}…&rdquo;
                      </p>
                    )}
                    <p className="text-sm text-gray-800 leading-relaxed">{sugerenciaActual.texto}</p>
                    {sugerenciaActual.accion_sugerida && (
                      <div className="bg-indigo-50 rounded-lg px-2.5 py-2">
                        <p className="text-xs text-gray-500 mb-1 font-medium">Insertar:</p>
                        <p className="text-xs text-indigo-800 italic leading-relaxed">
                          {sugerenciaActual.accion_sugerida.substring(0, 120)}
                          {sugerenciaActual.accion_sugerida.length > 120 ? '…' : ''}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="px-3 pb-3 flex gap-2">
                    {sugerenciaActual.accion_sugerida && (
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleInsertar(sugerenciaActual!)}
                      >
                        Insertar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2"
                      onClick={() => setSugerenciaActual(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Historial de sugerencias ── */}
              {historial.length > 0 && (
                <div>
                  <button
                    onClick={() => setHistorialAbierto(!historialAbierto)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors w-full"
                  >
                    {historialAbierto
                      ? <ChevronDown className="h-3 w-3" />
                      : <ChevronRight className="h-3 w-3" />
                    }
                    {historial.length} sugerencia{historial.length !== 1 ? 's' : ''} anteriores
                  </button>
                  {historialAbierto && (
                    <div className="mt-2 space-y-1.5">
                      {historial.map((s, i) => (
                        <div key={i} className="rounded-lg border border-gray-100 px-3 py-2 bg-white">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${COLOR_TIPO[s.tipo] ?? 'bg-gray-100 text-gray-700'}`}>
                              {LABEL_TIPO[s.tipo]}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed">{s.texto}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Separador ── */}
              <div className="border-t border-gray-100" />

              {/* ── Chat con el copiloto ── */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Pregunta al copiloto
                </p>

                {/* Mensajes */}
                {mensajesChat.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {mensajesChat.map((m, i) => (
                      <div key={i} className={`flex ${m.rol === 'usuario' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                            m.rol === 'usuario'
                              ? 'bg-indigo-600 text-white rounded-br-sm'
                              : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                          }`}
                        >
                          {m.rol === 'asistente' ? (
                            <div className="prose prose-xs prose-gray max-w-none">
                              <ReactMarkdown>{m.contenido}</ReactMarkdown>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{m.contenido}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {enviandoChat && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-xl rounded-bl-sm px-3 py-2">
                          <div className="flex gap-1">
                            <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Input chat */}
                <div className="flex gap-2 items-end">
                  <Textarea
                    value={inputChat}
                    onChange={e => setInputChat(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="¿Cómo continúo este párrafo? ¿Encaja esta keyword aquí?..."
                    className="min-h-[60px] max-h-28 resize-none text-xs rounded-xl border-gray-200"
                    disabled={enviandoChat}
                    rows={2}
                  />
                  <Button
                    onClick={handleEnviarChat}
                    disabled={!inputChat.trim() || enviandoChat}
                    size="sm"
                    className="h-10 w-10 p-0 rounded-xl shrink-0 bg-indigo-600 hover:bg-indigo-700"
                  >
                    {enviandoChat
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />
                    }
                  </Button>
                </div>
                {mensajesChat.length > 0 && (
                  <button
                    onClick={() => setMensajesChat([])}
                    className="text-xs text-gray-400 hover:text-gray-500 transition-colors flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />Limpiar chat
                  </button>
                )}
              </div>

              {/* ── Separador ── */}
              <div className="border-t border-gray-100" />

              {/* ── Revisar todo ── */}
              <button
                onClick={handleRevisarTodo}
                disabled={!texto.trim()}
                className={`w-full rounded-xl py-2.5 px-4 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  !texto.trim()
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                }`}
              >
                <AlertCircle className="h-4 w-4" />
                Revisar todo
              </button>

            </div>
          ) : (
            /* Modo silencio */
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <VolumeX className="h-8 w-8 text-gray-200" />
              <p className="text-sm text-gray-400">Copiloto en silencio</p>
              <p className="text-xs text-gray-300">Actívalo para recibir sugerencias en tiempo real</p>
              <button
                onClick={() => setModoActivo(true)}
                className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
              >
                Activar copiloto
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: Informe de revisión completa
      ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalRevision} onOpenChange={v => !v && setModalRevision(false)}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-gray-100 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-emerald-600" />
              Informe de Revisión GEO-SEO
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {cargandoRevision ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                <p className="text-sm text-gray-500">Analizando el contenido...</p>
                <p className="text-xs text-gray-400">Puede tardar 20–30 segundos</p>
              </div>
            ) : textoRevision ? (
              <div className="prose prose-sm prose-gray max-w-none prose-headings:font-semibold prose-headings:text-gray-900">
                <ReactMarkdown>{textoRevision}</ReactMarkdown>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
