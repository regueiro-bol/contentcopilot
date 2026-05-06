import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import type { ArticuloDetectado } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// PASO 1 — Mapa de estilos: styleId → nivel de heading (1/2/3)
// Leemos word/styles.xml para saber qué estilos son encabezados,
// independientemente del idioma del documento (Heading1, Título 1, etc.)
// ─────────────────────────────────────────────────────────────────────────────

function construirMapaEstilos(xml: string): Map<string, number> {
  const mapa = new Map<string, number>()
  if (!xml) return mapa

  // Cada bloque <w:style ...>...</w:style>
  const styleBlocks = xml.match(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g) ?? []

  for (const block of styleBlocks) {
    const idMatch = block.match(/w:styleId="([^"]*)"/)
    if (!idMatch) continue
    const styleId = idMatch[1]

    // Método 1 (más fiable): <w:outlineLvl w:val="N"/>
    //   0 → H1, 1 → H2, 2 → H3
    const outlineMatch = block.match(/<w:outlineLvl\s+w:val="(\d+)"/)
    if (outlineMatch) {
      const lvl = parseInt(outlineMatch[1])
      if (lvl <= 2) mapa.set(styleId, lvl + 1)
      continue
    }

    // Método 2 (fallback): nombre del estilo
    const nameMatch = block.match(/<w:name\s+w:val="([^"]*)"/)
    if (nameMatch) {
      const name = nameMatch[1].toLowerCase().replace(/[\s_\-]/g, '')
      if (/^(heading1|h1|titulo1|t[ií]tulo1|berschrift1|rubric1|naglov1|overschrift1|otsikko1|niv1)/.test(name)) {
        mapa.set(styleId, 1)
      } else if (/^(heading2|h2|titulo2|t[ií]tulo2|berschrift2)/.test(name)) {
        mapa.set(styleId, 2)
      } else if (/^(heading3|h3|titulo3|t[ií]tulo3|berschrift3)/.test(name)) {
        mapa.set(styleId, 3)
      }
    }
  }

  return mapa
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 2 — Mapa de comentarios: commentId → texto
// Leemos word/comments.xml
// ─────────────────────────────────────────────────────────────────────────────

function construirMapaComentarios(xml: string): Map<string, string> {
  const mapa = new Map<string, string>()
  if (!xml) return mapa

  const bloques = xml.match(/<w:comment\b[^>]*>[\s\S]*?<\/w:comment>/g) ?? []
  for (const bloque of bloques) {
    const idMatch = bloque.match(/w:id="([^"]*)"/)
    if (!idMatch) continue

    const textos = bloque.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []
    const texto = textos
      .map((t) => t.replace(/<[^>]+>/g, ''))
      .join('')
      .trim()

    if (texto) mapa.set(idMatch[1], texto)
  }

  return mapa
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 3 — Parseo de párrafos desde word/document.xml
// Para cada <w:p> extraemos: estilo, nivel heading, texto y refs a comentarios
// ─────────────────────────────────────────────────────────────────────────────

interface ParrafoDoc {
  estilo: string      // valor bruto de w:pStyle (ej. "Titulo1", "Heading1", "Normal")
  nivel: number       // 0 = cuerpo, 1 = H1, 2 = H2, 3 = H3
  texto: string
  commentIds: string[]
}

