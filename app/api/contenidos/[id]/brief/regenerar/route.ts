import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

const BRIEF_SYSTEM = `Eres un director de estrategia de contenidos SEO para el mercado español con 10+ años de experiencia.
Generas briefs editoriales exhaustivos y accionables que permiten a un redactor producir contenido optimizado sin necesidad de investigación adicional.
Respondes siempre en español, con formato Markdown estructurado.

REGLA TIPOGRÁFICA: Los títulos y H2/H3 deben seguir la tipografía española: solo la primera palabra del título lleva mayúscula inicial, el resto en minúscula (excepto nombres propios). NUNCA uses English Title Case.

IMPORTANTE: El brief debe estar COMPLETO. No cortes ninguna sección.
Si el espacio es limitado, reduce el detalle de secciones anteriores pero SIEMPRE completa las 7 secciones obligatorias.`

function parseExtension(text: string): { min: number | null; max: number | null } {
  const patterns = [
    /(\d[\d.,]*)\s*[–\-a]\s*(\d[\d.,]*)\s*palabras/i,
    /entre\s*(\d[\d.,]*)\s*y\s*(\d[\d.,]*)\s*palabras/i,
    /(\d[\d.,]*)\s*palabras/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const min = parseInt(match[1].replace(/[.,]/g, ''), 10)
      const max = match[2]
        ? parseInt(match[2].replace(/[.,]/g, ''), 10)
        : min + Math.round(min * 0.25)
      if (!isNaN(min) && min > 100) return { min, max: isNaN(max) ? null : max }
    }
  }
  return { min: null, max: null }
}

function deriveFunnelStage(max: number | null | undefined): string | null {
  if (max == null) return null
  if (max <= 1500) return 'bofu'
  if (max <= 1900) return 'mofu'
  return 'tofu'
}

