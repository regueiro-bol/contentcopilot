'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  Sparkles, Save, ChevronDown,
  X, Send, Loader2, AlertCircle, CheckCircle2,
  Volume2, VolumeX, RotateCcw, Eye, EyeOff,
  PlusCircle, FileSearch, CheckCheck, Edit2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { colorEstadoContenido, etiquetaEstadoContenido } from '@/lib/utils'
import InformeRevisionDashboard from '@/components/revisiones/InformeRevisionDashboard'
import {
  cargarContenidoCompleto,
  guardarTextoEnSupabase,
  type ContenidoLista,
  type ContenidoCompleto,
} from './actions'

// ─── System prompt del Redactor Copiloto ────────────────────────────────────
// FIX 5: instrucción explícita para responder con texto directo cuando se pide
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
Responde de forma concisa y accionable en español. Ayuda a continuar párrafos, sugiere reformulaciones y da ideas concretas. Cuando propongas texto, adáptalo al tono de marca del cliente indicado en el contexto.

REGLA CRÍTICA — cuando te piden redactar:
Cuando el redactor te pide que escribas, redactes o generes texto, responde DIRECTAMENTE con el texto solicitado sin explicaciones previas. El texto debe estar listo para insertar en el artículo. No digas "aquí tienes" ni "te propongo" — ve directo al texto. Solo añade una nota breve al FINAL si es necesaria.

IMPORTANTE — formato de respuesta:
Cuando generes texto para insertar en el artículo, incluye SOLO el texto redactado.
NUNCA añadas después del texto:
- Listas de características con ✅
- Explicaciones de por qué es bueno el texto
- Notas sobre longitud, tono o estructura
- Bloques separados con ---
- Frases como "Al añadirlo conseguirás..." o "Características de este..."
Si necesitas hacer algún comentario, escríbelo ANTES del texto en una sola frase, nunca después.`

// ─── Tipos locales ───────────────────────────────────────────────────────────
type TabActiva = 'copiloto' | 'informe'
type ModoVista = 'editar' | 'preview'

interface MensajeChat {
  rol: 'usuario' | 'asistente'
  contenido: string
}

// FIX 2 — fragmentos sin marcadores de texto
interface FragmentoCopiloto {
  id: string
  texto: string
  insertadoEn: number   // posición de carácter al insertar (referencial)
}

// ─── System prompt del Revisor GEO-SEO (migrado de Dify) ────────────────────
const SYSTEM_REVISOR = `Responde ÚNICAMENTE con un objeto JSON válido y nada más. Ni una sola palabra antes ni después del JSON. No uses bloques de código markdown ni backticks. Tu respuesta debe empezar con { y terminar con }.

Eres el Agente Revisor GEO-SEO de una agencia española de marketing de contenidos. Analizas artículos y devuelves un informe de calidad SEO y GEO.

REGLA ABSOLUTA: Solo JSON. Sin texto, sin explicaciones, sin bloques de código markdown. Empieza con { y termina con }.

