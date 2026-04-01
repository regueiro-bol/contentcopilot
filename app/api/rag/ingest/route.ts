import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import mammoth from 'mammoth'
import Papa from 'papaparse'
import JSZip from 'jszip'
import { createAdminClient } from '@/lib/supabase/admin'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Constantes ───────────────────────────────────────────────────────────────

const CHUNK_SIZE    = 500  // palabras por chunk
const CHUNK_OVERLAP = 50   // palabras de solape entre chunks
const MIN_PALABRAS  = 50   // mínimo para no descartar artículo
const EMBED_BATCH   = 20   // chunks por llamada a OpenAI
const EMBED_DELAY   = 100  // ms entre lotes para no saturar la API

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ArticuloParseado {
  articulo_id : string
  titulo      : string
  contenido   : string
  metadatos   : Record<string, string>
}

interface ResultadoProcesamiento {
  procesados    : number
  chunks_totales: number
  errores       : string[]
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Elimina bloques Gutenberg <!-- wp:xxx --> y <!-- /wp:xxx --> */
function limpiarHtmlWordpress(html: string): string {
  return html
    .replace(/<!--\s*wp:[^>]*?-->/g, '')
    .replace(/<!--\s*\/wp:[^>]*?-->/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Divide texto en chunks de `tamano` palabras con `solapamiento` de solape */
function dividirEnChunks(
  texto     : string,
  tamano    : number = CHUNK_SIZE,
  solapamiento: number = CHUNK_OVERLAP,
): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let i = 0

  while (i < palabras.length) {
    const slice = palabras.slice(i, i + tamano)
    const chunk = slice.join(' ').trim()
    if (chunk.length > 50) chunks.push(chunk)
    i += tamano - solapamiento
    if (i + tamano > palabras.length && i < palabras.length) {
      // último fragmento residual
      const ultimo = palabras.slice(i).join(' ').trim()
      if (ultimo.length > 50 && ultimo !== chunks[chunks.length - 1]) {
        chunks.push(ultimo)
      }
      break
    }
  }

  return chunks
}

/** Genera embeddings para un array de textos (en batch) */
async function generarEmbeddings(textos: string[]): Promise<number[][]> {
  const inputs = textos.map((t) => t.slice(0, 8000)) // límite seguro
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: inputs,
  })
  return response.data.map((d) => d.embedding)
}

// ─── Persistencia en Supabase ──────────────────────────────────────────────────