/**
 * POST /api/contenidos/[id]/brief/regenerar
 *
 * Regenera el brief de un contenido usando los datos que el sistema ya conoce.
 * Acepta un `comentario` opcional que se inyecta como instrucción prioritaria.
 * Registra siempre una fila en brief_regeneraciones.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase  = createAdminClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const body = await request.json() as { comentario?: string }
    const comentario = typeof body.comentario === 'string' && body.comentario.trim()
      ? body.comentario.trim()
      : null

    // ── Cargar contenido ──────────────────────────────────────────────────────
    const { data: c, error: errC } = await supabase
      .from('contenidos')
      .select('id, titulo, slug, keyword_principal, proyecto_id, cliente_id, brief, tamanyo_texto_min, tamanyo_texto_max')
      .eq('id', params.id)
      .single()

    if (errC || !c) {
      return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })
    }

    // ── Cargar proyecto + cliente ─────────────────────────────────────────────
    const [{ data: proyecto }, { data: cliente }, { data: publicados }] = await Promise.all([
      supabase
        .from('proyectos')
        .select('nombre, tono_voz, perfil_lector, extension_min, extension_max')
        .eq('id', c.proyecto_id)
        .single(),
      supabase
        .from('clientes')
        .select('nombre, sector, descripcion')
        .eq('id', c.cliente_id)
        .single(),
      supabase
        .from('contenidos')
        .select('titulo, keyword_principal')
        .eq('proyecto_id', c.proyecto_id)
        .neq('id', params.id)
        .in('estado', ['publicado', 'aprobado'])
        .limit(15),
    ])

    const brief      = c.brief as Record<string, unknown> | null
    const kwSecundarias: string[] = Array.isArray(brief?.keywords_secundarias)
      ? (brief!.keywords_secundarias as string[])
      : []

    const extMin  = c.tamanyo_texto_min ?? proyecto?.extension_min ?? null
    const extMax  = c.tamanyo_texto_max ?? proyecto?.extension_max ?? null
    const funnel  = deriveFunnelStage(extMax)

    // ── Construir prompt del brief ────────────────────────────────────────────
    const lines: string[] = []

    lines.push('# DATOS DEL ARTÍCULO')
    lines.push(`- Título: ${c.titulo}`)
    if (c.slug) lines.push(`- URL slug: /${c.slug}`)
    if (c.keyword_principal) lines.push(`- Keyword principal: ${c.keyword_principal}`)
    if (kwSecundarias.length > 0) lines.push(`- Keywords secundarias: ${kwSecundarias.join(', ')}`)
    if (funnel) lines.push(`- Etapa funnel: ${funnel.toUpperCase()}`)

    lines.push('')
    lines.push('# CONTEXTO DEL CLIENTE')
    lines.push(`- Nombre: ${cliente?.nombre ?? 'No especificado'}`)
    if (cliente?.sector) lines.push(`- Sector: ${cliente.sector}`)
    if (cliente?.descripcion) lines.push(`- Descripción: ${cliente.descripcion}`)
    if (proyecto?.tono_voz) lines.push(`- Tono de voz: ${proyecto.tono_voz}`)
    if (proyecto?.perfil_lector) lines.push(`- Perfil del lector objetivo: ${proyecto.perfil_lector}`)

    if ((publicados ?? []).length > 0) {
      lines.push('')
      lines.push('# CONTENIDOS YA PUBLICADOS (no repetir enfoques)')
      for (const p of publicados!) {
        lines.push(`- "${p.titulo}"${p.keyword_principal ? ` (kw: ${p.keyword_principal})` : ''}`)
      }
    }

    // Extensión obligatoria
    if (extMin != null) {
      const extStr = extMax != null
        ? `entre ${extMin.toLocaleString('es-ES')} y ${extMax.toLocaleString('es-ES')} palabras`
        : `mínimo ${extMin.toLocaleString('es-ES')} palabras`
      lines.push('')
      lines.push('# ⚠️ EXTENSIÓN OBLIGATORIA')
      lines.push(`El artículo DEBE tener ${extStr}. Adapta la profundidad, número de secciones y ejemplos para alcanzar exactamente este rango. Esta instrucción tiene prioridad sobre cualquier otra estimación de extensión.`)
    }

    // Comentario del editor — instrucción de máxima prioridad
    if (comentario) {
      lines.push('')
      lines.push('# 🔴 INSTRUCCIÓN PRIORITARIA DEL EDITOR')
      lines.push('La siguiente indicación del editor tiene prioridad absoluta sobre cualquier decisión editorial anterior:')
      lines.push(comentario)
    }

    lines.push('')
    lines.push('# INSTRUCCIONES — GENERA EL BRIEF COMPLETO')
    lines.push(`
Genera un brief SEO editorial exhaustivo con estas secciones obligatorias:

## 1. Resumen estratégico
2-3 párrafos explicando el objetivo del artículo, por qué es relevante para la estrategia del cliente y qué resultado SEO se espera.

## 2. Tipo de contenido recomendado
Indica uno: guía completa, comparativa, listicle, FAQ, tutorial paso a paso, análisis, opinión experta. Justifica brevemente.

## 3. Extensión recomendada
${funnel === 'bofu'
  ? 'Rango obligatorio para BOFU: 1000-1500 palabras.'
  : funnel === 'mofu'
    ? 'Rango obligatorio para MOFU: 1300-1900 palabras.'
    : 'Rango obligatorio para TOFU: 1600-2400 palabras.'}
Elige un rango concreto DENTRO de ese límite según la complejidad real del tema. Este rango es un techo absoluto. Formato: "X - Y palabras".

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

Sé específico, práctico y accionable. El redactor debe poder escribir el artículo completo solo con este brief.`)

    const userPrompt = lines.join('\n')

    // ── Llamada a Claude ──────────────────────────────────────────────────────
    const respuesta = await anthropic.messages.create({
      model     : 'claude-sonnet-4-6',
      max_tokens: 8000,
      system    : BRIEF_SYSTEM,
      messages  : [{ role: 'user', content: userPrompt }],
    })

    const briefText = respuesta.content[0]?.type === 'text' ? respuesta.content[0].text : ''
    if (!briefText) throw new Error('Claude no devolvió contenido')

    // ── Parsear extensión ─────────────────────────────────────────────────────
    const { min: newMin, max: newMax } = parseExtension(briefText)

    // ── Actualizar contenido ──────────────────────────────────────────────────
    const updatePayload: Record<string, unknown> = {
      brief     : { ...(brief ?? {}), texto_generado: briefText },
      updated_at: new Date().toISOString(),
    }
    if (newMin !== null) {
      updatePayload.tamanyo_texto_min = newMin
      updatePayload.tamanyo_texto_max = newMax
    }

    await supabase.from('contenidos').update(updatePayload).eq('id', params.id)

    // ── Registrar en histórico ────────────────────────────────────────────────
    await supabase.from('brief_regeneraciones').insert({
      contenido_id: params.id,
      proyecto_id : c.proyecto_id,
      cliente_id  : c.cliente_id,
      usuario_id  : userId,
      comentario  : comentario,
    })

    return NextResponse.json({
      ok            : true,
      texto_generado: briefText,
      tamanyo_texto_min: newMin ?? extMin,
      tamanyo_texto_max: newMax ?? extMax,
    })
  } catch (error) {
    console.error('[/api/contenidos/brief/regenerar] Error:', error instanceof Error ? error.stack : error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