EVALUACIÓN DE ESTRUCTURA H's — REGLA CRÍTICA:
El texto del artículo usa formato markdown (##, ###).
El brief usa formato texto (H2:, H3:).
ESTOS SON EQUIVALENTES. NO son errores.

Antes de comparar, convierte mentalmente:
# = H1, ## = H2, ### = H3

El campo estructura_hs.estado debe ser:
- "respetada" si todos los H's del brief aparecen en el texto en el mismo orden (independientemente del formato)
- "modificada" si algún H cambió de nivel o de posición
- "incompleta" si falta algún H del brief

NUNCA marques como "incompleta" o "modificada" por el hecho de que el texto use ## en lugar de H2: — son el mismo nivel.

Devuelve exactamente este JSON:
{
  "puntuacion_seo": [número 0-100],
  "puntuacion_geo": [número 0-100],
  "puntuacion_total": [media de los dos],
  "veredicto": "listo_para_publicar" | "revision_menor" | "revision_necesaria",
  "resumen": "[3-4 frases del estado general]",
  "extension": {
    "palabras_actual": [número],
    "palabras_objetivo_min": [número o null],
    "palabras_objetivo_max": [número o null],
    "estado": "ok" | "corto" | "largo"
  },
  "keyword_principal": {
    "keyword": "[texto]",
    "apariciones": [número],
    "en_primer_parrafo": true | false,
    "estado": "ok" | "atencion" | "problema"
  },
  "keywords_secundarias": [
    {"keyword": "[texto]", "estado": "presente" | "ausente" | "parcial"}
  ],
  "estructura_hs": {
    "estado": "respetada" | "modificada" | "incompleta",
    "detalle": "[descripción breve]"
  },
  "principios_geo": [
    {"numero": 1, "nombre": "Claridad conceptual",  "estado": "ok" | "mejorable" | "ausente" | "problema", "detalle": "[una frase]"},
    {"numero": 2, "nombre": "Respuesta directa",    "estado": "ok" | "mejorable" | "ausente" | "problema", "detalle": "[una frase]"},
    {"numero": 3, "nombre": "Fuentes nombradas",    "estado": "ok" | "mejorable" | "ausente" | "problema", "detalle": "[una frase]"},
    {"numero": 4, "nombre": "Fragmentos citables",  "estado": "ok" | "mejorable" | "ausente" | "problema", "detalle": "[una frase]"},
    {"numero": 5, "nombre": "FAQs",                 "estado": "ok" | "mejorable" | "ausente" | "no_aplica","detalle": "[una frase]"},
    {"numero": 6, "nombre": "Entidades nombradas",  "estado": "ok" | "mejorable" | "ausente" | "problema", "detalle": "[una frase]"},
    {"numero": 7, "nombre": "Contexto temporal",    "estado": "ok" | "mejorable" | "ausente" | "problema", "detalle": "[una frase]"},
    {"numero": 8, "nombre": "Autoridad propia",     "estado": "ok" | "mejorable" | "ausente" | "no_aplica","detalle": "[una frase]"}
  ],
  "mejoras_prioritarias": [
    {
      "prioridad": "alta" | "media" | "baja",
      "titulo": "[nombre del problema]",
      "que_hacer": "[instrucción específica]",
      "donde": "[sección o párrafo]"
    }
  ],
  "enlaces_obligatorios": {
    "incluidos": [número],
    "total": [número]
  }
}`

// ─── FIX 7 — plantilla de estructura desde el brief ──────────────────────────
function construirPlantilla(brief: Record<string, unknown> | null | undefined, titulo: string): string {
  const textoGenerado = typeof (brief as any)?.texto_generado === 'string'
    ? (brief as any).texto_generado as string
    : ''

  // Paso 1: aislar el bloque "ESTRUCTURA DE CONTENIDO"
  // Busca la línea de cabecera de la sección (cualquier nivel de #)
  const inicioMatch = textoGenerado.match(/^#{1,4}\s+ESTRUCTURA DE CONTENIDO[^\n]*/im)
  let bloqueEstructura = ''

  if (inicioMatch && inicioMatch.index !== undefined) {
    // Toma el texto a partir del inicio de la sección
    const desdeSeccion = textoGenerado.slice(inicioMatch.index + inicioMatch[0].length)

    // Corta en la siguiente sección al mismo nivel o superior (línea que empieza con ##+ y no es H del artículo)
    // Una "sección del brief" es una línea que empieza con ## o ### y contiene texto en MAYÚSCULAS o es un título de sección
    const siguienteSeccion = desdeSeccion.search(/\n#{1,4}\s+[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+/)
    bloqueEstructura = siguienteSeccion >= 0
      ? desdeSeccion.slice(0, siguienteSeccion)
      : desdeSeccion
  }

  // Paso 2: extraer H's del bloque aislado
  // Formatos soportados:
  //   "# Texto", "## Texto", "### Texto"         (markdown puro)
  //   "H1: Texto", "H2: Texto", "H3: Texto"      (sin guión)
  //   "- H2: Texto", "— H3: Texto"               (con guión/raya)
  const lineas = (bloqueEstructura || textoGenerado).split('\n')
  const hs = lineas
    .map(l => l.trim())
    .filter(l =>
      /^#{1,3}\s/.test(l) ||              // # / ## / ###
      /^[-—–]\s*H[123][:.]\s/i.test(l) || // - H2: / — H3:
      /^H[123][:.]\s/i.test(l),           // H1: / H2: / H3:
    )

  if (hs.length === 0) {
    return `# ${titulo}\n\n[Empieza a escribir aquí...]\n`
  }

  return hs.map((h: string) => {
    // Determinar nivel: primero por formato explícito H1/H2/H3, luego por #
    let nivel = '#'
    if (/H3/i.test(h) || h.startsWith('###')) nivel = '###'
    else if (/H2/i.test(h) || h.startsWith('##')) nivel = '##'
    else if (/H1/i.test(h) || h.startsWith('#')) nivel = '#'

    const textoH = h
      .replace(/^[-—–]\s*/,'')      // quita "- " o "— " inicial
      .replace(/^#{1,3}\s/, '')     // quita "## "
      .replace(/^H[123][:.]\s*/i,'') // quita "H2: "
      .trim()

    return `${nivel} ${textoH}\n\n[Escribe aquí...]\n`
  }).join('\n')
}