async function guardarChunks(
  proyectoId  : string,
  documentoId : string,
  articulo    : ArticuloParseado,
  chunks      : string[],
): Promise<{ guardados: number; errores: string[] }> {
  const supabase = createAdminClient()
  let guardados = 0
  const errores: string[] = []

  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const lote = chunks.slice(i, i + EMBED_BATCH)

    try {
      const embeddings = await generarEmbeddings(lote)

      const rows = lote.map((chunk, j) => ({
        proyecto_id : proyectoId,
        // documento_id no existe en la tabla — guardamos el UUID en metadatos
        articulo_id : articulo.articulo_id,
        titulo      : articulo.titulo,
        contenido   : chunk,
        chunk_index : i + j,
        // pgvector espera el array number[] directamente, NO un string JSON
        embedding   : embeddings[j],
        metadatos   : {
          ...articulo.metadatos,
          documento_id: documentoId,       // UUID del DocumentoProyecto para poder filtrar
          total_chunks: String(chunks.length),
        },
      }))

      console.log(`[RAG] Insertando lote ${i}–${i + lote.length} (${lote.length} chunks) para "${articulo.titulo}"`)
      const { error } = await supabase.from('documentos_rag').insert(rows)
      if (error) {
        console.error(`[RAG] Error en INSERT:`, error.message, error.details, error.hint)
        errores.push(`Chunk ${i}–${i + lote.length}: ${error.message}`)
      } else {
        console.log(`[RAG] INSERT OK — ${lote.length} filas guardadas`)
        guardados += lote.length
      }
    } catch (err) {
      errores.push(
        `Chunk ${i}–${i + lote.length}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (i + EMBED_BATCH < chunks.length) await sleep(EMBED_DELAY)
  }

  return { guardados, errores }
}

// ─── Procesadores por tipo de archivo ─────────────────────────────────────────

/** CSV de exportación WordPress */
async function procesarCSVWordpress(
  buffer     : Buffer,
  proyectoId : string,
  documentoId: string,
): Promise<ResultadoProcesamiento> {
  const texto = buffer.toString('utf-8')
  let procesados = 0
  let chunks_totales = 0
  const errores: string[] = []

  await new Promise<void>((resolve, reject) => {
    Papa.parse<Record<string, string>>(texto, {
      header        : true,
      skipEmptyLines: true,
      async complete(results) {
        for (const row of results.data) {
          try {
            // Columnas: acepta variantes de nombre de campo
            const titulo = (
              row['post_title'] || row['Title'] || row['titulo'] || row['title'] || ''
            ).trim()
            const contenidoRaw =
              row['post_content'] || row['Content'] || row['contenido'] || row['content'] || ''
            const articuloId =
              row['ID'] || row['id'] || row['post_name'] || row['slug'] || String(procesados)
            const tipo = row['post_type'] || row['post_status'] || ''

            if (!titulo && !contenidoRaw.trim()) continue
            // Solo posts/páginas publicadas; ignorar borradores, attachments, etc.
            if (tipo && !['post', 'page', 'publish', 'publicado', ''].includes(tipo)) continue

            const contenidoLimpio = limpiarHtmlWordpress(contenidoRaw)
            if (contenidoLimpio.split(/\s+/).filter(Boolean).length < MIN_PALABRAS) continue

            const chunks = dividirEnChunks(contenidoLimpio)
            if (chunks.length === 0) continue

            const articulo: ArticuloParseado = {
              articulo_id: String(articuloId),
              titulo     : titulo || `Artículo ${articuloId}`,
              contenido  : contenidoLimpio,
              metadatos  : {
                fuente    : 'wordpress_csv',
                categorias: row['Categorías'] || row['Categories'] || row['categories'] || '',
                etiquetas : row['Etiquetas'] || row['Tags'] || row['tags'] || '',
                url       : row['guid'] || row['link'] || row['URL'] || '',
                fecha     : row['post_date'] || row['Date'] || '',
              },
            }

            const resultado = await guardarChunks(proyectoId, documentoId, articulo, chunks)
            procesados++
            chunks_totales += resultado.guardados
            errores.push(...resultado.errores)
          } catch (err) {
            errores.push(
              `Artículo ${procesados}: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
        resolve()
      },
      error: reject,
    })
  })

  return { procesados, chunks_totales, errores }
}

/** DOCX con mammoth */
async function procesarDOCX(
  buffer     : Buffer,
  nombre     : string,
  proyectoId : string,
  documentoId: string,
): Promise<ResultadoProcesamiento> {
  const errores: string[] = []

  try {
    const result  = await mammoth.extractRawText({ buffer })
    const textoRaw = result.value.trim()

    if (!textoRaw || textoRaw.split(/\s+/).filter(Boolean).length < MIN_PALABRAS) {
      return { procesados: 0, chunks_totales: 0, errores: ['Documento vacío o demasiado corto'] }
    }

    const lineas  = textoRaw.split('\n').map((l) => l.trim()).filter(Boolean)
    const titulo  = lineas[0] || nombre
    const cuerpo  = lineas.length > 1 ? lineas.slice(1).join(' ').trim() : textoRaw
    const chunks  = dividirEnChunks(cuerpo || textoRaw)

    if (chunks.length === 0) {
      return { procesados: 0, chunks_totales: 0, errores: ['Sin chunks generados'] }
    }

    const articulo: ArticuloParseado = {
      articulo_id: 'docx-0',
      titulo,
      contenido  : cuerpo,
      metadatos  : { fuente: 'docx', nombre_archivo: nombre },
    }

    const resultado = await guardarChunks(proyectoId, documentoId, articulo, chunks)
    errores.push(...resultado.errores)

    return { procesados: 1, chunks_totales: resultado.guardados, errores }
  } catch (err) {
    errores.push(err instanceof Error ? err.message : String(err))
    return { procesados: 0, chunks_totales: 0, errores }
  }
}

