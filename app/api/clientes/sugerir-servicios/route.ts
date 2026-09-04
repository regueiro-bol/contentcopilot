/**
 * POST /api/clientes/sugerir-servicios
 * Body: { cliente_id: string }
 *
 * Propone la lista de servicios y productos que vende el cliente leyendo
 * su descripción corporativa y el análisis de su contenido publicado.
 *
 * Es una SUGERENCIA: el usuario confirma o corrige antes de guardar.
 * Nada se escribe en `clientes` desde aquí.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

const SYSTEM_PROMPT = `Eres un analista de negocio. Identificas con precisión qué servicios y productos vende una empresa a partir de su propia documentación. Respondes ÚNICAMENTE con un JSON array de strings, sin texto adicional.`

export async function POST(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let cliente_id: string | undefined
  try {
    const body = await req.json() as { cliente_id?: string }
    cliente_id = body.cliente_id
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!cliente_id) {
    return NextResponse.json({ error: 'cliente_id es obligatorio' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── Cargar cliente + análisis de contenido publicado ──────────────────
  const [clienteRes, analisisRes] = await Promise.all([
    supabase
      .from('clientes')
      .select('nombre, sector, descripcion, identidad_corporativa, servicios_productos')
      .eq('id', cliente_id)
      .maybeSingle(),
    supabase
      .from('analisis_web')
      .select('tematicas_detectadas, resumen')
      .eq('cliente_id', cliente_id)
      .eq('tipo', 'cliente')
      .order('fecha_analisis', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const cliente = clienteRes.data
  if (!cliente) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  // ── Construir las fuentes ─────────────────────────────────────────────
  const fuentes: string[] = []

  fuentes.push(`Nombre: ${cliente.nombre}`)
  if (cliente.sector)      fuentes.push(`Sector: ${cliente.sector}`)
  if (cliente.descripcion) fuentes.push(`Descripción corporativa:\n${cliente.descripcion}`)
  if (cliente.identidad_corporativa) {
    fuentes.push(`Identidad de marca:\n${String(cliente.identidad_corporativa).substring(0, 800)}`)
  }

  const analisis = analisisRes.data
  if (analisis) {
    const tematicas = Array.isArray(analisis.tematicas_detectadas)
      ? (analisis.tematicas_detectadas as Array<{ tema?: string; porcentaje?: number }>)
      : []
    if (tematicas.length > 0) {
      fuentes.push(
        'Temáticas detectadas en su contenido publicado:\n' +
        tematicas
          .slice(0, 20)
          .map((t) => `  - ${t.tema ?? ''}${t.porcentaje != null ? ` (${t.porcentaje}%)` : ''}`)
          .join('\n'),
      )
    }

    const resumen = (analisis.resumen ?? {}) as {
      resumen_ejecutivo?: string
      keywords_principales?: string[]
    }
    if (resumen.resumen_ejecutivo) {
      fuentes.push(`Resumen del análisis de contenido publicado:\n${resumen.resumen_ejecutivo.substring(0, 1500)}`)
    }
    if (Array.isArray(resumen.keywords_principales) && resumen.keywords_principales.length > 0) {
      fuentes.push(`Keywords principales detectadas: ${resumen.keywords_principales.slice(0, 30).join(', ')}`)
    }
  }

  const yaExistentes = Array.isArray(cliente.servicios_productos)
    ? (cliente.servicios_productos as string[]).filter(Boolean)
    : []

  const bloqueExistente = yaExistentes.length > 0
    ? `\n\nYa hay esta lista guardada — consérvala e incorpora solo lo que falte:\n${yaExistentes.map((s) => `  - ${s}`).join('\n')}`
    : ''

  const userPrompt = `A partir de la siguiente documentación, identifica los SERVICIOS Y PRODUCTOS concretos que esta empresa vende a sus clientes.

${fuentes.join('\n\n')}${bloqueExistente}

Criterios:
- Incluye solo lo que la empresa COBRA por prestar o vender.
- Un elemento por servicio o producto, con el nombre que usaría la propia empresa.
- Nombres cortos y concretos (2-6 palabras), en español, en minúscula salvo nombres propios.
- NO incluyas valores de marca, atributos ("trato cercano", "profesionalidad"),
  ni temáticas de contenido que no sean vendibles.
- NO inventes servicios que no estén respaldados por la documentación.
- Si la documentación es insuficiente, devuelve solo lo que puedas justificar.
- Entre 3 y 25 elementos.

Responde ÚNICAMENTE con un JSON array de strings:
["servicio uno", "servicio dos", "producto tres"]`

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response  = await anthropic.messages.create({
      model     : 'claude-sonnet-4-6',
      max_tokens: 1500,
      system    : SYSTEM_PROMPT,
      messages  : [{ role: 'user', content: userPrompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
    const match   = rawText.match(/\[[\s\S]*\]/)

    if (!match) {
      console.warn('[sugerir-servicios] No se encontró JSON array en la respuesta')
      return NextResponse.json({ error: 'La IA no devolvió una lista válida' }, { status: 502 })
    }

    const parsed = JSON.parse(match[0]) as unknown[]
    const servicios = parsed
      .map((s) => String(s ?? '').trim())
      .filter((s) => s.length > 0 && s.length <= 120)
      .slice(0, 25)

    // Deduplicar respetando el orden
    const vistos = new Set<string>()
    const unicos = servicios.filter((s) => {
      const k = s.toLowerCase()
      if (vistos.has(k)) return false
      vistos.add(k)
      return true
    })

    console.log(`[sugerir-servicios] ${unicos.length} servicios propuestos para ${cliente.nombre}`)

    return NextResponse.json({
      servicios    : unicos,
      fuentes_usadas: {
        descripcion       : !!cliente.descripcion,
        identidad         : !!cliente.identidad_corporativa,
        analisis_publicado: !!analisis,
      },
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[sugerir-servicios] Error:', msg)
    return NextResponse.json({ error: `Error generando sugerencias: ${msg}` }, { status: 500 })
  }
}
