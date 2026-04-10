/**
 * POST /api/analisis-web
 * Analiza el contenido editorial de una web/blog:
 * A) Detecta y parsea sitemap/RSS
 * B) Extrae contenido de cada artículo con cheerio
 * C) Obtiene keywords del dominio via SerpApi
 * D) Sintetiza el informe con Claude
 * E) Guarda en analisis_web
 *
 * GET /api/analisis-web?cliente_id=X
 * Devuelve todos los análisis existentes para un cliente
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  guardarRegistroCoste,
  calcularCosteClaudeUSD,
  PRECIO_SERPAPI_BUSQUEDA,
} from '@/lib/costes'

export const maxDuration = 120

const SERPAPI_BASE = 'https://serpapi.com/search.json'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function fetchWithTimeout(url: string, ms = 10000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, {
      signal  : ctrl.signal,
      headers : { 'User-Agent': 'Mozilla/5.0 (compatible; ContentCopilot/1.0; +https://contentcopilot.ai)' },
    })
  } finally {
    clearTimeout(timer)
  }
}

function normalizeUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`
  return url
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// ─── A) Detectar sitemap / RSS ─────────────────────────────────────────────────

interface ArticuloBasico {
  url   : string
  titulo?: string
  fecha ?: string
}

function parsearRSS(texto: string): ArticuloBasico[] {
  const arts: ArticuloBasico[] = []
  const items = texto.match(/<item>([\s\S]*?)<\/item>/gi) ?? []
  for (const item of items) {
    const titulo = item.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim()
    const link   = (
      item.match(/<link>([^<]+)<\/link>/)?.[1] ??
      item.match(/<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/)?.[1]
    )?.trim()
    const fecha  = item.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1]?.trim()
    if (link && link.startsWith('http')) arts.push({ url: link, titulo, fecha })
  }
  return arts
}

function parsearSitemap(texto: string): ArticuloBasico[] {
  const arts: ArticuloBasico[] = []
  const entries = texto.match(/<url>([\s\S]*?)<\/url>/gi) ?? []
  for (const entry of entries) {
    const loc     = entry.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim()
    const lastmod = entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim()
    if (loc) arts.push({ url: loc, fecha: lastmod })
  }
  return arts
}

function parsearSitemapIndex(texto: string): string[] {
  return (texto.match(/<loc>([^<]+)<\/loc>/gi) ?? [])
    .map((l) => l.replace(/<\/?loc>/gi, '').trim())
}

async function scrapingDirecto(origen: string, maxArts: number): Promise<ArticuloBasico[]> {
  const arts: ArticuloBasico[] = []
  const BLOG_PATTERN = /\/(blog|articulo[s]?|noticia[s]?|post[s]?|guia[s]?|news|entrada[s]?)\//i
  const DATE_PATTERN = /\/\d{4}\/\d{2}\//

  for (const url of [origen, `${origen}/blog`, `${origen}/noticias`, `${origen}/articulos`]) {
    try {
      const res = await fetchWithTimeout(url, 8000)
      if (!res.ok) continue
      const $ = cheerio.load(await res.text())
      $('a[href]').each((_, el) => {
        const href    = $(el).attr('href') ?? ''
        const fullUrl = href.startsWith('http') ? href : `${origen}${href.startsWith('/') ? href : `/${href}`}`
        if (
          fullUrl.startsWith(origen) &&
          (BLOG_PATTERN.test(fullUrl) || DATE_PATTERN.test(fullUrl)) &&
          !arts.some((a) => a.url === fullUrl)
        ) {
          arts.push({ url: fullUrl, titulo: $(el).text().trim().slice(0, 200) || undefined })
        }
      })
      if (arts.length >= maxArts) break
    } catch { /* continuar */ }
  }
  return arts.slice(0, maxArts)
}

