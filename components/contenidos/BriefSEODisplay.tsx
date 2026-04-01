'use client'

import ReactMarkdown from 'react-markdown'
import {
  Search, Target, Hash, Link2, BookOpen,
  Lightbulb, AlignLeft, ExternalLink, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  texto: string
  className?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

interface Seccion {
  titulo: string
  tituloNorm: string
  contenido: string
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

function parsearSecciones(texto: string): { cabecera: string; secciones: Seccion[] } {
  const lineas = texto.split('\n')
  let cabecera = ''
  const secciones: Seccion[] = []
  let actual: Seccion | null = null

  for (const linea of lineas) {
    const h2 = linea.match(/^##\s+(.+)/)
    const h3 = linea.match(/^###\s+(.+)/)

    if (h3) {
      if (actual) secciones.push(actual)
      const titulo = h3[1].trim()
      actual = { titulo, tituloNorm: normalizar(titulo), contenido: '' }
    } else if (h2) {
      if (actual) { secciones.push(actual); actual = null }
      cabecera += linea + '\n'
    } else if (actual) {
      actual.contenido += linea + '\n'
    } else {
      cabecera += linea + '\n'
    }
  }
  if (actual) secciones.push(actual)
  return { cabecera, secciones }
}

function detectarTipo(norm: string): string {
  if (/keyword\s*principal/.test(norm)) return 'keyword'
  if (/titulo|metadatos|meta/.test(norm)) return 'metadatos'
  if (/keyword.*secund|secund.*keyword|palabras.*clave|keywords/.test(norm)) return 'keywords_sec'
  if (/estructura|encabezado|heading/.test(norm)) return 'estructura'
  if (/fuentes|referencias/.test(norm)) return 'fuentes'
  if (/enlace|link/.test(norm)) return 'enlaces'
  if (/objetivo/.test(norm)) return 'objetivo'
  if (/formato|estilo/.test(norm)) return 'formato'
  if (/nota|redactor/.test(norm)) return 'notas'
  return 'generic'
}

/** Extrae pares **Clave:** valor de un bloque de texto */
function parsearKV(contenido: string): { clave: string; valor: string }[] {
  const kvs: { clave: string; valor: string }[] = []
  for (const linea of contenido.split('\n')) {
    const m = linea.match(/[-*]?\s*\*\*([^*]+)\*\*[:\s]+(.+)/)
    if (m) kvs.push({ clave: m[1].trim(), valor: m[2].trim() })
  }
  return kvs
}

/**
 * FIX 1 — Extrae la keyword principal del contenido de la sección.
 * Soporta tres formatos:
 *   · **SUGERIDA: cómo aprender inglés**   (valor dentro del bold, con prefijo "SUGERIDA:")
 *   · **oposiciones policía nacional**      (bold directo, sin ":")
 *   · Keyword principal: texto              (KV clásico)
 */
function extraerKeywordPrincipal(contenido: string): string {
  // Formato A: **SUGERIDA: texto** (o **KEYWORD: texto**)
  const mSugerida = contenido.match(/\*\*(?:SUGERIDA|KEYWORD)[:\s]+([^*]+)\*\*/i)
  if (mSugerida) return mSugerida[1].trim()

  // Formato B: **texto sin dos puntos** en línea propia → es la keyword directa
  for (const linea of contenido.split('\n')) {
    const stripped = linea.replace(/^[-*•\s]+/, '').trim()
    const mBold = stripped.match(/^\*\*([^*:]+)\*\*\s*$/)
    if (mBold) return mBold[1].trim()
  }

  // Formato C: KV clásico "**Keyword principal:** texto"
  const kvs = parsearKV(contenido)
  const kwEntry = kvs.find((kv) => /keyword|palabra|kw/i.test(kv.clave))
  if (kwEntry) return kwEntry.valor

  // Formato D: primera línea no vacía que no tenga estructura de KV
  for (const linea of contenido.split('\n')) {
    const txt = linea.replace(/^[-*•\s]+/, '').replace(/\*\*/g, '').trim()
    if (txt && !txt.includes('**') && !/^[A-ZÁÉÍÓÚ][^:]{0,30}:/.test(txt)) return txt
  }

  return ''
}

/** Extrae lista numerada o de bullets */
function parsearLista(contenido: string): string[] {
  const items: string[] = []
  for (const linea of contenido.split('\n')) {
    const m = linea.match(/^[-*•]?\s*\d*[.)]\s+(.+)/) ?? linea.match(/^[-*•]\s+(.+)/)
    if (m) items.push(m[1].trim())
  }
  return items
}

/**
 * FIX 3 — Extrae fuentes limpiando números duplicados.
 * Caso problemático: "1. 1https://..." → el parser captura "1https://..." porque el Dify
 * ya venía con "1. 1. https://..." o la línea tiene formato "1. [1] https://..."
 * Eliminamos cualquier número/[número] residual al inicio del texto capturado.
 */
function parsearFuentes(contenido: string): string[] {
  return parsearLista(contenido).map((item) =>
    item
      .replace(/^\d+[\.\)]\s*/, '')   // quita "1. " o "1) " al inicio
      .replace(/^\[\d+\]\s*/, '')      // quita "[1] " al inicio
      .trim()
  )
}

/** Extrae keywords separadas por comas o en lista */
function parsearKeywordsSec(contenido: string): string[] {
  const texto = contenido.replace(/^[-*]\s+/gm, '').trim()
  if (texto.includes(',')) return texto.split(',').map((k) => k.trim()).filter(Boolean)
  return parsearLista(contenido).flatMap((l) => l.split(',')).map((k) => k.trim()).filter(Boolean)
}

interface LineaEstructura {
  nivel: 1 | 2 | 3
  texto: string
}

/**
 * FIX 2 — Parser de estructura ampliado.
 * Soporta todos los formatos habituales del agente Dify:
 *   · H1: texto / H2: texto / H3: texto
 *   · **H1:** texto / **H2:** texto / **H3:** texto
 *   · **H1: texto** / **H2: texto** / **H3: texto**   ← nuevo
 *   · # título / ## título / ### título (markdown headings)
 */
function parsearEstructura(contenido: string): LineaEstructura[] {
  const items: LineaEstructura[] = []

  for (const linea of contenido.split('\n')) {
    // Formato A: "H1: texto", "H2: texto", "  H3: texto" (texto plano con prefijo)
    const mH1a = linea.match(/^[-*\s]*H1[:\-]\s*(.+)/i)
    const mH2a = linea.match(/^[-*\s]*H2[:\-]\s*(.+)/i)
    const mH3a = linea.match(/^[-*\s]*H3[:\-]\s*(.+)/i)

    // Formato B: "- **H1:** texto" (bold con dos puntos fuera)
    const mH1b = linea.match(/\*\*H1[:\-]\*\*\s*(.+)/i)
    const mH2b = linea.match(/\*\*H2[:\-]\*\*\s*(.+)/i)
    const mH3b = linea.match(/\*\*H3[:\-]\*\*\s*(.+)/i)

    // Formato C: "**H1: texto**" (todo dentro del bold)
    const mH1c = linea.match(/\*\*H1[:\-]\s*(.+?)\*\*/i)
    const mH2c = linea.match(/\*\*H2[:\-]\s*(.+?)\*\*/i)
    const mH3c = linea.match(/\*\*H3[:\-]\s*(.+?)\*\*/i)

    // Formato D: markdown headings "# título" / "## título" / "### título"
    const mH1d = linea.match(/^#(?!#)\s+(.+)/)
    const mH2d = linea.match(/^##(?!#)\s+(.+)/)
    const mH3d = linea.match(/^###(?!#)\s+(.+)/)

    const texto =
      (mH1a ?? mH1b ?? mH1c ?? mH1d)?.[1]?.replace(/\*\*/g, '').trim() ??
      (mH2a ?? mH2b ?? mH2c ?? mH2d)?.[1]?.replace(/\*\*/g, '').trim() ??
      (mH3a ?? mH3b ?? mH3c ?? mH3d)?.[1]?.replace(/\*\*/g, '').trim() ??
      null

    const nivel: 0 | 1 | 2 | 3 =
      (mH1a || mH1b || mH1c || mH1d) ? 1 :
      (mH2a || mH2b || mH2c || mH2d) ? 2 :
      (mH3a || mH3b || mH3c || mH3d) ? 3 : 0

    if (texto && nivel) items.push({ nivel: nivel as 1 | 2 | 3, texto })
  }

  return items
}

function esUrl(s: string): boolean {
  return /^https?:\/\//.test(s.trim())
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes visuales
// ─────────────────────────────────────────────────────────────────────────────

function SeccionTitulo({
  icono: Icono,
  titulo,
  className,
}: {
  icono?: React.ElementType
  titulo: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2 mb-3', className)}>
      {Icono && <Icono className="h-4 w-4 shrink-0 text-gray-400" />}
      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">{titulo}</h3>
    </div>
  )
}

// — Cabecera ──────────────────────────────────────────────────────────────────

function CabeceraCard({ texto }: { texto: string }) {
  const tituloMatch = texto.match(/^##\s+(.+)/m)
  const tituloBrief = tituloMatch ? tituloMatch[1].replace(/^brief.*?[—\-]\s*/i, '').trim() : ''
  const kvs = parsearKV(texto)

  if (!tituloBrief && kvs.length === 0) return null

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
      {tituloBrief && (
        <p className="text-sm font-semibold text-indigo-800 mb-3 leading-snug">{tituloBrief}</p>
      )}
      {kvs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {kvs.map(({ clave, valor }) => (
            <span
              key={clave}
              className="inline-flex items-center gap-1 rounded-full bg-white border border-indigo-200 px-3 py-1 text-xs text-indigo-700"
            >
              <span className="font-semibold">{clave}:</span>
              <span className="text-indigo-600">{valor}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// — Keyword principal ─────────────────────────────────────────────────────────

const COLORES_KV: Record<string, string> = {
  tipo: 'bg-blue-100 text-blue-700',
  volumen: 'bg-green-100 text-green-700',
  intencion: 'bg-purple-100 text-purple-700',
  serp: 'bg-orange-100 text-orange-700',
  featured: 'bg-yellow-100 text-yellow-700',
}
function colorKV(clave: string): string {
  const norm = normalizar(clave)
  for (const [k, cls] of Object.entries(COLORES_KV)) {
    if (norm.includes(k)) return cls
  }
  return 'bg-gray-100 text-gray-700'
}

function SeccionKeyword({ seccion }: { seccion: Seccion }) {
  // FIX 1: usar el extractor específico en lugar de parsearKV
  const keyword = extraerKeywordPrincipal(seccion.contenido)

  // Los badges de metadata (tipo, volumen, etc.) siguen viniendo de KV clásicos
  const kvs = parsearKV(seccion.contenido).filter(
    (kv) => !/keyword|palabra|kw|sugerida/i.test(kv.clave)
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SeccionTitulo icono={Search} titulo={seccion.titulo} />
      {keyword && (
        <p className="text-2xl font-bold text-gray-900 mb-3 leading-tight">{keyword}</p>
      )}
      {kvs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {kvs.map(({ clave, valor }) => (
            <span
              key={clave}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium',
                colorKV(clave)
              )}
            >
              <span className="opacity-70">{clave}:</span> {valor}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// — Keywords secundarias ──────────────────────────────────────────────────────

function SeccionKeywordsSec({ seccion }: { seccion: Seccion }) {
  const keywords = parsearKeywordsSec(seccion.contenido)
  if (keywords.length === 0) return <SeccionGenerica seccion={seccion} />

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SeccionTitulo icono={Hash} titulo={seccion.titulo} />
      <div className="flex flex-wrap gap-2">
        {keywords.map((k) => (
          <span
            key={k}
            className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  )
}

// — Estructura de contenido ───────────────────────────────────────────────────

function SeccionEstructura({ seccion }: { seccion: Seccion }) {
  const items = parsearEstructura(seccion.contenido)
  if (items.length === 0) return <SeccionGenerica seccion={seccion} />

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SeccionTitulo icono={FileText} titulo={seccion.titulo} />
      {/* FIX 2: jerarquía visual explícita con indentaciones y marcadores */}
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div
            key={i}
            className={cn('flex items-start gap-2', {
              'ml-0':  item.nivel === 1,
              'ml-4':  item.nivel === 2,
              'ml-8':  item.nivel === 3,
            })}
          >
            {item.nivel === 1 && (
              <span className="mt-0.5 text-xs font-bold text-indigo-500 shrink-0 w-6">H1</span>
            )}
            {item.nivel === 2 && (
              <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-400 shrink-0 flex-none" />
            )}
            {item.nivel === 3 && (
              <span className="mt-1.5 text-gray-400 shrink-0 text-xs leading-none">—</span>
            )}
            <span
              className={cn('text-sm leading-snug', {
                'font-bold text-gray-900':   item.nivel === 1,
                'font-medium text-gray-700': item.nivel === 2,
                'text-gray-500':             item.nivel === 3,
              })}
            >
              {item.texto.replace(/^H[123]:\s*/i, '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// — Fuentes y referencias ─────────────────────────────────────────────────────

function SeccionFuentes({ seccion }: { seccion: Seccion }) {
  // FIX 3: usar parsearFuentes que limpia números residuales
  const items = parsearFuentes(seccion.contenido)
  if (items.length === 0) return <SeccionGenerica seccion={seccion} />

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SeccionTitulo icono={BookOpen} titulo={seccion.titulo} />
      <ol className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
              {i + 1}
            </span>
            {esUrl(item) ? (
              <a
                href={item}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline break-all"
              >
                {item}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="text-gray-700">{item}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

// — Enlaces obligatorios ──────────────────────────────────────────────────────

function SeccionEnlaces({ seccion }: { seccion: Seccion }) {
  const items = parsearLista(seccion.contenido)
  if (items.length === 0) return <SeccionGenerica seccion={seccion} />

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SeccionTitulo icono={Link2} titulo={seccion.titulo} />
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i}>
            {esUrl(item) ? (
              <a
                href={item}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline break-all"
              >
                <Link2 className="h-3 w-3 shrink-0" />
                {item}
              </a>
            ) : (
              <span className="text-sm text-gray-700">{item}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// — Notas para el redactor ────────────────────────────────────────────────────

function SeccionNotas({ seccion }: { seccion: Seccion }) {
  const items = parsearLista(seccion.contenido)
  if (items.length === 0) return <SeccionGenerica seccion={seccion} />

  return (
    // FIX 4: contenedor con fondo ámbar + borde izquierdo ámbar llamativo
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-amber-700">{seccion.titulo}</h3>
      </div>
      <div className="space-y-2">
        {items.map((nota, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-lg bg-white border-l-4 border-amber-400 pl-4 pr-3 py-2.5 shadow-sm"
          >
            <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-gray-800 leading-snug">{nota}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// — Objetivo del contenido y secciones genéricas ──────────────────────────────

const ICONOS_TIPO: Record<string, React.ElementType> = {
  objetivo: Target,
  metadatos: FileText,
  formato: AlignLeft,
  generic: AlignLeft,
}

function SeccionGenerica({ seccion, tipo }: { seccion: Seccion; tipo?: string }) {
  const Icono = ICONOS_TIPO[tipo ?? detectarTipo(seccion.tituloNorm)] ?? AlignLeft

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SeccionTitulo icono={Icono} titulo={seccion.titulo} />
      <div className="prose prose-sm max-w-none text-gray-700 [&>p]:leading-relaxed [&>ul]:mt-1 [&>ol]:mt-1">
        <ReactMarkdown>{seccion.contenido.trim()}</ReactMarkdown>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function BriefSEODisplay({ texto, className }: Props) {
  if (!texto?.trim()) return null

  try {
    const { cabecera, secciones } = parsearSecciones(texto)

    if (secciones.length === 0) {
      // Sin secciones detectadas → ReactMarkdown completo como fallback
      throw new Error('sin secciones')
    }

    return (
      <div className={cn('space-y-3', className)}>
        <CabeceraCard texto={cabecera} />

        {secciones.map((s, i) => {
          const tipo = detectarTipo(s.tituloNorm)
          switch (tipo) {
            case 'keyword':
              return <SeccionKeyword key={i} seccion={s} />
            case 'keywords_sec':
              return <SeccionKeywordsSec key={i} seccion={s} />
            case 'estructura':
              return <SeccionEstructura key={i} seccion={s} />
            case 'fuentes':
              return <SeccionFuentes key={i} seccion={s} />
            case 'enlaces':
              return <SeccionEnlaces key={i} seccion={s} />
            case 'notas':
              return <SeccionNotas key={i} seccion={s} />
            default:
              return <SeccionGenerica key={i} seccion={s} tipo={tipo} />
          }
        })}
      </div>
    )
  } catch {
    // Fallback total: ReactMarkdown con estilos base
    return (
      <div
        className={cn(
          'prose prose-sm max-w-none text-gray-800',
          '[&>h2]:text-base [&>h2]:font-bold [&>h2]:mt-4 [&>h2]:mb-2',
          '[&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mt-3 [&>h3]:mb-1.5',
          '[&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5',
          '[&>p]:leading-relaxed [&>hr]:my-3',
          className
        )}
      >
        <ReactMarkdown>{texto}</ReactMarkdown>
      </div>
    )
  }
}
