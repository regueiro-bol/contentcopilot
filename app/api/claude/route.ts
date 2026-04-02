import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buscarContextoRAG } from '@/lib/rag'
import {
  calcularCosteClaudeUSD,
  guardarRegistroCoste,
  type TipoOperacion,
} from '@/lib/costes'

const MODELO_CLAUDE = 'claude-sonnet-4-5'

const SISTEMA_COPILOTO_DEFAULT = `Eres ContentCopilot, un experto en copywriting y estrategia de contenido digital.
Tu misión es ayudar a agencias de marketing a crear contenido de alta calidad para sus clientes.
Responde siempre en español. Sé creativo, persuasivo y adaptable al tono de cada cliente.
Cuando generes contenido, hazlo directamente sin explicaciones previas a menos que se te pidan.`

/**
 * POST /api/claude
 * Body:
 *   mensajes        array    — historial de mensajes
 *   modo            string   — 'stream' (default) | 'json'
 *   sistema         string?  — system prompt override
 *   max_tokens      number?  — max tokens override
 *   proyecto_id     string?  — si se envía, busca contexto RAG
 *   contenido_id    string?  — para registrar el coste asociado al contenido
 *   tipo_operacion  string?  — tipo de operación para el registro de costes
 *   agente          string?  — identificador del agente (default: 'claude_api')
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  try {
    const body = await request.json()
    const {
      // Accept both naming conventions: new (messages/system) and legacy (mensajes/sistema)
      messages,
      mensajes,
      modo = 'stream',
      system,
      sistema,
      max_tokens,
      proyecto_id,
      // Trazabilidad de costes
      contenido_id,
      tipo_operacion,
      agente,
    } = body

    const mensajesResueltos = messages ?? mensajes
    if (!mensajesResueltos || !Array.isArray(mensajesResueltos)) {
      return NextResponse.json({ error: 'Mensajes inválidos' }, { status: 400 })
    }
    const sistemaResuelto: string | undefined = system ?? sistema

    const baseSystem: string = typeof sistemaResuelto === 'string' && sistemaResuelto.trim()
      ? sistemaResuelto
      : SISTEMA_COPILOTO_DEFAULT

    // ── Inyección RAG ─────────────────────────────────────────────────────────
    let systemPrompt = baseSystem

    console.log('[RAG] proyecto_id recibido:', proyecto_id ?? '(no enviado)')

    if (typeof proyecto_id === 'string' && proyecto_id.trim()) {
      const lastUser = [...mensajesResueltos].reverse().find((m: { role: string }) => m.role === 'user')
      const query = typeof lastUser?.content === 'string'
        ? lastUser.content.substring(0, 1000)
        : ''

      console.log('[RAG] query para búsqueda:', query.substring(0, 100))

      if (query) {
        const contextoRAG = await buscarContextoRAG(proyecto_id.trim(), query, 3)
        console.log('[RAG] contexto devuelto (chars):', contextoRAG?.length ?? 0)

        if (contextoRAG) {
          systemPrompt = `${baseSystem}\n\n${contextoRAG}`
        }
      }
    }

    // Helper para guardar coste (fire & forget, nunca bloquea la respuesta)
    const tipoOp: TipoOperacion = (tipo_operacion as TipoOperacion) ?? 'copiloto'
    const agenteId: string = agente ?? 'claude_api'

    // ── Modo JSON: respuesta completa sin streaming ───────────────────────────
    if (modo === 'json') {
      const maxTok = typeof max_tokens === 'number' ? Math.min(max_tokens, 8000) : 1024
      const respuesta = await anthropic.messages.create({
        model     : MODELO_CLAUDE,
        max_tokens: maxTok,
        system    : systemPrompt,
        messages  : mensajesResueltos,
      })

      const bloque = respuesta.content[0]
      const contenido = bloque.type === 'text' ? bloque.text : ''

      // ── Registrar coste ──
      const usage = respuesta.usage
      guardarRegistroCoste({
        contenido_id  : contenido_id ?? null,
        proyecto_id   : proyecto_id  ?? null,
        tipo_operacion: tipoOp,
        agente        : agenteId,
        modelo        : MODELO_CLAUDE,
        tokens_input  : usage.input_tokens,
        tokens_output : usage.output_tokens,
        coste_usd     : calcularCosteClaudeUSD(usage.input_tokens, usage.output_tokens),
      }).catch((e) => console.error('[Costes] Error (json mode):', e))

      return NextResponse.json({ contenido })
    }

    // ── Modo streaming ────────────────────────────────────────────────────────
    const maxTokStream = typeof max_tokens === 'number' ? Math.min(max_tokens, 8000) : 4096
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const streamAnthropic = anthropic.messages.stream({
            model     : MODELO_CLAUDE,
            max_tokens: maxTokStream,
            system    : systemPrompt,
            messages  : mensajesResueltos,
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

          // ── Registrar coste tras completar el stream ──
          // No bloquea la respuesta al cliente — el controller ya está cerrado
          try {
            const finalMsg = await streamAnthropic.finalMessage()
            const usage = finalMsg.usage
            await guardarRegistroCoste({
              contenido_id  : contenido_id ?? null,
              proyecto_id   : proyecto_id  ?? null,
              tipo_operacion: tipoOp,
              agente        : agenteId,
              modelo        : MODELO_CLAUDE,
              tokens_input  : usage.input_tokens,
              tokens_output : usage.output_tokens,
              coste_usd     : calcularCosteClaudeUSD(usage.input_tokens, usage.output_tokens),
            })
          } catch (e) {
            console.error('[Costes] Error al registrar coste (stream):', e)
          }

        } catch (error) {
          console.error('Error en stream de Claude:', error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type' : 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection'   : 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Error en /api/claude:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