async function encontrarArticulos(baseUrl: string, maxArts: number): Promise<ArticuloBasico[]> {
  const origen  = new URL(normalizeUrl(baseUrl)).origin
  const BLOG_PATTERN = /\/(blog|articulo[s]?|noticia[s]?|post[s]?|guia[s]?|news)\//i
  const DATE_PATTERN = /\/\d{4}\/\d{2}\//

  const candidatos = [
    `${origen}/sitemap.xml`,
    `${origen}/sitemap_index.xml`,
    `${origen}/blog/sitemap.xml`,
    `${origen}/news/sitemap.xml`,
    `${origen}/post-sitemap.xml`,
    `${origen}/feed`,
    `${origen}/rss`,
    `${origen}/feed.xml`,
    `${origen}/rss.xml`,
    `${origen}/blog/feed`,
  ]

  for (const cand of candidatos) {
    try {
      const res  = await fetchWithTimeout(cand, 8000)
      if (!res.ok) continue
      const txt  = await res.text()
      if (!txt || txt.length < 100) continue

      // RSS / Atom
      if (txt.includes('<channel>') || (txt.includes('<feed') && txt.includes('<entry>'))) {
        const arts = parsearRSS(txt)
        if (arts.length > 0) {
          console.log(`[analisis-web] Feed RSS en ${cand}: ${arts.length} items`)
          return arts.slice(0, maxArts)
        }
      }

      // Sitemap index
      if (txt.includes('<sitemapindex') || (txt.includes('<sitemap>') && txt.includes('<loc>'))) {
        const subs = parsearSitemapIndex(txt)
        const blog = subs.find((s) => /blog|post|news|article|contenido/.test(s)) ?? subs[0]
        if (blog) {
          const subRes = await fetchWithTimeout(blog, 8000)
          if (subRes.ok) {
            const arts = parsearSitemap(await subRes.text())
            if (arts.length > 0) {
              console.log(`[analisis-web] Sitemap sub en ${blog}: ${arts.length} URLs`)
              return arts.slice(0, maxArts)
            }
          }
        }
      }

      // Sitemap normal
      if (txt.includes('<urlset') || (txt.includes('<url>') && txt.includes('<loc>'))) {
        const arts = parsearSitemap(txt)
        if (arts.length > 0) {
          const filtradas = arts.filter((a) => BLOG_PATTERN.test(a.url) || DATE_PATTERN.test(a.url))
          const result    = filtradas.length > 5 ? filtradas : arts
          console.log(`[analisis-web] Sitemap en ${cand}: ${result.length} URLs`)
          return result.slice(0, maxArts)
        }
      }
    } catch { /* continuar */ }
  }

  console.log('[analisis-web] Sin sitemap/feed — scraping directo')
  return scrapingDirecto(origen, maxArts)
}

// ─── B) Extraer contenido de cada artículo ────────────────────────────────────

interface ArticuloExtraido {
  url           : string
  titulo        : string
  h1           ?: string
  h2s           : string[]
  texto_limpio  : string
  fecha        ?: string
  meta_description?: string
}

async function extraerArticulo(art: ArticuloBasico): Promise<ArticuloExtraido | null> {
  try {
    const res = await fetchWithTimeout(art.url, 10000)
    if (!res.ok) return null
    const $     = cheerio.load(await res.text())

    const titulo =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      art.titulo ||
      '(sin título)'

    const h1 = $('h1').first().text().trim() || undefined

    const h2s: string[] = []
    $('h2').each((_, el) => {
      const t = $(el).text().trim()
      if (t && h2s.length < 6) h2s.push(t)
    })

    const meta_description =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      undefined

    const fecha =
      $('meta[property="article:published_time"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      art.fecha ||
      undefined

    let texto_limpio = ''
    $('article p, main p, .content p, .post-content p, .entry-content p, p').each((_, el) => {
      if (texto_limpio.length >= 300) return false as unknown as void
      const t = $(el).text().trim()
      if (t.length > 60) texto_limpio += (texto_limpio ? ' ' : '') + t
    })

    return {
      url: art.url,
      titulo: titulo.slice(0, 200),
      h1,
      h2s,
      texto_limpio: texto_limpio.slice(0, 500),
      fecha,
      meta_description,
    }
  } catch {
    return null
  }
}

// ─── C) SerpApi — keywords ────────────────────────────────────────────────────

async function obtenerKeywords(dominio: string): Promise<string[]> {
  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) return []
  try {
    const qs  = new URLSearchParams({ engine: 'google', q: `site:${dominio}`, num: '20', gl: 'es', hl: 'es', api_key: apiKey })
    const res = await fetchWithTimeout(`${SERPAPI_BASE}?${qs}`, 15000)
    if (!res.ok) return []
    const data = await res.json() as { organic_results?: Array<{ title?: string }> }
    return (data.organic_results ?? []).map((r) => r.title).filter(Boolean) as string[]
  } catch {
    return []
  }
}

