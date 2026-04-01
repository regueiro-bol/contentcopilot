'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ArticuloDetectado, FilaExcelSeo, BriefSEO } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
}

/** Construye el brief inicial para un contenido antes de que el agente responda */
function buildBriefInicial(params: {
  keyword: string
  titulo: string
  estructuraH: string
  observacionesSeo: string
  urlDestino?: string
  keywordsSecundarias?: string[]
  tipoKeyword?: string
  volumenEstimado?: number
  featuredSnippet?: boolean
  formatoRecomendado?: string
  tamanyoMin?: number
  tamanyoMax?: number
}): BriefSEO {
  return {
    texto_generado: undefined,
    keyword_principal: params.keyword,
    titulo_propuesto: params.titulo,
    url_prevista: params.urlDestino ?? '',
    tipo_keyword: params.tipoKeyword ?? '',
    tipo_serp: '',
    description_propuesta: '',
    respuesta_directa: '',
    featured_snippet: params.featuredSnippet ?? false,
    estructura_h: params.estructuraH,
    keywords_secundarias: params.keywordsSecundarias ?? [],
    fuentes: [],
    links_obligatorios: [],
    formato_recomendado: params.formatoRecomendado ?? '',
    enfoque: '',
    observaciones_seo: params.observacionesSeo,
    volumen_busquedas: params.volumenEstimado,
    tamanyo_texto_min: params.tamanyoMin,
    tamanyo_texto_max: params.tamanyoMax,
  }
}

/**
 * Genera el brief SEO en background llamando directamente a la API de Dify
 * y guarda el resultado en el campo brief.texto_generado del contenido.
 * Esta función se llama sin await (fire and forget).
 */