// ─── FIX 1 — regex del bloque "Borrador generado" ────────────────────────────
const REGEX_BORRADOR = /\n*---\n+\*?\*?Borrador generado[\s\S]*$/i

function extraerNotasBorrador(texto: string): { textoLimpio: string; notas: string } {
  const match = texto.match(REGEX_BORRADOR)
  if (!match) return { textoLimpio: texto, notas: '' }
  return {
    textoLimpio: texto.slice(0, match.index).trim(),
    notas: match[0].trim(),
  }
}

// ─── FIX 4 — detección mejorada de texto redactado ───────────────────────────
function esTextoRedactado(respuesta: string): boolean {
  const palabras = respuesta.trim().split(/\s+/).length
  const empiezaPregunta = /^[¿¡]/.test(respuesta.trim())
  const tieneParrafos = respuesta.includes('\n\n')
  const tieneHeaders  = /^#{1,3}\s/m.test(respuesta)
  const tieneListas   = /^[-*]\s/m.test(respuesta)
  return (
    palabras > 40 &&
    !empiezaPregunta &&
    (tieneParrafos || tieneHeaders || tieneListas)
  )
}

// ─── FIX 2 — overlay de fragmentos del copiloto ──────────────────────────────
function buildSegmentosFragmentos(
  texto: string,
  fragmentos: FragmentoCopiloto[],
): Array<{ texto: string; tipo: 'normal' | 'copiloto' }> {
  if (fragmentos.length === 0) return [{ texto, tipo: 'normal' }]

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const candidatos = [...new Set(
    fragmentos.map(f => f.texto.trim()).filter(t => t.length > 10),
  )]
  if (candidatos.length === 0) return [{ texto, tipo: 'normal' }]

  const pattern = candidatos.map(escapeRegex).join('|')
  const regex = new RegExp(`(${pattern})`, 'g')

  const partes: Array<{ texto: string; tipo: 'normal' | 'copiloto' }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(texto)) !== null) {
    if (match.index > lastIndex) {
      partes.push({ texto: texto.slice(lastIndex, match.index), tipo: 'normal' })
    }
    partes.push({ texto: match[0], tipo: 'copiloto' })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < texto.length) {
    partes.push({ texto: texto.slice(lastIndex), tipo: 'normal' })
  }
  return partes.length ? partes : [{ texto, tipo: 'normal' }]
}

