/**
 * POST /api/rag/indexar-web
 * Body: { cliente_id: string }
 *
 * Indexa en el RAG los artículos publicados en la web del cliente.
 *
 * Las URLs salen del análisis web más reciente (analisis_web, tipo='cliente'),
 * que ya recorrió el sitemap del dominio. Aquí se vuelven a descargar para
 * quedarnos con el CUERPO COMPLETO: el análisis solo conserva título, fecha
 * y h2s, y del texto se quedaba con 500 caracteres que ni siquiera persistía.
 *
 * GET /api/rag/indexar-web?cliente_id=X
 * Estado actual: cuántos artículos hay indexados y si el análisis web está
 * desactualizado respecto a lo que ya se indexó.
 *
 * Los documentos se cuelgan del proyecto MÁS ANTIGUO del cliente:
 * documentos_rag.proyecto_id es NOT NULL y el RPC buscar_rag_cliente busca
 * en todos los proyectos del cliente, así que a efectos de recuperación da
 * igual cuál los aloje.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import * as cheerio from 'cheerio'
import { createAdminClient } from '@/lib/supabase/admin'
import { USER_AGENT } from '@/lib/user-agent'
import { dividirEnChunks, guardarChunks, sleep, type ArticuloParseado } from '@/lib/rag/indexar'

export const maxDuration = 300

/** Marca de procedencia: distingue estos chunks de los documentos subidos a mano */
const FUENTE = 'web_publicada'

/** Mínimo de palabras para que un artículo merezca indexarse */
const MIN_PALABRAS = 50

/** Pausa entre descargas para no martillear el dominio del cliente */
const DELAY_FETCH = 150

// ─────────────────────────────────────────────────────────────
// Descarga y extracción
// ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, ms = 15000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, {
      signal : ctrl.signal,
      headers: { 'User-Agent': USER_AGENT },
    })
  } finally {
    clearTimeout(timer)
  }
}

interface ArticuloWeb {
  url     : string
  titulo  : string
  fecha  ?: string
  texto   : string
  palabras: number
}

/**
 * Descarga un artículo y extrae su cuerpo completo.
 *
 * A diferencia de analisis-web, no hay tope de caracteres: el objetivo aquí
 * es alimentar embeddings, no un resumen.
 */