function parsearParrafos(xml: string, mapaEstilos: Map<string, number>): ParrafoDoc[] {
  const parrafos: ParrafoDoc[] = []

  // <w:p> no anida dentro de otros <w:p>, así que la regex lazy es segura
  const parrafoBlocks = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []

  for (const block of parrafoBlocks) {
    // ── Determinar nivel heading ──────────────────────────────────────────
    // Primero buscamos el estilo explícito del párrafo
    const estiloMatch = block.match(/<w:pStyle\s+w:val="([^"]*)"/)
    const estilo = estiloMatch ? estiloMatch[1] : 'Normal'

    // <w:outlineLvl> directamente en <w:pPr> del párrafo (sobreescribe estilo)
    const outlineEnParaMatch = block.match(/<w:pPr>[\s\S]*?<w:outlineLvl\s+w:val="(\d+)"/)
    let nivel: number
    if (outlineEnParaMatch) {
      const lvl = parseInt(outlineEnParaMatch[1])
      nivel = lvl <= 2 ? lvl + 1 : 0
    } else {
      nivel = mapaEstilos.get(estilo) ?? 0
    }

    // ── Extraer texto ─────────────────────────────────────────────────────
    // Concatena todos los <w:t> del párrafo
    const textoMatches = block.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []
    let texto = textoMatches
      .map((t) => t.replace(/<[^>]+>/g, ''))
      .join('')
      .trim()

    // ── Detección por prefijo de texto: H1: / H2: / H3: ──────────────────
    // Muchos documentos editoriales usan párrafos Normal con prefijos literales
    // "H1:", "H2:", "H3:" en lugar de aplicar estilos Word.
    // Esta detección tiene PRIORIDAD sobre el estilo (más fiable en esos casos).
    const prefixMatch = texto.match(/^(H[123]):\s*/i)
    if (prefixMatch) {
      nivel = parseInt(prefixMatch[1].charAt(1))   // "H1" → 1, "H2" → 2, "H3" → 3
      texto = texto.slice(prefixMatch[0].length).trim()  // quitar el prefijo del título
    }

    // ── Extraer referencias a comentarios ────────────────────────────────
    // Capturamos TANTO <w:commentReference> (el ancla final) COMO
    // <w:commentRangeStart> (el inicio del rango destacado).
    // Word coloca el commentReference en el último párrafo del rango, pero el
    // texto comentado puede empezar varios párrafos antes. Usando RangeStart
    // asociamos el comentario al artículo donde EMPIEZA el texto comentado.
    const refRaw = [
      ...(block.match(/<w:commentReference\s+w:id="([^"]*)"/g) ?? []),
      ...(block.match(/<w:commentRangeStart\s+w:id="([^"]*)"/g) ?? []),
    ]
    const commentIds = refRaw
      .map((r) => {
        const m = r.match(/w:id="([^"]*)"/)
        return m ? m[1] : ''
      })
      .filter((id, idx, arr) => id && arr.indexOf(id) === idx) // deduplicar

    // Ignorar párrafos vacíos sin comentarios relevantes
    if (!texto && commentIds.length === 0) continue

    parrafos.push({ estilo, nivel, texto, commentIds })
  }

  return parrafos
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 4 — Agrupar párrafos en artículos
// Cada H1 abre un artículo nuevo. Los H2/H3 y cuerpo se acumulan hasta el
// siguiente H1. Los comentarios se asocian al artículo donde aparece su ref.
// ─────────────────────────────────────────────────────────────────────────────

