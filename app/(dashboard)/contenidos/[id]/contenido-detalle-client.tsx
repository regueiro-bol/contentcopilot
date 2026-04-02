'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { ChevronRight, Sparkles, ExternalLink, FileText, Clock, MessageSquare, RefreshCw, Loader2, PenLine, Wand2, Bot, LayoutGrid } from 'lucide-react'
import InformeRevisionDashboard from '@/components/revisiones/InformeRevisionDashboard'
import BriefSEODisplay from '@/components/contenidos/BriefSEODisplay'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { colorEstadoContenido, etiquetaEstadoContenido, formatearFecha, formatearFechaRelativa } from '@/lib/utils'
import {
  actualizarEstadoContenido,
  actualizarTextoContenido,
  actualizarEntregaContenido,
  actualizarBriefContenido,
  guardarRevision,
  devolverContenido,
  publicarContenido,
} from './actions'
import type { Contenido, Proyecto, Cliente, PerfilAutor, EstadoContenido, BriefSEO } from '@/types'

type MensajeConversacion = Record<string, string>

type ConversacionResumen = {
  id: string
  mensajes: MensajeConversacion[]
  modelo: string   // también usado como identificador del agente revisor
  tokens_input: number
  tokens_output: number
  created_at: string
}

// Helpers para normalizar mensajes en cualquier formato
function getMensajeRole(m: MensajeConversacion): string {
  return m.role ?? m.rol ?? ''
}
function getMensajeContent(m: MensajeConversacion): string {
  return m.content ?? m.contenido ?? ''
}

// Etiquetas y colores de agentes
const AGENTE_LABELS: Record<string, string> = {
  revisor_geo_seo: 'Revisor GEO-SEO',
  brief_seo:       'Brief SEO',
  redactor:        'Redactor IA',
}
const AGENTE_COLORS: Record<string, string> = {
  revisor_geo_seo: 'bg-violet-100 text-violet-700',
  brief_seo:       'bg-indigo-100 text-indigo-700',
  redactor:        'bg-blue-100 text-blue-700',
}

type ContenidoExtendido = Contenido & { texto_contenido?: string; notas_iniciales?: string; notas_revision?: string }

const ESTADOS: EstadoContenido[] = [
  'pendiente', 'borrador', 'revision_seo', 'revision_cliente', 'devuelto', 'aprobado', 'publicado',
]