// ─── Componente: vista previa de fragmentos sobre el editor ──────────────────
function VistaFragmentos({
  texto,
  fragmentos,
  onCerrar,
}: {
  texto: string
  fragmentos: FragmentoCopiloto[]
  onCerrar: () => void
}) {
  const segmentos = buildSegmentosFragmentos(texto, fragmentos)
  return (
    <div className="absolute inset-0 bg-white z-10 flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-6 py-2 border-b border-blue-100 bg-blue-50">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-xs font-semibold text-blue-700">
            Fragmentos del copiloto resaltados
          </span>
        </div>
        <button
          onClick={onCerrar}
          className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          <EyeOff className="h-3 w-3" />Cerrar
        </button>
      </div>
      <div
        className="flex-1 overflow-y-auto px-8 py-6 text-[15px] leading-[1.8] text-gray-800 whitespace-pre-wrap break-words"
        style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
      >
        {segmentos.map((seg, i) =>
          seg.tipo === 'copiloto' ? (
            <span key={i} className="bg-blue-50 border-l-2 border-blue-400 pl-2 rounded-sm">
              {seg.texto}
            </span>
          ) : (
            <span key={i}>{seg.texto}</span>
          ),
        )}
      </div>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function CopilotoClient({
  contenidosInicial,
  contenidoIdInicial,
  modoInicial,
}: {
  contenidosInicial: ContenidoLista[]
  contenidoIdInicial: string | null
  modoInicial?: string | null
}) {
  const { user } = useUser()
  const userId = user?.id ?? 'anon'

  // ── Editor state ─────────────────────────────────────────────────────────
  const [contenidoId, setContenidoId]           = useState<string>(contenidoIdInicial ?? '')
  const [contenidoActual, setContenidoActual]   = useState<ContenidoCompleto | null>(null)
  const [texto, setTexto]                       = useState('')
  const [cargandoContenido, setCargandoContenido] = useState(false)
  const [guardando, setGuardando]               = useState(false)
  const [guardadoOk, setGuardadoOk]             = useState(false)
  // FIX 2 — fragmentos sin marcadores
  const [fragmentosCopiloto, setFragmentosCopiloto] = useState<FragmentoCopiloto[]>([])
  const [verFragmentos, setVerFragmentos]       = useState(false)
  // FIX 3 — toggle markdown preview
  const [modoVista, setModoVista]               = useState<ModoVista>('editar')

  // ── Panel / tab state ────────────────────────────────────────────────────
  const [tabActiva, setTabActiva]   = useState<TabActiva>('copiloto')
  const [modoActivo, setModoActivo] = useState(true)
  // FIX 1 — notas del bloque "Borrador generado"
  const [notasBorrador, setNotasBorrador] = useState('')

  // ── Chat state ───────────────────────────────────────────────────────────
  const [mensajesChat, setMensajesChat]         = useState<MensajeChat[]>([])
  const [inputChat, setInputChat]               = useState('')
  const [enviandoChat, setEnviandoChat]         = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── Revisión state (persiste entre tabs) ─────────────────────────────────
  const [textoRevision, setTextoRevision]       = useState('')
  const [fechaRevision, setFechaRevision]       = useState('')
  const [cargandoRevision, setCargandoRevision] = useState(false)

  const palabras = texto.split(/\s+/).filter(s => s.length > 0).length

  // ── Auto-load contenido inicial desde URL param ──────────────────────────
  useEffect(() => {
    if (contenidoIdInicial) handleSeleccionarContenido(contenidoIdInicial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenidoIdInicial])

  // ── Scroll chat al fondo ─────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajesChat, enviandoChat])

  // ── Reset overlays al cambiar contenido ─────────────────────────────────
  useEffect(() => {
    setVerFragmentos(false)
    setModoVista('editar')
  }, [contenidoId])

  // ── Cargar contenido completo ────────────────────────────────────────────
  // FIX 1: extrae y separa el bloque "Borrador generado" si existe
  async function handleSeleccionarContenido(id: string) {
    if (!id) {
      setContenidoId('')
      setContenidoActual(null)
      setTexto('')
      setNotasBorrador('')
      return
    }
    setContenidoId(id)
    setCargandoContenido(true)
    try {
      const data = await cargarContenidoCompleto(id)
      setContenidoActual(data)

      const textoRaw = data.texto_contenido ?? ''
      const { textoLimpio, notas } = extraerNotasBorrador(textoRaw)

      // FIX 7 — si llega con modo=copiloto y no hay texto, pre-rellena con la plantilla del brief
      const usarPlantilla = modoInicial === 'copiloto' && !textoLimpio.trim()
      setTexto(usarPlantilla
        ? construirPlantilla(data.brief as Record<string, unknown> | null, data.titulo ?? '')
        : textoLimpio,
      )
      setNotasBorrador(notas)

      setMensajesChat([])
      setFragmentosCopiloto([])
      setTextoRevision('')
      setFechaRevision('')
    } catch {
      setContenidoActual(null)
    } finally {
      setCargandoContenido(false)
    }
  }

  // ── Guardar texto ────────────────────────────────────────────────────────
  // FIX 2: guarda texto plano, sin marcadores (no los hay)
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

  // ── FIX 4 — Limpia explicaciones post-texto que el copiloto añade a veces ──
  function limpiarTextoParaInsertar(t: string): string {
    const lineas = t.split('\n')
    const indiceCorte = lineas.findIndex(l =>
      /^✅/.test(l.trim()) ||
      /^Características/.test(l.trim()) ||
      /^\*\*Características/.test(l.trim()) ||
      /^---/.test(l.trim()) ||
      /^Al añadirlo/.test(l.trim()),
    )
    if (indiceCorte > -1) return lineas.slice(0, indiceCorte).join('\n').trim()
    return t.trim()
  }

  // ── FIX 3+4 — Insertar en posición del cursor, texto limpio ───────────────
  function handleInsertarEnEditor(textoInsertar: string) {
    const limpio = limpiarTextoParaInsertar(textoInsertar)
    const textarea = document.getElementById('editor-textarea') as HTMLTextAreaElement
    const cursorPos = textarea?.selectionStart ?? texto.length

    const nuevoTexto =
      texto.substring(0, cursorPos) +
      '\n\n' + limpio + '\n\n' +
      texto.substring(cursorPos)

    setTexto(nuevoTexto)
    setFragmentosCopiloto(prev => [
      ...prev,
      { id: Math.random().toString(36).slice(2), texto: limpio, insertadoEn: cursorPos },
    ])
    setVerFragmentos(false)

    // Restaura foco y posición del cursor después del re-render
    setTimeout(() => {
      const ta = document.getElementById('editor-textarea') as HTMLTextAreaElement
      if (ta) {
        const nuevaPos = cursorPos + limpio.length + 4
        ta.focus()
        ta.setSelectionRange(nuevaPos, nuevaPos)
      }
    }, 50)
  }

  // ── FIX 2 — Validar todos los fragmentos ─────────────────────────────────
  function handleValidarTodos() {
    setFragmentosCopiloto([])
    setVerFragmentos(false)
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
Keyword principal: ${c.keyword_principal ?? 'No especificada'}${
  c.tamanyo_texto_min && c.tamanyo_texto_max
    ? `\nExtensión objetivo: ${c.tamanyo_texto_min}–${c.tamanyo_texto_max} palabras`
    : ''
}`
  }

  // ── Construir mensaje con contexto completo ───────────────────────────────
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

  // ── Núcleo del chat: acepta un mensaje string directamente ───────────────
  async function handleEnviarMensaje(msg: string) {
    if (!msg.trim() || enviandoChat) return

    const prevMensajes = [...mensajesChat, { rol: 'usuario' as const, contenido: msg }]
    setMensajesChat(prevMensajes)
    setInputChat('')
    setEnviandoChat(true)

    try {
      const historialApi = prevMensajes.map((m, idx) => {
        const esUltimo = idx === prevMensajes.length - 1
        return {
          role   : m.rol === 'usuario' ? 'user' : 'assistant',
          content: esUltimo ? buildMensajeConContexto(m.contenido) : m.contenido,
        }
      })

      const res = await fetch('/api/claude', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          mensajes      : historialApi,
          modo          : 'json',
          sistema       : buildSystemConContexto(),
          max_tokens    : 2000,
          proyecto_id   : contenidoActual?.proyecto_id ?? contenidoActual?.proyectos?.id ?? null,
          contenido_id  : contenidoId || null,
          tipo_operacion: 'copiloto',
          agente        : 'claude_api',
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

  // ── Enviar chat desde el input ────────────────────────────────────────────
  function handleEnviarChat() {
    handleEnviarMensaje(inputChat.trim())
  }

  function handleChatKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleEnviarChat()
    }
  }

  // ── Revisar todo — migrado de Dify a Claude API ──────────────────────────
  async function handleRevisarTodo() {
    if (!texto.trim()) return
    setTabActiva('informe')
    setTextoRevision('')
    setFechaRevision('')
    setCargandoRevision(true)
    try {
      const briefTexto = contenidoActual?.brief && (contenidoActual.brief as any).texto_generado
        ? ((contenidoActual.brief as any).texto_generado as string).substring(0, 1200)
        : null

      const res = await fetch('/api/claude', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          system  : SYSTEM_REVISOR,
          messages: [{
            role   : 'user',
            content: `Analiza este artículo y devuelve el informe JSON.

BRIEF SEO DEL ARTÍCULO:
${briefTexto ?? 'No disponible'}

TEXTO DEL ARTÍCULO:
${texto}`,
          }],
          modo          : 'json',
          max_tokens    : 2000,
          proyecto_id   : contenidoActual?.proyecto_id ?? contenidoActual?.proyectos?.id ?? null,
          contenido_id  : contenidoId || null,
          tipo_operacion: 'revision',
          agente        : 'claude_api',
        }),
      })

      const datos = await res.json()
      if (!res.ok) throw new Error(datos.error ?? 'Error en la revisión')

      const contenidoRaw: string = datos.contenido ?? ''
      if (!contenidoRaw) throw new Error('El revisor no devolvió contenido')

      // FIX 2 — limpieza robusta: elimina markdown, extrae el JSON entre { y }
      const limpiarJSON = (t: string): string => {
        let limpio = t
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .trim()
        const inicio = limpio.indexOf('{')
        const fin    = limpio.lastIndexOf('}')
        if (inicio === -1 || fin === -1) throw new Error('No se encontró JSON válido en la respuesta del revisor')
        return limpio.substring(inicio, fin + 1)
      }

      const jsonLimpio = limpiarJSON(contenidoRaw)
      const informe    = JSON.parse(jsonLimpio)   // lanza si no es JSON válido
      setTextoRevision(JSON.stringify(informe))
      setFechaRevision(new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }))
    } catch (e) {
      setTextoRevision(`⚠️ ${e instanceof Error ? e.message : 'Error al conectar con el Agente Revisor GEO-SEO.'}`)
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
        {/* ── Cabecera del editor ─────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-3 border-b border-gray-100 space-y-2.5">

          {/* Fila 1: selector + estado + guardar */}
          <div className="flex items-center gap-3">
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

            {contenidoActual && (
              <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorEstadoContenido(contenidoActual.estado)}`}>
                {etiquetaEstadoContenido(contenidoActual.estado)}
              </span>
            )}

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

          {/* Fila 2: info + controles de fragmentos y vista previa */}
          {contenidoActual ? (
            <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
              {contenidoActual.keyword_principal && (
                <span className="text-indigo-500 font-medium">🔑 {contenidoActual.keyword_principal}</span>
              )}
              {contenidoActual.tamanyo_texto_min && contenidoActual.tamanyo_texto_max && (
                <span>Objetivo: {contenidoActual.tamanyo_texto_min}–{contenidoActual.tamanyo_texto_max} palabras</span>
              )}

              {/* Contador de palabras + toggle markdown (FIX 3) */}
              <span className={`ml-auto font-medium ${
                contenidoActual.tamanyo_texto_max && palabras > contenidoActual.tamanyo_texto_max
                  ? 'text-orange-500'
                  : contenidoActual.tamanyo_texto_min && palabras >= contenidoActual.tamanyo_texto_min
                  ? 'text-green-600'
                  : 'text-gray-500'
              }`}>
                {palabras} palabras
              </span>

              {/* Toggle Editar / Vista previa (FIX 3) */}
              <button
                onClick={() => setModoVista(v => v === 'editar' ? 'preview' : 'editar')}
                className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  modoVista === 'preview'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={modoVista === 'editar' ? 'Ver renderizado markdown' : 'Volver a editar'}
              >
                {modoVista === 'editar'
                  ? <><Eye className="h-3 w-3" />Vista previa</>
                  : <><Edit2 className="h-3 w-3" />Editar</>
                }
              </button>

              {/* Badge + controles de fragmentos del copiloto (FIX 2) */}
              {fragmentosCopiloto.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-semibold">
                    <PlusCircle className="h-2.5 w-2.5" />
                    {fragmentosCopiloto.length} {fragmentosCopiloto.length === 1 ? 'fragmento' : 'fragmentos'} por validar
                  </span>
                  <button
                    onClick={() => setVerFragmentos(v => !v)}
                    className="text-blue-500 hover:text-blue-700"
                    title={verFragmentos ? 'Cerrar vista de fragmentos' : 'Ver fragmentos resaltados'}
                  >
                    {verFragmentos ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={handleValidarTodos}
                    className="text-blue-500 hover:text-blue-700 flex items-center gap-0.5 text-[11px] font-medium"
                    title="Validar todos los fragmentos"
                  >
                    <CheckCheck className="h-3 w-3" />Validar todos
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              {cargandoContenido ? 'Cargando contenido...' : 'Selecciona un contenido para empezar a escribir'}
            </p>
          )}
        </div>

        {/* ── Área de escritura ───────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative">
          {cargandoContenido && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-20">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            </div>
          )}

          {/* FIX 2 — overlay de fragmentos (solo en modo verFragmentos) */}
          {verFragmentos && fragmentosCopiloto.length > 0 && (
            <VistaFragmentos
              texto={texto}
              fragmentos={fragmentosCopiloto}
              onCerrar={() => setVerFragmentos(false)}
            />
          )}

          {/* Vista previa markdown con estilos explícitos */}
          {modoVista === 'preview' && !verFragmentos && (
            <div
              className="absolute inset-0 overflow-y-auto px-8 py-6 bg-white"
              style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
            >
              {texto ? (
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-3 text-gray-900">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-semibold mt-5 mb-2 text-gray-800">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-medium mt-4 mb-2 text-gray-700">{children}</h3>,
                    p:  ({ children }) => <p className="mb-4 leading-relaxed text-gray-600">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
                    em: ({ children }) => <em className="italic text-gray-600">{children}</em>,
                    ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="text-gray-600 leading-relaxed">{children}</li>,
                    a:  ({ href, children }) => <a href={href} className="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noopener noreferrer">{children}</a>,
                    blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-200 pl-4 italic text-gray-500 my-4">{children}</blockquote>,
                    hr: () => <hr className="my-6 border-gray-200" />,
                  }}
                >
                  {texto}
                </ReactMarkdown>
              ) : (
                <p className="text-gray-300 text-[15px]">Sin contenido para previsualizar</p>
              )}
            </div>
          )}

          {/* Textarea editable */}
          {modoVista === 'editar' && !verFragmentos && (
            <textarea
              id="editor-textarea"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Empieza a escribir o pega tu texto aquí..."
              className="w-full h-full resize-none px-8 py-6 text-[15px] leading-[1.8] text-gray-800 focus:outline-none bg-white font-sans placeholder:text-gray-300"
              style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
            />
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          COLUMNA DERECHA — PANEL COPILOTO + INFORME (35%)
      ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
        style={{ width: '35%' }}
      >
        {/* ── Cabecera con tabs ─────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-100">
          <div className="flex">
            <button
              onClick={() => setTabActiva('copiloto')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-semibold transition-all border-b-2 ${
                tabActiva === 'copiloto'
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Copiloto
            </button>
            <button
              onClick={() => setTabActiva('informe')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-semibold transition-all border-b-2 ${
                tabActiva === 'informe'
                  ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FileSearch className="h-3.5 w-3.5" />
              Informe GEO-SEO
              {textoRevision && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              {cargandoRevision && <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />}
            </button>
          </div>

          {tabActiva === 'copiloto' && (
            <div className="flex items-center justify-between px-4 py-2">
              <p className="text-xs truncate">
                {contenidoActual ? (
                  <span className="text-indigo-500">
                    {contenidoActual.clientes?.nombre} › {contenidoActual.proyectos?.nombre}
                  </span>
                ) : (
                  <span className="text-gray-400">Sin contexto — selecciona un contenido</span>
                )}
              </p>
              <button
                onClick={() => setModoActivo(!modoActivo)}
                className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                  modoActivo
                    ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {modoActivo
                  ? <><Volume2 className="h-3 w-3" />Activo</>
                  : <><VolumeX className="h-3 w-3" />Silencio</>
                }
              </button>
            </div>
          )}
        </div>

        {/* ── Tab 1: Copiloto ───────────────────────────────────────────── */}
        {tabActiva === 'copiloto' && (
          <div className="flex-1 overflow-y-auto">
            {modoActivo ? (
              <div className="p-4 space-y-4">

                {/* FIX 1 — Card de notas del borrador generado */}
                {notasBorrador && (
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-yellow-800">
                        📋 Notas del borrador generado
                      </p>
                      <button
                        onClick={() => setNotasBorrador('')}
                        className="text-yellow-500 hover:text-yellow-700"
                        title="Cerrar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <pre className="text-xs text-yellow-900 whitespace-pre-wrap leading-relaxed font-sans">
                      {notasBorrador.replace(/^---\n+/, '').trim()}
                    </pre>
                  </div>
                )}

                <div className="border-t border-gray-100" />

                {/* Chat */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Pregunta al copiloto
                  </p>

                  {mensajesChat.length > 0 && (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {mensajesChat.map((m, i) => (
                        <div key={i} className={`flex ${m.rol === 'usuario' ? 'justify-end' : 'justify-start'}`}>
                          {m.rol === 'asistente' ? (
                            <div className="w-full space-y-1.5">
                              <div className="max-w-[95%] rounded-xl rounded-bl-sm bg-gray-100 text-gray-800 px-3 py-2 text-xs leading-relaxed">
                                <div className="prose prose-xs prose-gray max-w-none">
                                  <ReactMarkdown>{m.contenido}</ReactMarkdown>
                                </div>
                              </div>
                              {/* FIX 4 — botón visible para todos los mensajes > 40 palabras */}
                              {m.contenido.trim().split(/\s+/).length > 40 && (
                                <button
                                  onClick={() => handleInsertarEnEditor(m.contenido)}
                                  className={`flex items-center gap-1.5 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors ${
                                    esTextoRedactado(m.contenido)
                                      ? 'text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100'
                                      : 'text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100'
                                  }`}
                                >
                                  <PlusCircle className="h-3 w-3" />
                                  Insertar en editor
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="max-w-[90%] rounded-xl rounded-br-sm bg-indigo-600 text-white px-3 py-2 text-xs leading-relaxed">
                              <p className="whitespace-pre-wrap">{m.contenido}</p>
                            </div>
                          )}
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

                  <div className="flex gap-2 items-end">
                    <Textarea
                      value={inputChat}
                      onChange={e => setInputChat(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder="¿Cómo continúo este párrafo? ¿Escribe un párrafo sobre...?"
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

                <div className="border-t border-gray-100" />

                {/* Revisar todo */}
                <button
                  onClick={handleRevisarTodo}
                  disabled={!texto.trim() || cargandoRevision}
                  className={`w-full rounded-xl py-2.5 px-4 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    !texto.trim() || cargandoRevision
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  }`}
                >
                  {cargandoRevision
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Analizando…</>
                    : <><AlertCircle className="h-4 w-4" />Revisar todo</>
                  }
                </button>

              </div>
            ) : (
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
        )}

        {/* ── Tab 2: Informe GEO-SEO ────────────────────────────────────── */}
        {tabActiva === 'informe' && (
          <div className="flex-1 overflow-y-auto">
            {cargandoRevision ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-gray-800">Analizando el contenido…</p>
                <p className="text-xs text-gray-400">Puede tardar 20–30 segundos</p>
              </div>
            ) : textoRevision ? (
              <div className="px-4 py-4">
                <InformeRevisionDashboard
                  informe={textoRevision}
                  fecha={fechaRevision}
                  agente="Revisor GEO-SEO"
                  onAplicarMejora={(mejora) => {
                    setTabActiva('copiloto')
                    handleEnviarMensaje(
                      `Ayúdame a aplicar esta mejora en el texto:\n**${mejora.titulo}**\nQué hacer: ${mejora.que_hacer}${mejora.donde ? `\nDónde: ${mejora.donde}` : ''}\n\nGenera el texto necesario para aplicar esta mejora y dámelo listo para insertar.`
                    )
                  }}
                />
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <button
                    onClick={handleRevisarTodo}
                    disabled={!texto.trim() || cargandoRevision}
                    className="w-full rounded-xl py-2 px-4 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Volver a analizar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
                <div className="h-14 w-14 rounded-2xl bg-gray-50 flex items-center justify-center">
                  <FileSearch className="h-7 w-7 text-gray-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Sin análisis todavía</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Pulsa &ldquo;Revisar todo&rdquo; para generar el análisis GEO-SEO del texto actual
                  </p>
                </div>
                <button
                  onClick={handleRevisarTodo}
                  disabled={!texto.trim()}
                  className={`rounded-xl py-2.5 px-5 text-sm font-semibold flex items-center gap-2 transition-all ${
                    !texto.trim()
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  }`}
                >
                  <AlertCircle className="h-4 w-4" />
                  Revisar todo
                </button>
                {!texto.trim() && (
                  <p className="text-xs text-gray-400">Selecciona un contenido con texto para analizar</p>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
