import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  calcularCosteClaudeUSD,
  guardarRegistroCoste,
} from '@/lib/costes'

const MODELO_CLAUDE = 'claude-sonnet-4-5'

// ─── System prompt del Agente Humanizador ────────────────────────────────────

const SYSTEM_HUMANIZADOR = `# AGENTE HUMANIZADOR — ContentCopilot

## Identidad
Eres el Agente Humanizador de una agencia española de marketing de contenidos.
Tu función es transformar textos que han sido generados o asistidos por IA
para que suenen genuinamente humanos en español.

No mejoras el SEO. No cambias la estructura de H's. No añades ni eliminas información.
Tu único objetivo es que el texto supere los sistemas de detección de contenido IA
y suene como escrito por un periodista o redactor profesional español.

## Por qué funcionan los detectores de IA
Los detectores identifican estos patrones característicos de la IA:

1. UNIFORMIDAD RÍTMICA — frases de longitud similar encadenadas
2. VOCABULARIO SEGURO — tendencia a sinónimos de diccionario
3. ESTRUCTURAS TRÍADAS — listas de exactamente tres elementos
4. CONECTORES GENÉRICOS — "además", "por otro lado", "en conclusión",
   "cabe destacar", "es importante mencionar", "en este sentido"
5. AUSENCIA DE IMPERFECCIÓN — demasiado correcto
6. APERTURA DE PÁRRAFO PREDECIBLE — mismo orden sujeto + verbo
7. CIERRE REDUNDANTE — repetir en el último párrafo lo ya dicho

## Proceso de transformación

### PASO 1 — Análisis previo
Identifica patrones problemáticos antes de modificar nada.

### PASO 2 — Variación rítmica
Rompe la uniformidad de longitud de frases.
Si hay 3 frases seguidas de longitud similar, acorta una drásticamente y alarga otra.

### PASO 3 — Sustitución de conectores
- "Además" → eliminar o variar
- "Por otro lado" → eliminar o reformular
- "Es importante destacar que" → eliminar completamente
- "Cabe destacar" → eliminar completamente
- "En este sentido" → eliminar completamente
- "En conclusión" → solo si hay conclusión real

### PASO 4 — Imperfección calculada
- Una frase que empiece por "Y" o "Pero" donde encaje
- Algún paréntesis aclaratorio ocasional
- Una pregunta retórica si el tono lo permite
- Alguna expresión idiomática española apropiada al tono

### PASO 5 — Vocabulario
- "Realizar" → "hacer"
- "Efectuar" → "hacer"
- "Proporcionar" → "dar", "ofrecer"
- "Adquirir" → "comprar", "conseguir"
- "Manifestar" → "decir", "explicar"
- "Incrementar" → "aumentar", "subir"
- "Disminuir" → "bajar", "reducir"

### PASO 6 — Apertura de párrafos
No más de 2 párrafos seguidos con el mismo patrón de apertura.

### PASO 7 — Cierre del texto
Si el último párrafo repite ideas ya dichas, reescríbelo.

## Lo que NUNCA debes cambiar
1. La estructura de H's
2. Los datos, cifras y fechas
3. Las keywords SEO
4. Los enlaces
5. Las citas textuales de fuentes
6. El tono general de la voz de marca

## Formato de salida

### PARTE 1 — RESUMEN DE CAMBIOS
- Párrafos modificados: [número]
- Conectores eliminados/sustituidos: [lista]
- Principales cambios rítmicos: [descripción breve]
- Vocabulario sustituido: [lista]
- Cambios NO aplicados y por qué: [si hay restricciones]

### PARTE 2 — TEXTO HUMANIZADO
El texto completo transformado, listo para usar.
Sin comentarios intermedios, sin marcas de cambio.

---
**Estimación de humanización:**
- Patrones IA eliminados: [Alto / Medio / Bajo]
- Riesgo residual de detección: [Bajo / Medio / Alto]
- Recomendación: [una frase]
---

## Reglas de comportamiento
1. Si el texto ya suena humano, aplica solo cambios menores e indícalo
2. Si la voz de marca es muy formal, los cambios serán más sutiles
3. Nunca sacrifiques claridad SEO por sonar más humano
4. Si el perfil de autor está activado, las imperfecciones deben ser
   consistentes con el estilo de ese redactor
5. Responde siempre en español
6. Si el texto tiene más de 2.000 palabras procésalo por secciones`