function detectarKeyword(titulo: string, comentarios: string[]): string {
  for (const c of comentarios) {
    const m = c.match(/(?:keyword|kw|palabra\s*clave)[:\s]+([^\n,;|]+)/i)
    if (m) return m[1].trim()
  }
  return titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

function agruparArticulos(
  parrafos: ParrafoDoc[],
  mapaComentarios: Map<string, string>
): ArticuloDetectado[] {
  const articulos: ArticuloDetectado[] = []

  interface ArticuloWip {
    titulo: string
    hLineas: string[]
    commentIds: Set<string>
  }

  let actual: ArticuloWip | null = null

  function cerrar() {
    if (!actual) return
    const ids = Array.from(actual.commentIds)
    const comentarios = ids
      .map((id) => mapaComentarios.get(id))
      .filter((c): c is string => !!c)

    // ── LOG por artículo ─────────────────────────────────────────────────
    console.log(
      '[DOCX] Artículo:', actual.titulo.substring(0, 60),
      '- comentarios asignados:', comentarios.length,
      '- IDs:', ids
    )

    articulos.push({
      titulo: actual.titulo,
      estructuraH: actual.hLineas.join('\n'),
      comentarios,
      keyword: detectarKeyword(actual.titulo, comentarios),
    })
    actual = null
  }

  for (const p of parrafos) {
    if (p.nivel === 1 && p.texto) {
      cerrar()
      actual = { titulo: p.texto, hLineas: [], commentIds: new Set(p.commentIds) }
    } else if (p.nivel === 2 && p.texto) {
      if (actual) {
        actual.hLineas.push(`H2: ${p.texto}`)
        p.commentIds.forEach((id) => actual!.commentIds.add(id))
      } else {
        // FIX 4: log H2 descartados por falta de artículo activo
        console.log('[DOCX] H2 DESCARTADO (sin H1 previo):', p.texto.substring(0, 80))
      }
    } else if (p.nivel === 3 && p.texto) {
      if (actual) {
        actual.hLineas.push(`  H3: ${p.texto}`)
        p.commentIds.forEach((id) => actual!.commentIds.add(id))
      } else {
        console.log('[DOCX] H3 DESCARTADO (sin H1 previo):', p.texto.substring(0, 80))
      }
    } else if (actual) {
      // Párrafo de cuerpo: solo recogemos sus refs de comentarios
      p.commentIds.forEach((id) => actual!.commentIds.add(id))
    }
  }

  cerrar()
  return articulos
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/pedidos/procesar-docx
 *
 * Recibe un DOCX y devuelve los artículos detectados usando parsing XML directo:
 *   1. word/styles.xml  → mapea estilos a niveles H1/H2/H3 (incluye estilos en español)
 *   2. word/comments.xml → extrae texto de cada comentario Word
 *   3. word/document.xml → recorre párrafos, detecta headings y ancla comentarios
 *      a su artículo concreto mediante <w:commentReference>
 *
 * Body (FormData):
 *   file — archivo .docx (máx. 20 MB)
 *
 * Response:
 *   { articulos: ArticuloDetectado[], debug: { totalH1, totalParrafos, stylesDetectados } }
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo supera los 20 MB' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()

    // ── Abrir el DOCX como ZIP ────────────────────────────────────────────
    const zip = await JSZip.loadAsync(arrayBuffer)

    const stylesXml    = (await zip.file('word/styles.xml')?.async('text'))   ?? ''
    const commentsXml  = (await zip.file('word/comments.xml')?.async('text')) ?? ''
    const documentXml  = (await zip.file('word/document.xml')?.async('text')) ?? ''

    if (!documentXml) {
      return NextResponse.json(
        { error: 'El archivo no parece un DOCX válido (word/document.xml no encontrado)' },
        { status: 400 }
      )
    }

    // ── Construir mapas ───────────────────────────────────────────────────
    const mapaEstilos      = construirMapaEstilos(stylesXml)
    const mapaComentarios  = construirMapaComentarios(commentsXml)

    // ── LOG 1: mapa de estilos completo ──────────────────────────────────
    console.log('[DOCX] Mapa de estilos:', JSON.stringify(Object.fromEntries(mapaEstilos.entries())))

    // ── LOG comentarios: total e IDs en el XML ───────────────────────────
    console.log('[DOCX] Total comentarios en XML:', mapaComentarios.size)
    console.log('[DOCX] IDs de comentarios:', Array.from(mapaComentarios.keys()))
    Array.from(mapaComentarios.entries()).forEach(([id, txt]) =>
      console.log(`[DOCX]   comentario id=${id}: "${txt.substring(0, 80)}"`)
    )

    // ── Parsear párrafos y agrupar en artículos ───────────────────────────
    const parrafos  = parsearParrafos(documentXml, mapaEstilos)
    const articulos = agruparArticulos(parrafos, mapaComentarios)

    // ── LOG 2: primeros 20 párrafos con estilo y nivel detectado ─────────
    console.log('[DOCX] Primeros 20 párrafos:',
      JSON.stringify(
        parrafos.slice(0, 20).map((p) => ({
          estilo: p.estilo,
          nivel: p.nivel,
          texto: p.texto?.substring(0, 50),
        }))
      )
    )

    // ── LOG 3: conteo de H1 y sus textos ─────────────────────────────────
    // nivel === 0 → cuerpo (body), nivel === 1 → H1 en nuestro mapeo
    // Logueamos ambos para detectar si los H1 se están cayendo a nivel 0
    console.log('[DOCX] H1 detectados (nivel=1):', parrafos.filter((p) => p.nivel === 1).length)
    console.log('[DOCX] Textos nivel=1:', parrafos.filter((p) => p.nivel === 1).map((p) => p.texto))
    console.log('[DOCX] H1 detectados (nivel=0 — los que pide el user):', parrafos.filter((p) => p.nivel === 0).length)
    console.log('[DOCX] Estilos únicos en el documento:', Array.from(new Set(parrafos.map((p) => p.estilo))))

    // Info de diagnóstico (útil en desarrollo)
    const totalH1 = parrafos.filter((p) => p.nivel === 1).length
    const stylesDetectados = Object.fromEntries(mapaEstilos.entries())

    console.log(`[procesar-docx] ${file.name}: ${totalH1} H1s, ${parrafos.length} párrafos, ${mapaComentarios.size} comentarios`)

    return NextResponse.json({
      articulos,
      debug: {
        totalH1,
        totalParrafos: parrafos.length,
        totalComentarios: mapaComentarios.size,
        stylesDetectados,
      },
    })
  } catch (error) {
    console.error('[procesar-docx] Error:', error)
    return NextResponse.json({ error: 'Error al procesar el documento' }, { status: 500 })
  }
}
