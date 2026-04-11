/**
 * POST /api/social/analyze-revision
 *
 * Analiza unas instrucciones de revisión y determina qué fases de la estrategia
 * necesitan ser regeneradas.
 *
 * Body: { clientId: string, instructions: string }
 * Returns: { affectedPhases: number[], phaseImpacts: Record<string, string> }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste, calcularCosteClaudeUSD } from '@/lib/costes'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  let body: { clientId: string; instructions: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId, instructions } = body
  if (!clientId)    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  if (!instructions?.trim()) return NextResponse.json({ error: 'instructions requerido' }, { status: 400 })

  try {
    const supabase = createAdminClient()
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, sector')
      .eq('id', clientId)
      .single()

    const clienteNombre = cliente ? `${cliente.nombre}${cliente.sector ? ` (${cliente.sector})` : ''}` : clientId

    const userPrompt = `CLIENTE: ${clienteNombre}

INSTRUCCIONES DE REVISIÓN:
${instructions}

Las fases de la estrategia social son:
- Fase 2: Estrategia de plataformas (decisiones por plataforma, arquitectura del ecosistema, diferenciación editorial)
- Fase 3: Arquitectura de contenidos (pilares editoriales, formatos por plataforma, cadencia de publicación, calendario tipo)
- Fase 4: Tono y voz de marca (manual de voz, registro por plataforma, líneas rojas, guidelines de consistencia)
- Fase 5: KPIs y métricas (indicadores por objetivo, metodología de medición, sistema de reporting)
- Fase 6: Plan de acción (roadmap de implementación, primeros 90 días, equipo y recursos)

Analiza las instrucciones de revisión y determina qué fases necesitan ser regeneradas.
Ten en cuenta las dependencias: si la Fase 2 cambia, las fases posteriores probablemente también necesitan actualizarse.

Para cada fase afectada, explica brevemente por qué debe regenerarse (máximo 15 palabras).

Responde SOLO con JSON sin markdown:
{
  "affectedPhases": [2, 3, 4, 5, 6],
  "phaseImpacts": {
    "2": "Motivo breve de por qué afecta a Fase 2",
    "3": "Motivo breve de por qué afecta a Fase 3"
  }
}`

    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model     : 'claude-sonnet-4-5',
      max_tokens: 512,
      system    : `Eres un consultor senior de estrategia de contenidos. Tu tarea es analizar instrucciones de revisión de una estrategia social y determinar exactamente qué fases necesitan ser regeneradas, teniendo en cuenta las dependencias entre fases. Sé preciso: no incluyas fases que no sean necesarias regenerar.`,
      messages  : [{ role: 'user', content: userPrompt }],
    })

    const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude no devolvió JSON válido')

    const result = JSON.parse(jsonMatch[0]) as {
      affectedPhases: number[]
      phaseImpacts  : Record<string, string>
    }

    // Sanity check — solo fases 2-6
    result.affectedPhases = (result.affectedPhases ?? []).filter((n) => n >= 2 && n <= 6)

    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-analyze-revision',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
    }).catch(console.error)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/analyze-revision] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