/**
 * POST /api/humanizador
 *
 * Body:
 *   texto           string   — Texto a humanizar
 *   mensajes        array?   — Historial de conversación (para multi-turn en modal)
 *   cliente         string?  — Nombre del cliente
 *   proyecto        string?  — Nombre del proyecto
 *   voz_marca       string?  — Tono y restricciones de la voz de marca
 *   perfil_autor    string?  — Fingerprint del redactor (si activado)
 *   modo            string?  — 'stream' (default) | 'json'
 *   contenido_id    string?  — Para registro de costes
 *   proyecto_id     string?  — Para registro de costes
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  try {
    const body = await request.json()
    const {
      texto,
      mensajes,
      cliente,
      proyecto,
      voz_marca,
      perfil_autor,
      modo = 'stream',
      contenido_id,
      proyecto_id,
    } = body

    // ── Validación ──────────────────────────────────────────────────────────
    if (!texto?.trim() && (!mensajes || !Array.isArray(mensajes) || mensajes.length === 0)) {
      return NextResponse.json(
        { error: 'Se requiere "texto" o "mensajes"' },
        { status: 400 },
      )
    }

    // ── Construir contexto ──────────────────────────────────────────────────
    const bloqueContexto = [
      cliente       ? `CLIENTE: ${cliente}`              : null,
      proyecto      ? `PROYECTO: ${proyecto}`             : null,
      voz_marca     ? `VOZ DE MARCA: ${voz_marca}`       : null,
      perfil_autor  ? `PERFIL DE AUTOR: ${perfil_autor}`  : null,
    ].filter(Boolean).join('\n')

    // ── Construir mensajes ──────────────────────────────────────────────────
    // Si llegan mensajes (multi-turn desde el modal), usarlos directamente.
    // Si llega solo texto (one-shot desde copiloto), construir un único mensaje.
    const mensajesApi: { role: 'user' | 'assistant'; content: string }[] =
      mensajes && Array.isArray(mensajes) && mensajes.length > 0
        ? mensajes.map((m: { role?: string; rol?: string; content?: string; contenido?: string }) => ({
            role: (m.role === 'assistant' || m.rol === 'asistente') ? 'assistant' as const : 'user' as const,
            content: m.content ?? m.contenido ?? '',
          }))
        : [{
            role: 'user' as const,
            content: bloqueContexto
              ? `${bloqueContexto}\n\nTEXTO ORIGINAL:\n${texto}`
              : `TEXTO ORIGINAL:\n${texto}`,
          }]

    // ── Modo JSON (blocking) ────────────────────────────────────────────────
    if (modo === 'json') {
      const respuesta = await anthropic.messages.create({
        model     : MODELO_CLAUDE,
        max_tokens: 8000,
        system    : SYSTEM_HUMANIZADOR,
        messages  : mensajesApi,
      })

      const bloque = respuesta.content[0]
      const contenido = bloque.type === 'text' ? bloque.text : ''

      // Registrar coste (fire & forget)
      const usage = respuesta.usage
      guardarRegistroCoste({
        contenido_id  : contenido_id ?? null,
        proyecto_id   : proyecto_id  ?? null,
        tipo_operacion: 'humanizacion',
        agente        : 'humanizador',
        modelo        : MODELO_CLAUDE,
        tokens_input  : usage.input_tokens,
        tokens_output : usage.output_tokens,
        coste_usd     : calcularCosteClaudeUSD(usage.input_tokens, usage.output_tokens),
      }).catch((e) => console.error('[Costes] Error (humanizador json):', e))

      return NextResponse.json({ contenido })
    }

    // ── Modo streaming (default) ────────────────────────────────────────────
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const streamAnthropic = anthropic.messages.stream({
            model     : MODELO_CLAUDE,
            max_tokens: 8000,
            system    : SYSTEM_HUMANIZADOR,
            messages  : mensajesApi,
          })

          for await (const chunk of streamAnthropic) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const datos = JSON.stringify({ texto: chunk.delta.text })
              controller.enqueue(encoder.encode(`data: ${datos}\n\n`))
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()

          // Registrar coste tras completar
          try {
            const finalMsg = await streamAnthropic.finalMessage()
            const usage = finalMsg.usage
            await guardarRegistroCoste({
              contenido_id  : contenido_id ?? null,
              proyecto_id   : proyecto_id  ?? null,
              tipo_operacion: 'humanizacion',
              agente        : 'humanizador',
              modelo        : MODELO_CLAUDE,
              tokens_input  : usage.input_tokens,
              tokens_output : usage.output_tokens,
              coste_usd     : calcularCosteClaudeUSD(usage.input_tokens, usage.output_tokens),
            })
          } catch (e) {
            console.error('[Costes] Error al registrar coste (humanizador stream):', e)
          }
        } catch (error) {
          console.error('[humanizador] Error en stream:', error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type' : 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection     : 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[humanizador] Error en POST /api/humanizador:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
