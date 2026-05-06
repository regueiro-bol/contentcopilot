import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

// ─────────────────────────────────────────────────────────────
// Prompt Brief SEO
// ─────────────────────────────────────────────────────────────

const BRIEF_SYSTEM = `Eres un director de estrategia de contenidos SEO para el mercado español con 10+ años de experiencia.
Generas briefs editoriales exhaustivos y accionables que permiten a un redactor producir contenido optimizado sin necesidad de investigación adicional.
Respondes siempre en español, con formato Markdown estructurado.`

function buildBriefPrompt(ctx: {
  // Artículo
  titulo: string
  slug: string
  mainKeyword: string
  secondaryKeywords: string[]
  cluster: string | null
  funnelStage: string | null
  volume: number | null
  difficulty: number | null
  suggestedMonth: string | null
  // Actualización
  esActualizacion: boolean
  existingUrl: string | null
  // GSC
  gscPosition: number | null
  gscClicks: number | null
  gscImpressions: number | null
  gscCtr: number | null
  gscOpportunity: string | null
  // Cliente
  clienteNombre: string
  clienteSector: string | null
  clienteDescripcion: string | null
  tonoVoz: string | null
  perfilLector: string | null
  competidores: string[] | null
  // Publicados
  publicados: { titulo: string; keyword: string | null }[]
}): string {
  const lines: string[] = []

  lines.push('# DATOS DEL ARTÍCULO')
  lines.push(`- Título: ${ctx.titulo}`)
  lines.push(`- URL slug: /${ctx.slug}`)
  lines.push(`- Keyword principal: ${ctx.mainKeyword}`)
  if (ctx.secondaryKeywords.length > 0) {
    lines.push(`- Keywords secundarias: ${ctx.secondaryKeywords.join(', ')}`)
  }
  if (ctx.cluster) lines.push(`- Cluster temático: ${ctx.cluster}`)
  if (ctx.funnelStage) lines.push(`- Etapa funnel: ${ctx.funnelStage.toUpperCase()}`)
  if (ctx.volume != null) lines.push(`- Volumen mensual: ${ctx.volume.toLocaleString('es-ES')}`)
  if (ctx.difficulty != null) lines.push(`- Dificultad KD: ${ctx.difficulty}/100`)
  if (ctx.suggestedMonth) lines.push(`- Mes de publicación sugerido: ${ctx.suggestedMonth}`)

  // Actualización
  if (ctx.esActualizacion) {
    lines.push('')
    lines.push('# ⚠️ TIPO: ACTUALIZACIÓN DE CONTENIDO EXISTENTE')
    lines.push(`Este artículo es una ACTUALIZACIÓN del contenido existente${ctx.existingUrl ? ` en: ${ctx.existingUrl}` : ''}.`)
    lines.push('Analiza qué tiene ese contenido y propón mejoras, nuevas secciones, datos actualizados y optimizaciones GEO que lo hagan más completo y efectivo.')
    lines.push('El brief debe centrarse en qué AÑADIR, MEJORAR y ACTUALIZAR, no en reescribir desde cero.')
  }

  // GSC
  if (ctx.gscPosition != null || ctx.gscClicks != null) {
    lines.push('')
    lines.push('# DATOS DE GOOGLE SEARCH CONSOLE (últimos 90 días)')
    if (ctx.gscPosition != null) lines.push(`- Posición media actual: ${ctx.gscPosition.toFixed(1)}`)
    if (ctx.gscClicks != null) lines.push(`- Clicks: ${ctx.gscClicks}`)
    if (ctx.gscImpressions != null) lines.push(`- Impresiones: ${ctx.gscImpressions}`)
    if (ctx.gscCtr != null) lines.push(`- CTR: ${(ctx.gscCtr * 100).toFixed(2)}%`)
    if (ctx.gscOpportunity) {
      const oppLabels: Record<string, string> = {
        existing: 'Ya posiciona bien (top 3) — mantener y mejorar',
        quick_win: 'Quick win (posición 4-20) — optimizar para subir',
        new: 'Keyword nueva — contenido a crear desde cero',
      }
      lines.push(`- Oportunidad: ${oppLabels[ctx.gscOpportunity] ?? ctx.gscOpportunity}`)
    }
  }

  // Cliente
  lines.push('')
  lines.push('# CONTEXTO DEL CLIENTE')
  lines.push(`- Nombre: ${ctx.clienteNombre}`)
  if (ctx.clienteSector) lines.push(`- Sector: ${ctx.clienteSector}`)
  if (ctx.clienteDescripcion) lines.push(`- Descripción: ${ctx.clienteDescripcion}`)
  if (ctx.tonoVoz) lines.push(`- Tono de voz: ${ctx.tonoVoz}`)
  if (ctx.perfilLector) lines.push(`- Perfil del lector objetivo: ${ctx.perfilLector}`)
  if (ctx.competidores && ctx.competidores.length > 0) {
    lines.push(`- Competidores principales: ${ctx.competidores.join(', ')}`)
  }

  // Publicados
  if (ctx.publicados.length > 0) {
    lines.push('')
    lines.push('# CONTENIDOS YA PUBLICADOS (no repetir enfoques)')
    for (const p of ctx.publicados) {
      lines.push(`- "${p.titulo}"${p.keyword ? ` (kw: ${p.keyword})` : ''}`)
    }
  }

  // Instrucciones
  lines.push('')
  lines.push('# INSTRUCCIONES — GENERA EL BRIEF COMPLETO')
  lines.push(`
Genera un brief SEO editorial exhaustivo con estas secciones obligatorias:

## 1. Resumen estratégico
2-3 párrafos explicando el objetivo del artículo, por qué es relevante para la estrategia del cliente y qué resultado SEO se espera.

## 2. Tipo de contenido recomendado
Indica uno: guía completa, comparativa, listicle, FAQ, tutorial paso a paso, análisis, opinión experta. Justifica brevemente.

## 3. Extensión recomendada
Número de palabras recomendado basado en la dificultad y el tipo de contenido. Formato: "X - Y palabras".

## 4. Estructura H2/H3 completa
Mínimo 5 H2 con al menos 2-3 H3 bajo cada uno. Formato:
- H2: Título del H2
  - H3: Subtema 1
  - H3: Subtema 2

## 5. Palabras clave a integrar
- Keyword principal (indicar dónde: título, H1, primer párrafo, meta description)
- Keywords secundarias (indicar en qué secciones usarlas naturalmente)
- Keywords LSI/semánticas relacionadas (5-10 sugerencias)

## 6. Recomendaciones GEO (optimización para IA)
a) 3-5 preguntas FAQ optimizadas para que la IA las cite como respuesta directa
b) Datos, cifras, estadísticas o citas que el artículo debe incluir para ser citado por LLMs
c) Definición clara y concisa del tema principal en las primeras 100 palabras
d) Elementos para featured snippets (listas, tablas, definiciones)

## 7. Contexto de marca
- Tono y estilo a mantener
- Restricciones o temas a evitar
- Referencias a contenido similar del cliente si aplica
${ctx.gscPosition != null ? `
## 8. Estrategia GSC
- Posición actual y objetivo
- Qué mejorar respecto al contenido existente (si aplica)
- Enfoque para ganar posiciones
` : ''}
Sé específico, práctico y accionable. El redactor debe poder escribir el artículo completo solo con este brief.`)

  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────
// Slug helper
// ─────────────────────────────────────────────────────────────

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80)
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/pedidos/desde-mapa
 *
 * Crea un contenido (pedido) a partir de un artículo del mapa de contenidos.
 * Genera automáticamente un brief SEO completo con Claude.
 *
 * Body: {
 *   map_item_id        : string
 *   client_id          : string
 *   titulo             : string
 *   keyword_principal  : string
 *   keywords_secundarias: string[]
 * }
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase  = createAdminClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const body = await request.json() as {
      map_item_id         : string
      client_id           : string
      titulo              : string
      keyword_principal   : string
      keywords_secundarias: string[]
      tipo?               : 'nuevo' | 'actualizacion'
      existing_url?       : string
    }

    const { map_item_id, client_id, titulo: tituloRaw, keyword_principal, keywords_secundarias } = body
    const esActualizacion = body.tipo === 'actualizacion'
    const titulo = esActualizacion ? `[ACTUALIZACIÓN] ${tituloRaw}` : tituloRaw

    if (!map_item_id || !client_id || !titulo) {
      return NextResponse.json(
        { error: 'map_item_id, client_id y titulo son obligatorios' },
        { status: 400 },
      )
    }

    // ── Verificar que el map_item existe y cargar datos completos ──
    const { data: mapItem } = await supabase
      .from('content_map_items')
      .select('id, contenido_id, map_id, title, slug, main_keyword, secondary_keywords, cluster, funnel_stage, volume, difficulty, suggested_month')
      .eq('id', map_item_id)
      .single()

    if (!mapItem) {
      return NextResponse.json({ error: 'Artículo del mapa no encontrado' }, { status: 404 })
    }

    if (mapItem.contenido_id) {
      return NextResponse.json({
        ok          : true,
        contenido_id: mapItem.contenido_id,
        message     : 'Ya existe un pedido para este artículo',
      })
    }

    // ── Buscar o crear proyecto "Estrategia SEO" ──
    const PROJECT_NAME = 'Estrategia SEO'

    let { data: proyecto } = await supabase
      .from('proyectos')
      .select('id, tono_voz, etiquetas_tono, perfil_lector')
      .eq('cliente_id', client_id)
      .eq('nombre', PROJECT_NAME)
      .eq('activo', true)
      .maybeSingle()

    if (!proyecto) {
      const { data: newProyecto, error: projError } = await supabase
        .from('proyectos')
        .insert({
          cliente_id : client_id,
          nombre     : PROJECT_NAME,
          slug       : 'estrategia-seo',
          descripcion: 'Proyecto auto-creado desde el mapa de contenidos',
          activo     : true,
        })
        .select('id, tono_voz, etiquetas_tono, perfil_lector')
        .single()

      if (projError || !newProyecto) {
        console.error('[DesdeMapa] Error creando proyecto:', JSON.stringify(projError))
        return NextResponse.json({ error: `Error creando el proyecto: ${projError?.message ?? 'desconocido'}` }, { status: 500 })
      }
      proyecto = newProyecto
      console.log(`[DesdeMapa] Proyecto "${PROJECT_NAME}" creado: ${proyecto.id}`)
    }

    // ── Crear contenido (o detectar duplicado por slug) ──
    const slug = toSlug(titulo)

    // Comprobar si ya existe un contenido con ese slug en el mismo proyecto
    const { data: existente } = await supabase
      .from('contenidos')
      .select('id')
      .eq('proyecto_id', proyecto.id)
      .eq('slug', slug)
      .maybeSingle()

    if (existente) {
      console.log(`[DesdeMapa] Contenido ya existe: ${existente.id} (slug: ${slug})`)
      // Vincular map_item si no lo estaba
      await supabase
        .from('content_map_items')
        .update({ contenido_id: existente.id, status: 'assigned', updated_at: new Date().toISOString() })
        .eq('id', map_item_id)
      return NextResponse.json({
        ok            : true,
        contenido_id  : existente.id,
        already_exists: true,
      })
    }

    const { data: contenido, error: contError } = await supabase
      .from('contenidos')
      .insert({
        titulo,
        slug,
        proyecto_id      : proyecto.id,
        cliente_id       : client_id,
        estado           : 'pendiente',
        keyword_principal: keyword_principal || null,
      })
      .select('id')
      .single()

    if (contError || !contenido) {
      console.error('[DesdeMapa] Error creando contenido:', contError)
      return NextResponse.json({ error: contError?.message ?? 'Error creando el contenido' }, { status: 500 })
    }

    console.log(`[DesdeMapa] Contenido creado: ${contenido.id}`)

    // ── Vincular map_item al contenido ──
    await supabase
      .from('content_map_items')
      .update({ contenido_id: contenido.id, status: 'assigned', updated_at: new Date().toISOString() })
      .eq('id', map_item_id)

    // ── Recopilar contexto para el brief ──
    console.log('[DesdeMapa] Recopilando contexto para brief...')

    // 1. Datos GSC (via content_maps → session_id → keywords)
    let gscData: { gsc_clicks: number | null; gsc_impressions: number | null; gsc_position: number | null; gsc_ctr: number | null; gsc_opportunity: string | null } | null = null
    try {
      const { data: mapData } = await supabase
        .from('content_maps')
        .select('session_id')
        .eq('id', mapItem.map_id)
        .single()

      if (mapData?.session_id) {
        const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
        const { data: kwData } = await supabase
          .from('keywords')
          .select('gsc_clicks, gsc_impressions, gsc_position, gsc_ctr, gsc_opportunity')
          .eq('session_id', mapData.session_id)
          .ilike('keyword', normalize(keyword_principal))
          .maybeSingle()

        if (kwData) gscData = kwData
      }
    } catch {
      console.warn('[DesdeMapa] Error obteniendo datos GSC (continuamos sin ellos)')
    }

    // 2. Datos del cliente
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, sector, descripcion, tono_voz, perfil_lector, competidores')
      .eq('id', client_id)
      .single()

    // 3. Últimos 3 contenidos publicados del cliente
    const { data: publicados } = await supabase
      .from('contenidos')
      .select('titulo, keyword_principal')
      .eq('cliente_id', client_id)
      .eq('estado', 'publicado')
      .order('updated_at', { ascending: false })
      .limit(3)

    // ── Generar brief con Claude ──
    console.log('[DesdeMapa] Generando brief con Claude...')

    const briefPrompt = buildBriefPrompt({
      titulo: tituloRaw,
      slug,
      mainKeyword       : keyword_principal,
      secondaryKeywords : keywords_secundarias ?? [],
      cluster           : (mapItem.cluster as string | null) ?? null,
      esActualizacion,
      existingUrl       : body.existing_url ?? null,
      funnelStage       : (mapItem.funnel_stage as string | null) ?? null,
      volume            : mapItem.volume != null ? Number(mapItem.volume) : null,
      difficulty        : mapItem.difficulty != null ? Number(mapItem.difficulty) : null,
      suggestedMonth    : (mapItem.suggested_month as string | null) ?? null,
      gscPosition       : gscData?.gsc_position != null ? Number(gscData.gsc_position) : null,
      gscClicks         : gscData?.gsc_clicks != null ? Number(gscData.gsc_clicks) : null,
      gscImpressions    : gscData?.gsc_impressions != null ? Number(gscData.gsc_impressions) : null,
      gscCtr            : gscData?.gsc_ctr != null ? Number(gscData.gsc_ctr) : null,
      gscOpportunity    : (gscData?.gsc_opportunity as string | null) ?? null,
      clienteNombre     : cliente?.nombre ?? 'Cliente',
      clienteSector     : cliente?.sector ?? null,
      clienteDescripcion: cliente?.descripcion ?? null,
      tonoVoz           : (proyecto.tono_voz as string | null) || (cliente?.tono_voz as string | null) || null,
      perfilLector      : (proyecto.perfil_lector as string | null) || (cliente?.perfil_lector as string | null) || null,
      competidores      : Array.isArray(cliente?.competidores) ? cliente.competidores as string[] : null,
      publicados        : (publicados ?? []).map((p) => ({
        titulo : String(p.titulo),
        keyword: (p.keyword_principal as string | null) ?? null,
      })),
    })

    const response = await anthropic.messages.create({
      model     : 'claude-sonnet-4-5',
      max_tokens: 4096,
      system    : BRIEF_SYSTEM,
      messages  : [{ role: 'user', content: briefPrompt }],
    })

    const briefText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    console.log(`[DesdeMapa] Brief generado: ${briefText.length} chars, ${response.usage.output_tokens} tokens`)

    // ── Guardar brief en contenido ──
    if (briefText) {
      const { error: briefError } = await supabase
        .from('contenidos')
        .update({ brief: { texto_generado: briefText } })
        .eq('id', contenido.id)

      if (briefError) {
        console.error('[DesdeMapa] Error guardando brief:', briefError)
        // No fatal — el contenido existe, el brief se puede regenerar manualmente
      } else {
        console.log(`[DesdeMapa] Brief guardado en contenido ${contenido.id}`)
      }
    }

    return NextResponse.json({
      ok             : true,
      contenido_id   : contenido.id,
      brief_generated: briefText.length > 0,
    })

  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('[DesdeMapa] Error inesperado:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