async function generarBriefEnBackground(
  contenidoId: string,
  titulo: string,
  estructuraH: string,
  observaciones: string,
  nombreCliente: string,
  nombreProyecto: string
): Promise<void> {
  const apiKey = process.env.DIFY_BRIEF_SEO_API_KEY ?? ''
  const baseUrl = process.env.DIFY_BASE_URL ?? 'https://api.dify.ai/v1'

  if (!apiKey) {
    console.warn('[brief-background] DIFY_BRIEF_SEO_API_KEY no configurada')
    return
  }

  const query = [
    nombreCliente  ? `CLIENTE: ${nombreCliente}`   : '',
    nombreProyecto ? `PROYECTO: ${nombreProyecto}` : '',
    `\nTÍTULO: ${titulo}`,
    estructuraH  ? `\nESTRUCTURA:\n${estructuraH}`    : '',
    observaciones ? `\nOBSERVACIONES:\n${observaciones}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await fetch(`${baseUrl}/chat-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: 'blocking',
        conversation_id: '',
        user: 'system',
      }),
    })

    if (!res.ok) {
      console.error('[brief-background] Dify error:', res.status, await res.text())
      return
    }

    const datos = await res.json()
    const textoGenerado: string = datos.answer ?? ''

    if (!textoGenerado) return

    const supabase = createAdminClient()
    // Fetch el brief actual y hacer merge para no perder el resto de campos
    const { data: contenido } = await supabase
      .from('contenidos')
      .select('brief')
      .eq('id', contenidoId)
      .single()

    const briefActualizado = {
      ...(contenido?.brief ?? {}),
      texto_generado: textoGenerado,
    }

    await supabase
      .from('contenidos')
      .update({ brief: briefActualizado })
      .eq('id', contenidoId)
  } catch (err) {
    console.error('[brief-background] Error generando brief:', contenidoId, err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Acciones públicas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un pedido tipo DOCX o Excel con sus contenidos correspondientes.
 * Lanza la generación de briefs en background (fire and forget).
 */
export async function crearPedidoDesdeArticulos(params: {
  clienteId: string
  proyectoId: string
  nombreArchivo: string
  tipo: 'docx' | 'excel'
  articulos: (ArticuloDetectado | FilaExcelSeo)[]
}): Promise<{ pedidoId: string; contenidosCreados: number }> {
  const supabase = createAdminClient()

  // 0. Resolver nombres de cliente y proyecto para el brief
  const [{ data: clienteRow }, { data: proyectoRow }] = await Promise.all([
    supabase.from('clientes').select('nombre').eq('id', params.clienteId).single(),
    supabase.from('proyectos').select('nombre').eq('id', params.proyectoId).single(),
  ])
  const nombreCliente  = clienteRow?.nombre  ?? ''
  const nombreProyecto = proyectoRow?.nombre ?? ''

  // 1. Crear el pedido en estado 'procesando'
  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .insert({
      tipo: params.tipo,
      cliente_id: params.clienteId,
      proyecto_id: params.proyectoId,
      nombre_archivo: params.nombreArchivo,
      estado: 'procesando',
    })
    .select('id')
    .single()

  if (pedidoError || !pedido) {
    throw new Error(pedidoError?.message ?? 'No se pudo crear el pedido')
  }

  const pedidoId = pedido.id
  const errores: string[] = []
  let contenidosCreados = 0

  // ── LOG 1: estado al inicio del bucle ────────────────────────────────────
  console.log('[PEDIDO] Artículos recibidos:', params.articulos.length)
  console.log('[PEDIDO] proyecto_id:', params.proyectoId)
  console.log('[PEDIDO] cliente_id:', params.clienteId)
  console.log('[PEDIDO] pedido creado con id:', pedidoId)

  // 2. Crear un contenido por cada artículo
  for (const articulo of params.articulos) {
    try {
      const titulo =
        'titulo' in articulo ? articulo.titulo : ''
      const keyword =
        'keyword' in articulo ? articulo.keyword : ''
      const estructuraH =
        'estructuraH' in articulo ? articulo.estructuraH : ''
      const observaciones =
        'comentarios' in articulo
          ? articulo.comentarios.join('\n\n')
          : ''
      const urlDestino =
        'url' in articulo
          ? ((articulo as FilaExcelSeo).url || (articulo as ArticuloDetectado).url)
          : undefined

      const tamanyoMin =
        ('tamanyoMin' in articulo && articulo.tamanyoMin) ? articulo.tamanyoMin : undefined
      const tamanyoMax =
        ('tamanyoMax' in articulo && articulo.tamanyoMax) ? articulo.tamanyoMax : undefined
      const fechaEntregaArt =
        ('fechaEntrega' in articulo && articulo.fechaEntrega) ? articulo.fechaEntrega : undefined

      const slug = slugify(titulo)
      const brief = buildBriefInicial({
        keyword,
        titulo,
        estructuraH,
        observacionesSeo: observaciones,
        urlDestino,
        tamanyoMin,
        tamanyoMax,
      })

      // Garantizar slug único dentro del proyecto (igual que crearCliente)
      const { data: slugExistente } = await supabase
        .from('contenidos')
        .select('id')
        .eq('proyecto_id', params.proyectoId)
        .eq('slug', slug)
        .maybeSingle()
      const slugFinal = slugExistente ? `${slug}-${Date.now().toString(36)}` : slug

      // ── LOG 2: antes del INSERT ─────────────────────────────────────────
      console.log('[PEDIDO] Creando contenido:', titulo)
      console.log('[PEDIDO] slug:', slugFinal, '| keyword:', keyword, '| urlDestino:', urlDestino)

      const { data: contenido, error: contError } = await supabase
        .from('contenidos')
        .insert({
          titulo,
          slug: slugFinal,
          proyecto_id: params.proyectoId,
          cliente_id: params.clienteId,
          estado: 'pendiente',
          keyword_principal: keyword || null,
          url_destino: urlDestino || null,
          tamanyo_texto_min: tamanyoMin ?? null,
          tamanyo_texto_max: tamanyoMax ?? null,
          fecha_entrega: fechaEntregaArt || null,
          brief,
          activo: true,
        })
        .select('id')
        .single()

      // ── LOG 3: resultado del INSERT ─────────────────────────────────────
      console.log('[PEDIDO] Resultado INSERT:', JSON.stringify(contenido))
      console.log('[PEDIDO] Error INSERT:', JSON.stringify(contError))

      if (contError || !contenido) {
        errores.push(`Error en "${titulo}": ${contError?.message}`)
        continue
      }

      contenidosCreados++

      // Fire and forget — no bloqueamos la respuesta
      generarBriefEnBackground(
        contenido.id, titulo, estructuraH, observaciones,
        nombreCliente, nombreProyecto
      ).catch(console.error)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log('[PEDIDO] Excepción en bucle:', msg)
      errores.push(msg)
    }
  }

  // ── LOG 4: resumen final ──────────────────────────────────────────────────
  console.log('[PEDIDO] Total creados:', contenidosCreados)
  console.log('[PEDIDO] Errores acumulados:', errores)

  // 3. Actualizar el pedido con los resultados
  await supabase
    .from('pedidos')
    .update({
      estado: errores.length > 0 && contenidosCreados === 0 ? 'error' : 'completado',
      contenidos_generados: contenidosCreados,
      errores: errores as unknown[],
    })
    .eq('id', pedidoId)

  revalidatePath('/pedidos')
  revalidatePath('/proyectos')

  return { pedidoId, contenidosCreados }
}

/**
 * Crea un pedido manual con un único contenido.
 */
export async function crearPedidoManual(params: {
  clienteId: string
  proyectoId: string
  titulo: string
  keywordPrincipal?: string
  urlDestino?: string
  tamanyoMin?: number
  tamanyoMax?: number
  fechaEntrega?: string
  keywordsSecundarias: string[]
  tipoKeyword?: string
  volumenEstimado?: number
  featuredSnippet: boolean
  estructuraH?: string
  observacionesSeo?: string
  formatoRecomendado?: string
  fuentesSugeridas?: string
  linksObligatorios?: string
}): Promise<{ pedidoId: string; contenidoId: string }> {
  const supabase = createAdminClient()

  // Resolver nombres para el brief
  const [{ data: clienteRow }, { data: proyectoRow }] = await Promise.all([
    supabase.from('clientes').select('nombre').eq('id', params.clienteId).single(),
    supabase.from('proyectos').select('nombre').eq('id', params.proyectoId).single(),
  ])
  const nombreCliente  = clienteRow?.nombre  ?? ''
  const nombreProyecto = proyectoRow?.nombre ?? ''

  const brief = buildBriefInicial({
    keyword: params.keywordPrincipal ?? '',
    titulo: params.titulo,
    estructuraH: params.estructuraH ?? '',
    observacionesSeo: [
      params.observacionesSeo,
      params.fuentesSugeridas ? `Fuentes: ${params.fuentesSugeridas}` : '',
      params.linksObligatorios ? `Links obligatorios: ${params.linksObligatorios}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    urlDestino: params.urlDestino,
    keywordsSecundarias: params.keywordsSecundarias,
    tipoKeyword: params.tipoKeyword,
    volumenEstimado: params.volumenEstimado,
    featuredSnippet: params.featuredSnippet,
    formatoRecomendado: params.formatoRecomendado,
    tamanyoMin: params.tamanyoMin,
    tamanyoMax: params.tamanyoMax,
  })

  // 1. Crear pedido
  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .insert({
      tipo: 'manual',
      cliente_id: params.clienteId,
      proyecto_id: params.proyectoId,
      nombre_archivo: null,
      estado: 'procesando',
    })
    .select('id')
    .single()

  if (pedidoError || !pedido) {
    throw new Error(pedidoError?.message ?? 'No se pudo crear el pedido')
  }

  // 2. Crear contenido
  const { data: contenido, error: contError } = await supabase
    .from('contenidos')
    .insert({
      titulo: params.titulo,
      slug: slugify(params.titulo),
      proyecto_id: params.proyectoId,
      cliente_id: params.clienteId,
      estado: 'pendiente',
      keyword_principal: params.keywordPrincipal || null,
      url_destino: params.urlDestino || null,
      fecha_entrega: params.fechaEntrega || null,
      tamanyo_texto_min: params.tamanyoMin ?? null,
      tamanyo_texto_max: params.tamanyoMax ?? null,
      brief,
      activo: true,
    })
    .select('id')
    .single()

  if (contError || !contenido) {
    await supabase.from('pedidos').update({ estado: 'error' }).eq('id', pedido.id)
    throw new Error(contError?.message ?? 'No se pudo crear el contenido')
  }

  // 3. Actualizar pedido como completado
  await supabase
    .from('pedidos')
    .update({ estado: 'completado', contenidos_generados: 1 })
    .eq('id', pedido.id)

  // 4. Fire and forget brief generation
  generarBriefEnBackground(
    contenido.id,
    params.titulo,
    params.estructuraH ?? '',
    brief.observaciones_seo,
    nombreCliente,
    nombreProyecto
  ).catch(console.error)

  revalidatePath('/pedidos')
  revalidatePath('/proyectos')

  return { pedidoId: pedido.id, contenidoId: contenido.id }
}