async function extraerArticuloCompleto(
  url        : string,
  tituloPrevio?: string,
  fechaPrevia ?: string,
): Promise<ArticuloWeb> {
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const $ = cheerio.load(await res.text())

  // Fuera todo lo que no es contenido editorial
  $('script, style, nav, header, footer, aside, form, noscript, iframe').remove()
  $('.menu, .navigation, .sidebar, .comments, .related-posts, .cookie, .breadcrumb').remove()

  const titulo =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    tituloPrevio ||
    '(sin título)'

  const fecha =
    $('meta[property="article:published_time"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    fechaPrevia ||
    undefined

  // Buscar el contenedor del artículo, del más específico al más genérico
  const contenedores = [
    'article', 'main', '.post-content', '.entry-content',
    '.content', '#content', '.single-content',
  ]

  let texto = ''
  for (const sel of contenedores) {
    const $c = $(sel).first()
    if ($c.length === 0) continue
    const t = $c.text().replace(/\s+/g, ' ').trim()
    if (t.length > texto.length) texto = t
    if (texto.length > 500) break
  }

  // Último recurso: todos los párrafos de la página
  if (texto.length < 200) {
    const parrafos: string[] = []
    $('p').each((_, el) => {
      const t = $(el).text().trim()
      if (t.length > 40) parrafos.push(t)
    })
    const alternativo = parrafos.join(' ').replace(/\s+/g, ' ').trim()
    if (alternativo.length > texto.length) texto = alternativo
  }

  const palabras = texto.split(/\s+/).filter(Boolean).length

  return { url, titulo: titulo.slice(0, 300), fecha, texto, palabras }
}

// ─────────────────────────────────────────────────────────────
// Fuente de URLs
// ─────────────────────────────────────────────────────────────

interface ArticuloAnalisis { url?: string; titulo?: string; fecha?: string }

async function cargarContexto(clienteId: string) {
  const supabase = createAdminClient()

  const [analisisRes, proyectosRes] = await Promise.all([
    supabase
      .from('analisis_web')
      .select('id, articulos, fecha_analisis, url_analizada')
      .eq('cliente_id', clienteId)
      .eq('tipo', 'cliente')
      .order('fecha_analisis', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // El proyecto MÁS ANTIGUO del cliente aloja los documentos
    supabase
      .from('proyectos')
      .select('id, nombre')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const analisis = analisisRes.data
  const proyecto = proyectosRes.data

  const articulos: ArticuloAnalisis[] = Array.isArray(analisis?.articulos)
    ? (analisis.articulos as ArticuloAnalisis[]).filter((a) => a?.url)
    : []

  return { analisis, proyecto, articulos }
}

// ─────────────────────────────────────────────────────────────
// GET — estado
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clienteId = req.nextUrl.searchParams.get('cliente_id')
  if (!clienteId) return NextResponse.json({ error: 'cliente_id es obligatorio' }, { status: 400 })

  const supabase = createAdminClient()
  const { analisis, proyecto, articulos } = await cargarContexto(clienteId)

  let indexados     = 0
  let ultimaIndexacion: string | null = null

  if (proyecto) {
    const { data: filas } = await supabase
      .from('documentos_rag')
      .select('articulo_id, created_at')
      .eq('proyecto_id', proyecto.id)
      .eq('metadatos->>fuente', FUENTE)

    const arts = new Set((filas ?? []).map((f) => f.articulo_id as string))
    indexados  = arts.size
    ultimaIndexacion = (filas ?? []).reduce<string | null>(
      (max, f) => (!max || String(f.created_at) > max ? String(f.created_at) : max),
      null,
    )
  }

  return NextResponse.json({
    tiene_analisis    : !!analisis,
    fecha_analisis    : analisis?.fecha_analisis ?? null,
    url_analizada     : analisis?.url_analizada ?? null,
    articulos_en_analisis: articulos.length,
    proyecto_destino  : proyecto ? { id: proyecto.id, nombre: proyecto.nombre } : null,
    articulos_indexados: indexados,
    ultima_indexacion : ultimaIndexacion,
  })
}

// ─────────────────────────────────────────────────────────────
// POST — indexar
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let clienteId: string | undefined
  try {
    const body = await req.json() as { cliente_id?: string }
    clienteId = body.cliente_id
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  if (!clienteId) return NextResponse.json({ error: 'cliente_id es obligatorio' }, { status: 400 })

  const supabase = createAdminClient()
  const { analisis, proyecto, articulos } = await cargarContexto(clienteId)

  if (!analisis) {
    return NextResponse.json(
      { error: 'Este cliente no tiene análisis web. Ejecútalo primero desde la ficha del cliente.' },
      { status: 400 },
    )
  }
  if (!proyecto) {
    return NextResponse.json(
      { error: 'Este cliente no tiene ningún proyecto. Los documentos del RAG necesitan colgar de uno.' },
      { status: 400 },
    )
  }
  if (articulos.length === 0) {
    return NextResponse.json(
      { error: 'El análisis web no contiene URLs de artículos.' },
      { status: 400 },
    )
  }

  console.log(
    `[IndexarWeb] Cliente ${clienteId} — ${articulos.length} URLs del análisis de ` +
    `${analisis.fecha_analisis} → proyecto "${proyecto.nombre}"`,
  )

  const fallidos: Array<{ url: string; motivo: string }> = []
  const omitidos: Array<{ url: string; motivo: string }> = []
  let indexados     = 0
  let chunksTotales = 0

  for (const art of articulos) {
    const url = String(art.url)

    // ── Descarga ──────────────────────────────────────────────
    // Una URL caída no puede tumbar el proceso entero: se registra y se sigue.
    let extraido: ArticuloWeb
    try {
      extraido = await extraerArticuloCompleto(url, art.titulo, art.fecha)
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      console.warn(`[IndexarWeb] FALLO al descargar ${url}: ${motivo}`)
      fallidos.push({ url, motivo })
      continue
    }

    if (extraido.palabras < MIN_PALABRAS) {
      console.warn(`[IndexarWeb] OMITIDO ${url}: solo ${extraido.palabras} palabras`)
      omitidos.push({ url, motivo: `contenido insuficiente (${extraido.palabras} palabras)` })
      await sleep(DELAY_FETCH)
      continue
    }

    const chunks = dividirEnChunks(extraido.texto)
    if (chunks.length === 0) {
      omitidos.push({ url, motivo: 'no se pudo trocear el texto' })
      await sleep(DELAY_FETCH)
      continue
    }

    // ── Idempotencia ──────────────────────────────────────────
    // Borramos lo indexado antes para esta misma URL, para poder relanzar
    // sin duplicar chunks.
    const { error: delErr } = await supabase
      .from('documentos_rag')
      .delete()
      .eq('proyecto_id', proyecto.id)
      .eq('articulo_id', url)
      .eq('metadatos->>fuente', FUENTE)

    if (delErr) {
      console.warn(`[IndexarWeb] No se pudieron borrar chunks previos de ${url}: ${delErr.message}`)
    }

    // ── Indexar ───────────────────────────────────────────────
    const articulo: ArticuloParseado = {
      articulo_id: url,           // la URL identifica el artículo de forma estable
      titulo     : extraido.titulo,
      contenido  : extraido.texto,
      metadatos  : {
        fuente        : FUENTE,
        url           : extraido.url,      // check-existing lo lee para existing_url
        fecha         : extraido.fecha ?? '',
        palabras      : String(extraido.palabras),
        analisis_web_id: String(analisis.id),
      },
    }

    // guardarChunks registra el coste de los embeddings en registros_costes
    const { guardados, errores } = await guardarChunks(
      proyecto.id,
      String(analisis.id),
      articulo,
      chunks,
    )

    if (guardados === 0) {
      fallidos.push({ url, motivo: errores[0] ?? 'no se guardó ningún chunk' })
    } else {
      indexados++
      chunksTotales += guardados
      console.log(`[IndexarWeb] OK ${url} — ${guardados} chunks (${extraido.palabras} palabras)`)
      if (errores.length > 0) {
        console.warn(`[IndexarWeb] ${url} con errores parciales:`, errores)
      }
    }

    await sleep(DELAY_FETCH)
  }

  console.log(
    `[IndexarWeb] Completado — ${indexados}/${articulos.length} artículos, ` +
    `${chunksTotales} chunks, ${fallidos.length} fallidos, ${omitidos.length} omitidos`,
  )
  if (fallidos.length > 0) {
    console.warn('[IndexarWeb] URLs fallidas:', fallidos.map((f) => `${f.url} (${f.motivo})`))
  }

  return NextResponse.json({
    ok               : true,
    proyecto_destino : { id: proyecto.id, nombre: proyecto.nombre },
    total_urls       : articulos.length,
    articulos_indexados: indexados,
    chunks_creados   : chunksTotales,
    fallidos,
    omitidos,
    fecha_analisis   : analisis.fecha_analisis,
  })
}
