import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'

/**
 * POST /api/strategy/suggest-seeds
 *
 * Usa Claude para sugerir 15 keywords semilla adicionales
 * basándose en el cliente, objetivos y seeds actuales.
 *
 * Body: { cliente: string, objetivos: string, seeds_actuales: string[] }
 * Response: { seeds: string[] }
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      cliente     = '',
      objetivos   = '',
      seeds_actuales = [] as string[],
    } = body

    if (!cliente && !objetivos) {
      return NextResponse.json(
        { error: 'Se necesita al menos el nombre del cliente u objetivos para sugerir seeds.' },
        { status: 400 },
      )
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const seedsActualesTexto = seeds_actuales.length > 0
      ? seeds_actuales.slice(0, 30).join(', ')
      : '(ninguna todavía)'

    const systemPrompt = `Eres un experto en SEO para el mercado español con más de 10 años de experiencia en estrategia de contenidos y posicionamiento orgánico.
Tu especialidad es identificar oportunidades de keywords con alto potencial editorial para blogs, landings y estrategias de contenido.
Siempre propones keywords en español, orientadas al mercado español (España), y cubres una variedad de intenciones de búsqueda (informacional, transaccional, comercial y navegacional).
Respondes ÚNICAMENTE con el JSON pedido, sin texto adicional.`

    const userPrompt = `Propón 15 keywords semilla adicionales para la siguiente estrategia de contenidos.

**Cliente:** ${cliente || 'No especificado'}
**Objetivos:** ${objetivos || 'No especificados'}
**Seeds actuales:** ${seedsActualesTexto}

**Criterios:**
- Las keywords deben ser relevantes para el cliente y sus objetivos
- Orientadas al mercado español (búsquedas en español, contexto España)
- Variedad de intenciones: informacional (cómo, qué, por qué...), transaccional (comprar, precio, contratar...), comercial (mejor, comparar, reseña...) y navegacional
- Incluye tanto keywords de cabeza (head terms) como de cola larga (long-tail)
- Complementa y amplía las seeds actuales, no las repitas
- Prioriza keywords con potencial editorial real (artículos de blog, guías, comparativas)

Responde ÚNICAMENTE con un JSON array de 15 strings:
["keyword 1", "keyword 2", "keyword 3", ..., "keyword 15"]`

    const response = await anthropic.messages.create({
      model     : 'claude-sonnet-4-5',
      max_tokens: 512,
      system    : systemPrompt,
      messages  : [{ role: 'user', content: userPrompt }],
    })

    const bloque = response.content[0]
    const rawText = bloque.type === 'text' ? bloque.text.trim() : '[]'

    // Parsear el JSON — extraer el array aunque venga con texto extra
    let seeds: string[] = []
    const match = rawText.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed)) {
          seeds = parsed
            .filter((s) => typeof s === 'string' && s.trim())
            .map((s: string) => s.trim())
            .slice(0, 15)
        }
      } catch {
        console.error('[suggest-seeds] Error parseando JSON:', rawText)
      }
    }

    if (seeds.length === 0) {
      return NextResponse.json(
        { error: 'No se pudieron generar sugerencias. Inténtalo de nuevo.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ seeds })

  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('[suggest-seeds] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