// ─── D) Análisis con Claude ───────────────────────────────────────────────────

interface AnalisisIA {
  tematicas              : Array<{ tema: string; porcentaje: number }>
  enfoque_editorial      : string
  frecuencia_publicacion : string
  fortalezas             : string[]
  debilidades            : string[]
  keywords_principales   : string[]
  oportunidades_vs_cliente: string[]
  resumen_ejecutivo      : string
  periodo_detectado     ?: string
}

async function analizarConClaude(
  articulos: Array<{ titulo: string; fecha?: string; h2s?: string[] }>,
  dominio: string,
  nombreComp?: string,
): Promise<{ analisis: AnalisisIA; inputTokens: number; outputTokens: number }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const lista = articulos.slice(0, 60).map((a) => {
    let l = `- ${a.titulo}`
    if (a.fecha) l += ` (${String(a.fecha).slice(0, 10)})`
    if (a.h2s && a.h2s.length > 0) l += `\n  Secciones: ${a.h2s.slice(0, 3).join(', ')}`
    return l
  }).join('\n')

  const response = await anthropic.messages.create({
    model     : 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages  : [{
      role   : 'user',
      content: `Eres un analista de contenidos especializado en marketing digital.
Analiza este conjunto de artículos del blog/web "${nombreComp ?? dominio}" y genera un informe estructurado.

ARTÍCULOS ANALIZADOS (${articulos.length} en total):
${lista}

Devuelve SOLO JSON válido (sin markdown ni explicaciones) con esta estructura EXACTA:
{
  "tematicas": [{"tema": "string", "porcentaje": number}],
  "enfoque_editorial": "string",
  "frecuencia_publicacion": "string",
  "fortalezas": ["string"],
  "debilidades": ["string"],
  "keywords_principales": ["string"],
  "oportunidades_vs_cliente": ["string"],
  "resumen_ejecutivo": "string",
  "periodo_detectado": "string"
}

Reglas:
- tematicas: 3-8 temáticas con % que sumen ~100
- fortalezas/debilidades: 3-5 items cada uno
- keywords_principales: 8-12 keywords inferidas de los títulos
- oportunidades_vs_cliente: 3-5 gaps o oportunidades accionables
- resumen_ejecutivo: 3-4 frases de síntesis
- periodo_detectado: rango de fechas si visible en los artículos
- Responde SOLO con el JSON, sin texto adicional`,
    }],
  })

  const raw   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude no devolvió JSON válido')

  return {
    analisis    : JSON.parse(match[0]) as AnalisisIA,
    inputTokens : response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: {
    url                     : string
    cliente_id              : string
    competidor_id          ?: string
    referencia_editorial_id?: string
    tipo                    : 'cliente' | 'competidor'
    max_articulos          ?: number
    nombre_competidor      ?: string
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { url, cliente_id, competidor_id, referencia_editorial_id, tipo, nombre_competidor } = body
  const maxArts = Math.min(body.max_articulos ?? 50, 50)

  if (!url || !cliente_id) {
    return NextResponse.json({ error: 'url y cliente_id son obligatorios' }, { status: 400 })
  }

  const urlNorm = normalizeUrl(url)
  const dominio = extractDomain(urlNorm)
  const supabase = createAdminClient()

  console.log(`[analisis-web] Iniciando análisis de ${urlNorm} (${tipo}) para cliente ${cliente_id}`)

  // ── A) Artículos ────────────────────────────────────────────────────────────
  console.log('[analisis-web] A) Buscando artículos...')
  const artBasicos = await encontrarArticulos(urlNorm, maxArts)
  console.log(`[analisis-web] Encontrados ${artBasicos.length} artículos candidatos`)

  if (artBasicos.length === 0) {
    await supabase.from('analisis_web').insert({
      cliente_id,
      competidor_id           : competidor_id ?? null,
      referencia_editorial_id : referencia_editorial_id ?? null,
      tipo,
      url_analizada: urlNorm,
      num_articulos : 0,
      estado        : 'error',
      informe_completo: 'No se encontraron artículos. Esta web puede estar bloqueando el análisis automático o no tiene un blog con sitemap/RSS accesible.',
    })
    return NextResponse.json(
      { error: 'No se encontraron artículos. Esta web puede bloquear el análisis automático o no tiene blog/sitemap accesible.' },
      { status: 422 },
    )
  }

  // ── B) Extraer contenido ────────────────────────────────────────────────────
  console.log('[analisis-web] B) Extrayendo contenido de artículos...')
  const artExtraidos: ArticuloExtraido[] = []

  for (let i = 0; i < Math.min(artBasicos.length, maxArts); i++) {
    const extraido = await extraerArticulo(artBasicos[i])
    if (extraido) artExtraidos.push(extraido)
    if (i < artBasicos.length - 1) await sleep(400)
    if (artExtraidos.length >= 50) break
  }
  console.log(`[analisis-web] Extraídos ${artExtraidos.length} artículos con contenido`)

  // Si no se pudo extraer contenido, usar los básicos (títulos del RSS/sitemap)
  const artParaAnalisis = artExtraidos.length >= 3
    ? artExtraidos
    : artBasicos.slice(0, 50).map((a) => ({
        url         : a.url,
        titulo      : a.titulo ?? '(sin título)',
        h2s         : [] as string[],
        texto_limpio: '',
        fecha       : a.fecha,
      }))

  // ── C) SerpApi keywords ─────────────────────────────────────────────────────
  console.log('[analisis-web] C) Buscando keywords vía SerpApi...')
  const keywords = await obtenerKeywords(dominio)
  if (process.env.SERPAPI_KEY) {
    guardarRegistroCoste({
      cliente_id,
      tipo_operacion: 'serpapi_search',
      agente        : 'analisis-web',
      unidades      : 1,
      coste_usd     : PRECIO_SERPAPI_BUSQUEDA,
      metadatos     : { dominio, tipo },
    }).catch(console.error)
  }

  // ── D) Claude ───────────────────────────────────────────────────────────────
  console.log('[analisis-web] D) Analizando con Claude...')
  let analisis: AnalisisIA | null = null
  let inputTok = 0, outputTok = 0

  try {
    const res = await analizarConClaude(artParaAnalisis, dominio, nombre_competidor)
    analisis  = res.analisis
    inputTok  = res.inputTokens
    outputTok = res.outputTokens
  } catch (e) {
    console.error('[analisis-web] Error Claude:', e)
  }

  if (inputTok > 0) {
    guardarRegistroCoste({
      cliente_id,
      tipo_operacion: 'analisis_web',
      agente        : 'analisis-web',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : inputTok,
      tokens_output : outputTok,
      coste_usd     : calcularCosteClaudeUSD(inputTok, outputTok),
      metadatos     : { dominio, tipo, competidor_id: competidor_id ?? null, referencia_editorial_id: referencia_editorial_id ?? null },
    }).catch(console.error)
  }

  // ── E) Guardar ──────────────────────────────────────────────────────────────
  const { data: registro, error: insertError } = await supabase
    .from('analisis_web')
    .insert({
      cliente_id,
      competidor_id           : competidor_id ?? null,
      referencia_editorial_id : referencia_editorial_id ?? null,
      tipo,
      url_analizada           : urlNorm,
      num_articulos           : artParaAnalisis.length,
      tematicas_detectadas    : analisis?.tematicas ?? [],
      keywords_posicionamiento: keywords.slice(0, 20),
      articulos               : artParaAnalisis.slice(0, 50).map((a) => ({
        url   : a.url,
        titulo: a.titulo,
        fecha : a.fecha,
        h2s   : (a as ArticuloExtraido).h2s?.slice(0, 4),
      })),
      informe_completo: analisis?.resumen_ejecutivo ?? null,
      resumen         : analisis ?? {},
      estado          : 'completado',
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('[analisis-web] Error guardando:', insertError)
    return NextResponse.json({ error: 'Error guardando el análisis' }, { status: 500 })
  }

  console.log(`[analisis-web] Análisis completado: ${registro?.id} (${artParaAnalisis.length} arts, ${keywords.length} kws)`)

  return NextResponse.json({
    ok           : true,
    id           : registro?.id,
    num_articulos: artParaAnalisis.length,
    keywords_count: keywords.length,
    analisis,
    articulos_muestra: artParaAnalisis.slice(0, 5).map((a) => ({ url: a.url, titulo: a.titulo, fecha: a.fecha })),
  })
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clienteId = new URL(request.url).searchParams.get('cliente_id')
  if (!clienteId) return NextResponse.json({ error: 'cliente_id requerido' }, { status: 400 })

  const { data } = await createAdminClient()
    .from('analisis_web')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ analisis: data ?? [] })
}