/** ZIP con varios .docx */
async function procesarZIPDocx(
  buffer     : Buffer,
  proyectoId : string,
  documentoId: string,
): Promise<ResultadoProcesamiento> {
  const zip = await JSZip.loadAsync(buffer)
  let procesados     = 0
  let chunks_totales = 0
  const errores: string[] = []

  const archivosDocx = Object.entries(zip.files).filter(
    ([nombre, file]) =>
      !file.dir &&
      (nombre.toLowerCase().endsWith('.docx') || nombre.toLowerCase().endsWith('.doc')),
  )

  if (archivosDocx.length === 0) {
    return {
      procesados: 0,
      chunks_totales: 0,
      errores: ['El ZIP no contiene archivos .docx'],
    }
  }

  for (const [nombre, file] of archivosDocx) {
    try {
      const arrayBuffer = await file.async('arraybuffer')
      const docBuffer   = Buffer.from(arrayBuffer)
      const resultado   = await procesarDOCX(docBuffer, nombre, proyectoId, documentoId)

      procesados     += resultado.procesados
      chunks_totales += resultado.chunks_totales
      errores.push(...resultado.errores.map((e) => `[${nombre}] ${e}`))
    } catch (err) {
      errores.push(`[${nombre}] ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { procesados, chunks_totales, errores }
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      proyecto_id      ?: string
      proyectoId       ?: string   // compatibilidad con llamadas anteriores
      documento_url    ?: string
      url              ?: string   // compatibilidad
      documento_nombre ?: string
      nombre           ?: string   // compatibilidad
      documento_id     ?: string
      documentoId      ?: string   // compatibilidad
      tipo             ?: 'csv_wordpress' | 'docx' | 'zip_docx' | 'txt'
    }

    // Normalizar nombres de campo (acepta ambas convenciones)
    const proyectoId  = body.proyecto_id   ?? body.proyectoId   ?? ''
    const documentoId = body.documento_id  ?? body.documentoId  ?? ''
    const url         = body.documento_url ?? body.url          ?? ''
    const nombre      = body.documento_nombre ?? body.nombre    ?? ''

    if (!proyectoId || !url) {
      return NextResponse.json({ error: 'Faltan parámetros: proyecto_id y documento_url son obligatorios' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // ── 1. Descargar el archivo ───────────────────────────────────────────────
    // El bucket es privado — no se puede hacer fetch() directo a la URL pública.
    // Extraemos el path de Storage de la URL y usamos el cliente admin.
    //
    // Formato de la URL: .../storage/v1/object/public/documentos/PROYECTO/ARCHIVO
    //                 o: .../storage/v1/object/sign/documentos/PROYECTO/ARCHIVO
    let buffer: Buffer

    try {
      // Extraer el path relativo después de "/documentos/"
      const storagePathMatch = url.match(/\/documentos\/(.+?)(?:\?|$)/)
      const storagePath      = storagePathMatch?.[1]

      if (storagePath) {
        // Descarga autenticada con el service role (sin límite de acceso)
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('documentos')
          .download(storagePath)

        if (downloadError || !fileData) {
          throw new Error(downloadError?.message ?? 'Archivo no encontrado en Storage')
        }

        buffer = Buffer.from(await fileData.arrayBuffer())
      } else {
        // Fallback: intento fetch directo (por si la URL es externa)
        const res = await fetch(url)
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        buffer = Buffer.from(await res.arrayBuffer())
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Error descargando archivo: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 },
      )
    }

    // ── 2. Limpiar chunks anteriores de este documento ────────────────────────
    // documento_id está en metadatos JSONB, no en columna propia
    if (documentoId) {
      await supabase
        .from('documentos_rag')
        .delete()
        .eq('proyecto_id', proyectoId)
        .eq('metadatos->>documento_id', documentoId)
    }

    // ── 3. Detectar tipo y procesar ───────────────────────────────────────────
    const nombreLower = nombre.toLowerCase() || url.toLowerCase()

    // Si viene `tipo` explícito lo respetamos; si no, lo deducimos del nombre
    const tipoDetectado: string =
      body.tipo ??
      (nombreLower.endsWith('.csv')
        ? 'csv_wordpress'
        : nombreLower.endsWith('.zip')
          ? 'zip_docx'
          : nombreLower.endsWith('.docx') || nombreLower.endsWith('.doc')
            ? 'docx'
            : 'desconocido')

    let resultado: ResultadoProcesamiento

    if (tipoDetectado === 'csv_wordpress') {
      resultado = await procesarCSVWordpress(buffer, proyectoId, documentoId)
    } else if (tipoDetectado === 'docx') {
      resultado = await procesarDOCX(buffer, nombre, proyectoId, documentoId)
    } else if (tipoDetectado === 'zip_docx') {
      resultado = await procesarZIPDocx(buffer, proyectoId, documentoId)
    } else {
      return NextResponse.json(
        { error: `Tipo de archivo no soportado para RAG: ${nombre || url}. Usa CSV, DOCX o ZIP.` },
        { status: 400 },
      )
    }

    if (resultado.chunks_totales === 0 && resultado.procesados === 0) {
      return NextResponse.json(
        { error: 'El archivo no contiene contenido procesable', errores: resultado.errores },
        { status: 400 },
      )
    }

    // ── 4. Persistir estado en proyecto: rag_num_documentos + estado_rag por doc ─
    const { data: proyectoActual } = await supabase
      .from('proyectos')
      .select('rag_num_documentos, documentos_subidos')
      .eq('id', proyectoId)
      .maybeSingle()

    const nuevoTotal = (proyectoActual?.rag_num_documentos ?? 0) + resultado.chunks_totales

    // Actualizar estado_rag y chunks_generados en el documento dentro del JSONB
    const docsActualizados = ((proyectoActual?.documentos_subidos ?? []) as Array<Record<string, unknown>>)
      .map((doc) => {
        if (documentoId && doc.id === documentoId) {
          return { ...doc, estado_rag: 'procesado', chunks_generados: resultado.chunks_totales, fecha_procesado: new Date().toISOString() }
        }
        return doc
      })

    await supabase
      .from('proyectos')
      .update({
        rag_ultima_actualizacion: new Date().toISOString(),
        rag_num_documentos      : nuevoTotal,
        documentos_subidos      : docsActualizados,
      })
      .eq('id', proyectoId)

    // ── 5. Respuesta ──────────────────────────────────────────────────────────
    return NextResponse.json({
      success       : true,
      procesados    : resultado.procesados,
      chunks_totales: resultado.chunks_totales,
      errores       : resultado.errores,
    })
  } catch (err) {
    console.error('[RAG ingest]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/rag/ingest ───────────────────────────────────────────────────
// Body: { proyecto_id, documento_id?, nombre_archivo? }
// Elimina todos los chunks de documentos_rag asociados al documento
// y actualiza el contador rag_num_documentos del proyecto.

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as {
      proyecto_id    : string
      documento_id  ?: string   // UUID del DocumentoProyecto
      nombre_archivo?: string   // nombre del fichero (fallback)
    }

    const { proyecto_id, documento_id, nombre_archivo } = body

    if (!proyecto_id) {
      return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })
    }
    if (!documento_id && !nombre_archivo) {
      return NextResponse.json(
        { error: 'Proporciona documento_id o nombre_archivo' },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()

    // ── 1. Contar chunks que se van a borrar ──────────────────────────────────
    // documento_id vive en metadatos JSONB, no como columna propia
    let countQuery = supabase
      .from('documentos_rag')
      .select('id', { count: 'exact', head: true })
      .eq('proyecto_id', proyecto_id)

    if (documento_id) {
      countQuery = countQuery.eq('metadatos->>documento_id', documento_id)
    } else {
      countQuery = countQuery.or(
        `metadatos->>nombre_archivo.eq.${nombre_archivo},articulo_id.eq.${nombre_archivo}`,
      )
    }

    const { count } = await countQuery

    // ── 2. Eliminar chunks ────────────────────────────────────────────────────
    let deleteQuery = supabase
      .from('documentos_rag')
      .delete()
      .eq('proyecto_id', proyecto_id)

    if (documento_id) {
      deleteQuery = deleteQuery.eq('metadatos->>documento_id', documento_id)
    } else {
      deleteQuery = deleteQuery.or(
        `metadatos->>nombre_archivo.eq.${nombre_archivo},articulo_id.eq.${nombre_archivo}`,
      )
    }

    const { error: deleteError } = await deleteQuery
    if (deleteError) throw new Error(deleteError.message)

    // ── 3. Decrementar rag_num_documentos + limpiar estado_rag en JSONB ─────────
    const { data: proyectoActual } = await supabase
      .from('proyectos')
      .select('rag_num_documentos, documentos_subidos')
      .eq('id', proyecto_id)
      .maybeSingle()

    const nuevoTotal = Math.max(
      0,
      (proyectoActual?.rag_num_documentos ?? 0) - (count ?? 0),
    )

    // Limpiar estado_rag del documento en el JSONB
    const docsActualizados = ((proyectoActual?.documentos_subidos ?? []) as Array<Record<string, unknown>>)
      .map((doc) => {
        if (documento_id && doc.id === documento_id) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { estado_rag: _r, chunks_generados: _c, fecha_procesado: _f, ...resto } = doc
          return resto
        }
        return doc
      })

    await supabase
      .from('proyectos')
      .update({
        rag_num_documentos: nuevoTotal,
        documentos_subidos: docsActualizados,
      })
      .eq('id', proyecto_id)

    return NextResponse.json({ success: true, eliminados: count ?? 0 })
  } catch (err) {
    console.error('[RAG delete]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