// ---------------------------------------------------------------------------
// Helper: Field display
// ---------------------------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="text-sm text-gray-800">{children || <span className="text-gray-400">—</span>}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BriefDisplay
// ---------------------------------------------------------------------------
function BriefDisplay({ brief }: { brief: BriefSEO }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Keyword principal">{brief.keyword_principal}</Field>
        <Field label="Volumen de búsquedas">
          {brief.volumen_busquedas ? `${brief.volumen_busquedas.toLocaleString('es-ES')} búsquedas/mes` : undefined}
        </Field>
        <Field label="Tipo de keyword">{brief.tipo_keyword}</Field>
        <Field label="Tipo de SERP">{brief.tipo_serp}</Field>
      </div>
      <Separator />
      <Field label="Título propuesto">
        <span className="font-medium text-gray-900">{brief.titulo_propuesto}</span>
      </Field>
      <Field label="URL prevista">{brief.url_prevista}</Field>
      <Field label="Meta description propuesta">{brief.description_propuesta}</Field>
      <Separator />
      <Field label="Respuesta directa">
        <p className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-gray-800">{brief.respuesta_directa}</p>
      </Field>
      {brief.estructura_h && (
        <Field label="Estructura de encabezados">
          <pre className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono">{brief.estructura_h}</pre>
        </Field>
      )}
      <Separator />
      {brief.keywords_secundarias?.length > 0 && (
        <Field label="Keywords secundarias">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {brief.keywords_secundarias.map((k) => (
              <span key={k} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">{k}</span>
            ))}
          </div>
        </Field>
      )}
      {brief.links_obligatorios?.length > 0 && (
        <Field label="Links obligatorios">
          <ul className="space-y-1 mt-1">
            {brief.links_obligatorios.map((l) => (
              <li key={l}><a href={l} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-xs">{l}</a></li>
            ))}
          </ul>
        </Field>
      )}
      {brief.observaciones_seo && (
        <>
          <Separator />
          <Field label="Observaciones SEO">
            <p className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-sm text-gray-800">{brief.observaciones_seo}</p>
          </Field>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal: Revisar con IA — Agente Revisor GEO-SEO (Dify)
// ---------------------------------------------------------------------------
function RevisarConIAModal({
  contenidoId,
  brief,
  open,
  onClose,
  textoContenido,
}: {
  contenidoId: string
  brief?: BriefSEO
  open: boolean
  onClose: () => void
  textoContenido?: string
}) {
  const router = useRouter()
  const { userId } = useAuth()
  const [textoArticulo, setTextoArticulo] = useState('')
  const [autoLoaded, setAutoLoaded] = useState(false)
  const [revisando, setRevisando] = useState(false)

  // Auto-populate textarea from article text when modal opens
  useEffect(() => {
    if (open && textoContenido?.trim()) {
      setTextoArticulo(textoContenido)
      setAutoLoaded(true)
    } else if (!open) {
      setAutoLoaded(false)
    }
  }, [open, textoContenido])
  const [error, setError] = useState<string | null>(null)

  async function handleRevisar() {
    if (!textoArticulo.trim()) { setError('Pega el texto del artículo a revisar'); return }
    setRevisando(true)
    setError(null)

    // Construir el query incluyendo el brief si existe
    const briefTexto = brief?.texto_generado?.trim()
    const query = briefTexto
      ? `BRIEF SEO:\n${briefTexto}\n\nTEXTO A REVISAR:\n${textoArticulo.trim()}`
      : `TEXTO A REVISAR:\n${textoArticulo.trim()}`

    try {
      const res = await fetch('/api/dify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          app_id: process.env.NEXT_PUBLIC_DIFY_REVISOR_GEO_SEO_APP_ID ?? 'revisor_geo_seo',
          usuario: userId,
          modo: 'blocking',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al conectar con el agente revisor')

      const answer: string = data.answer ?? data.respuesta ?? ''
      if (!answer) throw new Error('El agente no devolvió respuesta')

      // Guardar en tabla conversaciones
      await guardarRevision(contenidoId, {
        agente: 'revisor_geo_seo',
        mensajes: [
          { role: 'user',      content: query },
          { role: 'assistant', content: answer },
        ],
      })

      router.refresh()
      setTextoArticulo('')
      setAutoLoaded(false)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado al revisar')
    } finally {
      setRevisando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !revisando && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
              Revisor GEO-SEO
            </span>
            Revisar artículo con IA
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info brief incluido */}
          {brief?.texto_generado ? (
            <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
              <span className="text-green-600 mt-0.5">✓</span>
              <p className="text-green-800">
                El brief SEO se incluirá automáticamente en el análisis.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
              <span className="text-amber-500 mt-0.5">⚠</span>
              <p className="text-amber-800">
                No hay brief SEO generado. El agente analizará el texto sin contexto de brief.
              </p>
            </div>
          )}

          {/* Banner: texto cargado automáticamente */}
          {autoLoaded && (
            <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <p className="text-emerald-800">
                Texto del artículo cargado automáticamente. Puedes editarlo antes de revisar.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              Texto del artículo a revisar <span className="text-red-500">*</span>
            </Label>
            <textarea
              value={textoArticulo}
              onChange={(e) => setTextoArticulo(e.target.value)}
              disabled={revisando}
              placeholder="Pega aquí el texto completo del artículo..."
              rows={14}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white resize-y font-mono leading-relaxed transition-colors disabled:opacity-60"
            />
            {textoArticulo && (
              <p className="text-xs text-gray-400 text-right">
                ~{textoArticulo.split(/\s+/).filter(Boolean).length} palabras
              </p>
            )}
          </div>

          {revisando && (
            <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
              <Loader2 className="h-4 w-4 text-violet-600 animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-violet-800">Analizando el contenido…</p>
                <p className="text-xs text-violet-600 mt-0.5">El agente GEO-SEO está revisando. Puede tardar 20–30 segundos.</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={revisando}>Cancelar</Button>
          <Button
            onClick={handleRevisar}
            disabled={revisando || !textoArticulo.trim()}
            className="gap-2 bg-violet-600 hover:bg-violet-700"
          >
            {revisando ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Analizando…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" />Revisar con IA</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Modal: Generar brief con IA (Dify)
// ---------------------------------------------------------------------------
function GenerarBriefModal({
  contenidoId,
  tieneBrief,
  open,
  onClose,
}: {
  contenidoId: string
  tieneBrief: boolean
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const { userId } = useAuth()
  const [datosExcel, setDatosExcel] = useState('')
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerar() {
    if (!datosExcel.trim()) {
      setError('Pega los datos del Excel para continuar')
      return
    }
    setGenerando(true)
    setError(null)

    try {
      const res = await fetch('/api/dify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: datosExcel,
          app_id: process.env.NEXT_PUBLIC_DIFY_BRIEF_SEO_APP_ID ?? 'brief_seo',
          usuario: userId,
          modo: 'blocking',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al conectar con el agente')

      const textoGenerado: string = data.answer ?? data.respuesta ?? ''
      if (!textoGenerado) throw new Error('El agente no devolvió respuesta')

      // Guardar en Supabase dentro del campo JSONB brief
      await actualizarBriefContenido(contenidoId, { texto_generado: textoGenerado } as Partial<BriefSEO>)

      router.refresh()
      setDatosExcel('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado al generar el brief')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !generando && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            {tieneBrief ? 'Regenerar brief con IA' : 'Generar brief con IA'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Instrucciones */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-800">
            <p className="font-semibold mb-1">¿Cómo funciona?</p>
            <p className="text-indigo-700 text-sm leading-relaxed">
              Pega los datos del Excel SEO (keyword, título propuesto, URL, volumen de búsquedas,
              estructura de H's, keywords secundarias…). El agente Brief SEO los procesará
              y generará el brief completo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>
              Datos del Excel SEO <span className="text-red-500">*</span>
            </Label>
            <textarea
              value={datosExcel}
              onChange={(e) => setDatosExcel(e.target.value)}
              disabled={generando}
              placeholder={`Keyword principal: financiación pyme
Título propuesto: Cómo conseguir financiación para tu pyme en 2025
URL prevista: /blog/financiacion-pyme
Volumen de búsquedas: 2.400/mes
Tipo de keyword: informacional
Keywords secundarias: crédito pyme, préstamos para empresas, ...
Estructura H's:
  H1: Cómo conseguir financiación para tu pyme...
  H2: Tipos de financiación disponibles
  H2: Requisitos para solicitar un crédito
  ...`}
              rows={12}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-y font-mono leading-relaxed transition-colors disabled:opacity-60"
            />
            <p className="text-xs text-gray-400">
              Puedes pegar texto libre, datos del Excel o cualquier formato — el agente lo interpretará.
            </p>
          </div>

          {/* Estado de generación */}
          {generando && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <Loader2 className="h-4 w-4 text-blue-600 animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Generando brief…</p>
                <p className="text-xs text-blue-600 mt-0.5">El agente está procesando los datos. Puede tardar 15–30 segundos.</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generando}>
            Cancelar
          </Button>
          <Button onClick={handleGenerar} disabled={generando || !datosExcel.trim()} className="gap-2">
            {generando ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generando…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" />{tieneBrief ? 'Regenerar' : 'Generar brief'}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Modal: Editar entrega
// ---------------------------------------------------------------------------
function EditarEntregaModal({
  contenidoId, urlPublicado, linkDrive, open, onClose,
}: { contenidoId: string; urlPublicado?: string; linkDrive?: string; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [url, setUrl] = useState(urlPublicado ?? '')
  const [drive, setDrive] = useState(linkDrive ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGuardar() {
    setGuardando(true); setError(null)
    try {
      await actualizarEntregaContenido(contenidoId, { url_publicado: url, link_drive: drive })
      router.refresh(); onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setGuardando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Datos de entrega</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>URL publicado</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://blog.empresa.com/articulo-..." />
          </div>
          <div className="space-y-1.5">
            <Label>Link Drive</Label>
            <Input value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="https://docs.google.com/..." />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 px-1 pb-1">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function ContenidoDetalleClient({
  contenido,
  proyecto,
  cliente,
  autores,
  conversaciones,
}: {
  contenido: ContenidoExtendido
  proyecto: Proyecto | null
  cliente: Cliente | null
  autores: PerfilAutor[]
  conversaciones: ConversacionResumen[]
}) {
  const router = useRouter()
  const { userId } = useAuth()
  const [estado, setEstado] = useState<EstadoContenido>(contenido.estado)
  const [texto, setTexto] = useState(contenido.texto_contenido ?? '')
  const [showWelcome, setShowWelcome] = useState(!contenido.texto_contenido)
  const [guardandoTexto, setGuardandoTexto] = useState(false)
  const [textoGuardado, setTextoGuardado] = useState(false)
  const [generandoBorrador, setGenerandoBorrador] = useState(false)
  const [errorBorrador, setErrorBorrador] = useState<string | null>(null)
  const [modalEntrega, setModalEntrega] = useState(false)
  const [modalBrief, setModalBrief] = useState(false)
  const [modalRevisar, setModalRevisar] = useState(false)
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [heRevisado, setHeRevisado] = useState(false)
  const [mostrarConfirmEnvio, setMostrarConfirmEnvio] = useState(false)
  const [notaDevolucion, setNotaDevolucion] = useState('')
  const [mostrarFormDevolucion, setMostrarFormDevolucion] = useState(false)
  const [modalPublicar, setModalPublicar] = useState(false)
  const [urlParaPublicar, setUrlParaPublicar] = useState(contenido.url_publicado ?? '')
  const [notasRevision, setNotasRevision] = useState(contenido.notas_revision ?? '')

  const redactorNombre = autores.find((a) => a.id === contenido.redactor_id)?.nombre

  async function handleCambiarEstado(nuevoEstado: EstadoContenido) {
    if (nuevoEstado === estado) return
    setCambiandoEstado(true)
    try {
      await actualizarEstadoContenido(contenido.id, nuevoEstado)
      setEstado(nuevoEstado)
      router.refresh()
    } catch {
      // restore on error
    } finally { setCambiandoEstado(false) }
  }

  async function handleGenerarBorrador() {
    setGenerandoBorrador(true)
    setErrorBorrador(null)

    const SYSTEM_REDACTOR = `AGENTE REDACTOR COPILOTO — ContentCopilot

Eres el Agente Redactor Copiloto de una agencia española de marketing de contenidos. Ahora estás en MODO BORRADOR AUTOMÁTICO.

En este modo combinas tres capas de contexto en este orden de prioridad:
1. Voz de marca del proyecto (siempre dominante)
2. Brief SEO (estructura y keywords obligatorias)
3. Perfil del autor (matices de estilo, subordinado a las dos anteriores)

MODO BORRADOR AUTOMÁTICO — proceso:
1. Lee el brief SEO completo del mensaje del usuario
2. Genera el artículo completo respetando:
   OBLIGATORIO: Reproduce EXACTAMENTE todos los H1, H2 y H3 del brief en el mismo orden. Ningún H puede faltar ni modificarse. Cada H debe tener contenido desarrollado debajo — nunca dejes un H vacío o con una sola frase. Si el brief tiene 4 H2 y 8 H3, el artículo debe tener exactamente 4 H2 y 8 H3 en ese orden exacto. Esto es una restricción absoluta — no es negociable.
   - La keyword principal en los primeros 100 palabras
   - Las keywords secundarias distribuidas de forma natural
   - Los links obligatorios integrados en contexto
   - El tono de voz de marca del proyecto
   - La extensión objetivo ± 10%

REGLA CRÍTICA — datos y estadísticas:
- Cita siempre la fuente real entre paréntesis con año
- Formato: "Según [organismo/estudio] ([año]),"
- Si no conoces la fuente exacta, NO incluyas el dato
- Nunca escribas "estudios demuestran" sin fuente concreta
- Mínimo 2-3 datos con fuente por artículo

Tras el borrador añade siempre:
---
Borrador generado — pendiente de revisión humana
- Extensión: [X palabras]
- Keywords usadas: [lista]
- H's respetados: [sí/parcialmente]
- Sugerencia: Revisa especialmente [el punto más débil]
---

REGLAS GENERALES:
1. NUNCA inventes datos, estadísticas o citas
2. NUNCA cambies la estructura de H's definida por el SEO
3. NUNCA ignores una restricción global del cliente
4. Responde siempre en español`

    try {
      const extMin = contenido.tamanyo_texto_min ?? 800
      const extMax = contenido.tamanyo_texto_max ?? 1200

      const briefSeoBloque = contenido.brief?.texto_generado?.trim()
        ? contenido.brief.texto_generado.trim()
        : `Keyword principal: ${contenido.keyword_principal ?? 'No especificada'}
Título: ${contenido.titulo}
Extensión objetivo: ${extMin}-${extMax} palabras`

      const userContent = `CLIENTE: ${cliente?.nombre ?? 'No especificado'}
PROYECTO: ${proyecto?.nombre ?? 'No especificado'}
VOZ DE MARCA: ${proyecto?.tono_voz ?? 'No especificado'}
ETIQUETAS DE TONO: ${(proyecto as any)?.etiquetas_tono?.join(', ') ?? 'No especificadas'}
KEYWORDS OBJETIVO DEL PROYECTO: ${proyecto?.keywords_objetivo?.join(', ') ?? 'No especificadas'}
PERFIL DE LECTOR: ${(proyecto as any)?.perfil_lector ?? 'No especificado'}
RESTRICCIONES GLOBALES: ${((cliente as any)?.restricciones_globales as string[] | undefined)?.join(', ') ?? 'Ninguna'}
MODO CREATIVO: false

BRIEF SEO COMPLETO:
${briefSeoBloque}

INSTRUCCIÓN: Genera el artículo completo en español siguiendo estrictamente el brief anterior.
Extensión objetivo: ${extMin}-${extMax} palabras.`

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: SYSTEM_REDACTOR,
          messages: [{ role: 'user', content: userContent }],
          modo: 'json',
          max_tokens: 4000,
          proyecto_id: contenido.proyecto_id ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al conectar con el agente redactor')
      const textoBorrador: string = data.contenido ?? ''
      if (!textoBorrador) throw new Error('El agente no devolvió contenido')

      // FIX 1 — regex más agresiva: captura cualquier variante del bloque de notas
      const limpiarTextoBorrador = (t: string): string => {
        const indice = t.search(/\n?-{2,}\n[\s\S]*?[Bb]orrador\s+generado/i)
        if (indice > -1) return t.substring(0, indice).trim()
        return t.trim()
      }
      const textoBorradorLimpio = limpiarTextoBorrador(textoBorrador)

      setTexto(textoBorradorLimpio)
      setHeRevisado(false)
      setShowWelcome(false)
      // Guardar automáticamente en Supabase (sin el bloque de notas)
      await actualizarTextoContenido(contenido.id, textoBorradorLimpio)
      // Abrir copiloto para revisar/editar el borrador generado
      router.push(`/copiloto?contenido=${contenido.id}`)
    } catch (e) {
      setErrorBorrador(e instanceof Error ? e.message : 'Error inesperado al generar el borrador')
    } finally {
      setGenerandoBorrador(false)
    }
  }

  async function handleGuardarTexto() {
    setGuardandoTexto(true)
    try {
      await actualizarTextoContenido(contenido.id, texto)
      setTextoGuardado(true)
      setTimeout(() => setTextoGuardado(false), 2000)
      router.refresh()
    } catch {
      // handle silently
    } finally { setGuardandoTexto(false) }
  }

  async function handleAprobar() {
    setCambiandoEstado(true)
    try {
      if (texto !== (contenido.texto_contenido ?? '')) {
        await actualizarTextoContenido(contenido.id, texto)
      }
      await actualizarEstadoContenido(contenido.id, 'aprobado')
      setEstado('aprobado')
      router.refresh()
    } catch {
      // handle silently
    } finally { setCambiandoEstado(false) }
  }

  async function handleDevolver() {
    setCambiandoEstado(true)
    try {
      await devolverContenido(contenido.id, notaDevolucion.trim())
      setEstado('devuelto')
      setNotasRevision(notaDevolucion.trim())
      setMostrarFormDevolucion(false)
      setNotaDevolucion('')
      router.refresh()
    } catch {
      // handle silently
    } finally { setCambiandoEstado(false) }
  }

  async function handlePublicar() {
    setCambiandoEstado(true)
    try {
      await publicarContenido(contenido.id, urlParaPublicar)
      setEstado('publicado')
      setModalPublicar(false)
      router.refresh()
    } catch {
      // handle silently
    } finally { setCambiandoEstado(false) }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <Link href="/clientes" className="hover:text-indigo-600 transition-colors">Clientes</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {cliente && (
          <>
            <Link href={`/clientes/${cliente.id}`} className="hover:text-indigo-600 transition-colors">{cliente.nombre}</Link>
            <ChevronRight className="h-3.5 w-3.5" />
          </>
        )}
        {proyecto && (
          <>
            <Link href={`/clientes/${proyecto.cliente_id}/proyectos/${proyecto.id}`} className="hover:text-indigo-600 transition-colors">{proyecto.nombre}</Link>
            <ChevronRight className="h-3.5 w-3.5" />
          </>
        )}
        <span className="text-gray-900 font-medium truncate max-w-xs">{contenido.titulo}</span>
      </div>

      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-gray-900 leading-tight">{contenido.titulo}</h2>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {/* Selector de estado */}
            <div className="relative">
              <select
                value={estado}
                onChange={(e) => handleCambiarEstado(e.target.value as EstadoContenido)}
                disabled={cambiandoEstado}
                className={`appearance-none cursor-pointer rounded-full px-3 py-1 text-xs font-semibold pr-6 border-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${colorEstadoContenido(estado)}`}
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>{etiquetaEstadoContenido(e)}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-current opacity-60 text-xs">▾</span>
            </div>
            {contenido.keyword_principal && (
              <span className="text-xs text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full font-medium">{contenido.keyword_principal}</span>
            )}
            {redactorNombre && (
              <span className="text-xs text-gray-500">{redactorNombre}</span>
            )}
            {contenido.fecha_entrega && (
              <span className="text-xs text-gray-500">{formatearFecha(contenido.fecha_entrega)}</span>
            )}
            {contenido.tamanyo_texto_min && contenido.tamanyo_texto_max && (
              <span className="text-xs text-gray-500">{contenido.tamanyo_texto_min}–{contenido.tamanyo_texto_max} palabras</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {proyecto?.cliente_id && (
            <Button size="sm" variant="outline" className="gap-2" asChild>
              <Link
                href={`/clientes/${proyecto.cliente_id}/ad-creatives?open=1&intent=organic_informative&source=${encodeURIComponent((texto ?? '').slice(0, 800))}`}
              >
                <LayoutGrid className="h-4 w-4" />
                Generar social
              </Link>
            </Button>
          )}
          <Button size="sm" className="gap-2" asChild>
            <Link href={`/copiloto?contenido=${contenido.id}`}>
              <Sparkles className="h-4 w-4" />Abrir copiloto
            </Link>
          </Button>
        </div>
      </div>

      {/* Notas iniciales (si existen) */}
      {contenido.notas_iniciales && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
          <span className="text-amber-500 text-lg">📋</span>
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-1">Notas iniciales</p>
            <p className="text-sm text-amber-900">{contenido.notas_iniciales}</p>
          </div>
        </div>
      )}

      {/* ── Banners de transición de estado ── */}

      {estado === 'revision_seo' && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="text-yellow-500 text-xl shrink-0">⏳</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-yellow-800">
                Este contenido está pendiente de revisión SEO
              </p>
              {!mostrarFormDevolucion ? (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => handleCambiarEstado('aprobado')}
                    disabled={cambiandoEstado}
                    className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  >
                    {cambiandoEstado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Aprobar contenido
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMostrarFormDevolucion(true)}
                    disabled={cambiandoEstado}
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    Devolver al redactor
                  </Button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={notaDevolucion}
                    onChange={(e) => setNotaDevolucion(e.target.value)}
                    placeholder="Motivo de la devolución (opcional)..."
                    rows={3}
                    className="w-full rounded-lg border border-yellow-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleDevolver}
                      disabled={cambiandoEstado}
                      className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                    >
                      {cambiandoEstado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Confirmar devolución
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setMostrarFormDevolucion(false); setNotaDevolucion('') }}
                      disabled={cambiandoEstado}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {estado === 'aprobado' && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-green-500 text-xl">✅</span>
              <p className="text-sm font-semibold text-green-800">
                Contenido aprobado — listo para publicar
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => setModalPublicar(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Marcar como publicado
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCambiarEstado('borrador')}
                disabled={cambiandoEstado}
                className="text-gray-500 text-xs"
              >
                Volver a borrador
              </Button>
            </div>
          </div>
        </div>
      )}

      {estado === 'publicado' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-blue-500 text-xl shrink-0">🌐</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-800">Publicado</p>
                {contenido.url_publicado && (
                  <a
                    href={contenido.url_publicado}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5 truncate"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {contenido.url_publicado}
                  </a>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setModalEntrega(true)}
              className="shrink-0 text-xs"
            >
              Editar URL
            </Button>
          </div>
        </div>
      )}

      {estado === 'devuelto' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="text-red-500 text-xl shrink-0">↩️</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                Contenido devuelto — revisa las notas antes de reenviar
              </p>
              {notasRevision && (
                <p className="mt-2 text-sm text-red-700 bg-red-100 rounded-lg px-3 py-2 leading-relaxed">
                  {notasRevision}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCambiarEstado('revision_seo')}
                disabled={cambiandoEstado}
                className="mt-3 border-red-300 text-red-700 hover:bg-red-100 gap-1.5"
              >
                {cambiandoEstado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Volver a enviar a revisión SEO
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="brief">
        <TabsList>
          <TabsTrigger value="brief">Brief SEO</TabsTrigger>
          <TabsTrigger value="contenido">Contenido</TabsTrigger>
          <TabsTrigger value="revisiones">Revisiones ({conversaciones.length})</TabsTrigger>
          <TabsTrigger value="entrega">Entrega</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Brief SEO ── */}
        <TabsContent value="brief">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Brief SEO</CardTitle>
              <div className="flex gap-2">
                {contenido.brief && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setModalBrief(true)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />Regenerar con IA
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {contenido.brief?.texto_generado ? (
                /* ── Brief generado por IA: renderizado visual ── */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg">
                    <Sparkles className="h-3.5 w-3.5" />
                    Brief generado por el agente Brief SEO
                  </div>
                  <BriefSEODisplay texto={contenido.brief.texto_generado} />
                </div>
              ) : contenido.brief ? (
                /* ── Brief estructurado (campos individuales) ── */
                <BriefDisplay brief={contenido.brief} />
              ) : (
                /* ── Sin brief ── */
                <div className="text-center py-14">
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                    <FileText className="h-7 w-7 text-indigo-400" />
                  </div>
                  <p className="text-gray-700 font-semibold">Sin brief todavía</p>
                  <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                    Pega los datos del Excel SEO y el agente generará el brief completo automáticamente.
                  </p>
                  <Button className="mt-5 gap-2" onClick={() => setModalBrief(true)}>
                    <Sparkles className="h-4 w-4" />Generar brief con IA
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Contenido ── */}
        <TabsContent value="contenido">
          {showWelcome ? (
            /* ── Pantalla de bienvenida — sin texto todavía ── */
            <Card className="relative overflow-hidden">
              {/* Overlay de generación — cubre la tarjeta entera */}
              {generandoBorrador && (
                <div className="absolute inset-0 z-20 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-indigo-100 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-gray-900">Generando borrador completo…</p>
                    <p className="text-sm text-gray-500 mt-1">Puede tardar 30–60 segundos según la extensión</p>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <CardContent className="py-12 px-6">
                {/* Resumen del contenido */}
                <div className="max-w-2xl mx-auto text-center mb-10">
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                    <FileText className="h-7 w-7 text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Empieza a redactar</h3>
                  {contenido.keyword_principal && (
                    <p className="mt-2 text-sm text-gray-500">
                      Keyword principal:{' '}
                      <span className="font-semibold text-indigo-600">{contenido.keyword_principal}</span>
                    </p>
                  )}
                  {contenido.tamanyo_texto_min && contenido.tamanyo_texto_max && (
                    <p className="text-xs text-gray-400 mt-1">
                      Extensión objetivo: {contenido.tamanyo_texto_min}–{contenido.tamanyo_texto_max} palabras
                    </p>
                  )}
                </div>

                {/* Tarjetas de modo */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
                  {/* Modo 1: Generar borrador con IA */}
                  <button
                    onClick={handleGenerarBorrador}
                    disabled={generandoBorrador}
                    className="group relative flex flex-col items-center text-center gap-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-5 py-7 hover:border-indigo-400 hover:bg-indigo-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                      {generandoBorrador ? (
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                      ) : (
                        <Wand2 className="h-6 w-6 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-indigo-800">
                        {generandoBorrador ? 'Generando…' : 'Generar borrador'}
                      </p>
                      <p className="text-xs text-indigo-600 mt-1 leading-relaxed">
                        {generandoBorrador
                          ? 'El agente está redactando. Puede tardar 30–60 s.'
                          : 'IA genera el artículo completo a partir del brief y la keyword'}
                      </p>
                    </div>
                    <span className="absolute top-3 right-3 text-[10px] font-bold text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded-full">
                      Recomendado
                    </span>
                  </button>

                  {/* Modo 2: Escribir con Copiloto */}
                  <Link
                    href={`/copiloto?contenido=${contenido.id}&modo=copiloto`}
                    className="group flex flex-col items-center text-center gap-3 rounded-2xl border-2 border-violet-200 bg-violet-50 px-5 py-7 hover:border-violet-400 hover:bg-violet-100 transition-all"
                  >
                    <div className="h-12 w-12 rounded-xl bg-violet-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                      <Bot className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-violet-800">Escribir con Copiloto</p>
                      <p className="text-xs text-violet-600 mt-1 leading-relaxed">
                        Redacta de forma interactiva con el asistente de IA
                      </p>
                    </div>
                  </Link>

                  {/* Modo 3: Editor libre */}
                  <button
                    onClick={() => setShowWelcome(false)}
                    className="group flex flex-col items-center text-center gap-3 rounded-2xl border-2 border-gray-200 bg-white px-5 py-7 hover:border-gray-300 hover:bg-gray-50 transition-all"
                  >
                    <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                      <PenLine className="h-6 w-6 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-700">Editor libre</p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        Escribe o pega el texto tú mismo
                      </p>
                    </div>
                  </button>
                </div>

                {/* Error al generar */}
                {errorBorrador && (
                  <p className="mt-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-lg mx-auto text-center">
                    {errorBorrador}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
          <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">
                Texto del artículo
                {contenido.tamanyo_texto_min && contenido.tamanyo_texto_max && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    (objetivo: {contenido.tamanyo_texto_min}–{contenido.tamanyo_texto_max} palabras)
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {textoGuardado && <span className="text-xs text-green-600 font-medium">Guardado</span>}
                <Button size="sm" onClick={handleGuardarTexto} disabled={guardandoTexto}>
                  {guardandoTexto ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escribe o pega el texto del artículo aquí..."
                className="w-full min-h-[420px] rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-y font-mono leading-relaxed transition-colors"
              />
              {texto && (
                <p className="text-xs text-gray-400 mt-2 text-right">
                  ~{Math.round(texto.split(/\s+/).filter(Boolean).length)} palabras
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Barra de acciones — solo en pendiente / borrador ── */}
          {texto.trim() && (estado === 'pendiente' || estado === 'borrador') && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              {/* Checkbox de revisión */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={heRevisado}
                  onChange={(e) => setHeRevisado(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">
                  He leído y revisado el contenido completo
                </span>
              </label>

              {/* Botones de acción */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMostrarConfirmEnvio(!mostrarConfirmEnvio)}
                  disabled={cambiandoEstado}
                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  Enviar a revisión SEO
                </Button>
                <Button
                  size="sm"
                  disabled={!heRevisado || cambiandoEstado}
                  onClick={handleAprobar}
                  className="bg-green-600 hover:bg-green-700 text-white gap-1.5 disabled:opacity-40"
                >
                  {cambiandoEstado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Marcar como revisado y aprobar
                </Button>
              </div>

              {/* Confirmación inline — envío a revisión SEO */}
              {mostrarConfirmEnvio && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 flex-wrap">
                  <p className="text-sm text-blue-800 flex-1">
                    ¿Enviar este contenido al consultor SEO?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        handleCambiarEstado('revision_seo')
                        setMostrarConfirmEnvio(false)
                      }}
                      disabled={cambiandoEstado}
                      className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                    >
                      {cambiandoEstado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Sí, enviar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMostrarConfirmEnvio(false)}
                      disabled={cambiandoEstado}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          </>
          )}
        </TabsContent>

        {/* ── Tab 3: Revisiones ── */}
        <TabsContent value="revisiones">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">
                Revisiones e informes ({conversaciones.length})
              </CardTitle>
              <Button
                size="sm"
                className="gap-1.5 bg-violet-600 hover:bg-violet-700"
                onClick={() => setModalRevisar(true)}
              >
                <Sparkles className="h-3.5 w-3.5" />Revisar con IA
              </Button>
            </CardHeader>
            <CardContent>
              {conversaciones.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
                    <MessageSquare className="h-7 w-7 text-violet-400" />
                  </div>
                  <p className="text-gray-700 font-semibold">Sin revisiones todavía</p>
                  <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                    Usa el agente Revisor GEO-SEO para analizar el artículo y obtener un informe de mejora.
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-5">
                    <Button
                      className="gap-2 bg-violet-600 hover:bg-violet-700"
                      onClick={() => setModalRevisar(true)}
                    >
                      <Sparkles className="h-4 w-4" />Revisar con IA
                    </Button>
                    <Button variant="outline" className="gap-2" asChild>
                      <Link href={`/copiloto?contenido=${contenido.id}`}>
                        <Sparkles className="h-4 w-4" />Abrir copiloto
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {conversaciones.map((conv) => {
                    const agenteLabel = AGENTE_LABELS[conv.modelo] ?? conv.modelo
                    const agenteColor = AGENTE_COLORS[conv.modelo] ?? 'bg-gray-100 text-gray-700'
                    const respuesta = conv.mensajes.find(
                      (m) => getMensajeRole(m) === 'assistant' || getMensajeRole(m) === 'asistente'
                    )
                    const respuestaTexto = respuesta ? getMensajeContent(respuesta) : null

                    return (
                      <div key={conv.id} className="rounded-xl border border-gray-200 overflow-hidden">
                        {/* Cabecera de la revisión */}
                        <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b border-gray-200">
                          <div className="flex items-center gap-3">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${agenteColor}`}>
                              {agenteLabel}
                            </span>
                            <span className="text-xs text-gray-500 flex items-center gap-1.5">
                              <Clock className="h-3 w-3" />
                              {formatearFechaRelativa(conv.created_at)}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">
                            {conv.mensajes.length} mensaje{conv.mensajes.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Informe del agente */}
                        {respuestaTexto ? (
                          <div className="p-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                              Informe del agente
                            </p>
                            {(() => {
                              // Intentar parsear como JSON — si lo es, renderiza el dashboard visual
                              const cleaned = respuestaTexto
                                .replace(/^```json\s*/i, '')
                                .replace(/^```\s*/i, '')
                                .replace(/```\s*$/i, '')
                                .trim()
                              try {
                                JSON.parse(cleaned)
                                // JSON válido → dashboard visual
                                return (
                                  <InformeRevisionDashboard
                                    informe={respuestaTexto}
                                    fecha={formatearFechaRelativa(conv.created_at)}
                                    agente={agenteLabel}
                                  />
                                )
                              } catch {
                                // Texto plano → <pre> con scroll
                                return (
                                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed bg-white rounded-lg border border-gray-100 p-4 max-h-[500px] overflow-y-auto">
                                    {respuestaTexto}
                                  </pre>
                                )
                              }
                            })()}
                          </div>
                        ) : (
                          <p className="px-4 py-3 text-sm text-gray-400">Sin respuesta del agente.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Entrega ── */}
        <TabsContent value="entrega">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Datos de entrega</CardTitle>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setModalEntrega(true)}>
                Editar
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field label="URL publicado">
                {contenido.url_publicado ? (
                  <a
                    href={contenido.url_publicado}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />{contenido.url_publicado}
                  </a>
                ) : undefined}
              </Field>
              <Separator />
              <Field label="Link en Drive">
                {contenido.link_drive ? (
                  <a
                    href={contenido.link_drive}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />Abrir en Drive
                  </a>
                ) : undefined}
              </Field>
              {contenido.url_destino && (
                <>
                  <Separator />
                  <Field label="URL destino SEO">
                    <span className="text-gray-700 font-mono text-xs">{contenido.url_destino}</span>
                  </Field>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal entrega */}
      <EditarEntregaModal
        contenidoId={contenido.id}
        urlPublicado={contenido.url_publicado}
        linkDrive={contenido.link_drive}
        open={modalEntrega}
        onClose={() => setModalEntrega(false)}
      />

      {/* Modal brief IA */}
      <GenerarBriefModal
        contenidoId={contenido.id}
        tieneBrief={!!contenido.brief}
        open={modalBrief}
        onClose={() => setModalBrief(false)}
      />

      {/* Modal revisor GEO-SEO */}
      <RevisarConIAModal
        contenidoId={contenido.id}
        brief={contenido.brief}
        open={modalRevisar}
        onClose={() => setModalRevisar(false)}
        textoContenido={texto}
      />

      {/* Modal publicar */}
      <Dialog open={modalPublicar} onOpenChange={(v) => !v && !cambiandoEstado && setModalPublicar(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como publicado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-500">
              Introduce la URL donde se ha publicado el contenido. Puedes dejarla vacía si aún no tienes la URL.
            </p>
            <div className="space-y-1.5">
              <Label>URL de publicación</Label>
              <Input
                value={urlParaPublicar}
                onChange={(e) => setUrlParaPublicar(e.target.value)}
                placeholder="https://blog.empresa.com/articulo-..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalPublicar(false)}
              disabled={cambiandoEstado}
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePublicar}
              disabled={cambiandoEstado}
              className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
            >
              {cambiandoEstado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmar publicación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
