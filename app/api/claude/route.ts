import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buscarContextoRAG } from '@/lib/rag'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SISTEMA_COPILOTO_DEFAULT = `Eres ContentCopilot, un experto en copywriting y estrategia de contenido digital.
Tu misión es ayudar a agencias de marketing a crear contenido de alta calidad para sus clientes.
Responde siempre en español. Sé creativo, persuasivo y adaptable al tono de cada cliente.
Cuando generes contenido, hazlo directamente sin explicaciones previas a menos que se te pidan.`

/**
 * POST /api/claude
 * Body:
 *   mensajes     array    — historial de mensajes
 *   modo         string   — 'stream' (default) | 'json'
 *   sistema      string?  — system prompt override
 *   max_tokens   number?  — max tokens override
 *   proyecto_id  string?  — si se envía, busca contexto RAG e inyecta en system prompt
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      mensajes,
      modo = 'stream',
      sistema,
      max_tokens,
      proyecto_id,
    } = body

    if (!mensajes || !Array.isArray(mensajes)) {
      return NextResponse.json({ error: 'Mensajes inválidos' }, { status: 400 })
    }

    const baseSystem: string = typeof sistema === 'string' && sistema.trim()
      ? sistema
      : SISTEMA_COPILOTO_DEFAULT

    // ── Inyección RAG ─────────────────────────────────────────────────────────
    // Si llega proyecto_id, buscamos los chunks más relevantes para la consulta
    // y los añadimos al final del system prompt para que Claude los use.
    let systemPrompt = baseSystem

    console.log('[RAG] proyecto_id recibido:', proyecto_id ?? '(no enviado)')

    if (typeof proyecto_id === 'string' && proyecto_id.trim()) {
      // La query para RAG es el último mensaje del usuario
      const lastUser = [...mensajes].reverse().find((m: { role: string }) => m.role === 'user')
      const query = typeof lastUser?.content === 'string'
        ? lastUser.content.substring(0, 1000)
        : ''

      console.log('[RAG] query para búsqueda:', query.substring(0, 100))

      if (query) {
        const contextoRAG = await buscarContextoRAG(proyecto_id.trim(), query, 3)
        console.log('[RAG] contexto devuelto (chars):', contextoRAG?.length ?? 0)
        console.log('[RAG] primeros 200 chars:', contextoRAG?.substring(0, 200) ?? '(vacío)')

        if (contextoRAG) {
          systemPrompt = `${baseSystem}\n\n${contextoRAG}`
        }
      }
    }

    // ── Modo JSON: respuesta completa sin streaming ───────────────────────────
    if (modo === 'json') {
      const maxTok = typeof max_tokens === 'number' ? max_tokens : 1024
      const respuesta = await anthropic.messages.create({
        model     : 'claude-sonnet-4-5',
        max_tokens: maxTok,
        system    : systemPrompt,
        messages  : mensajes,
      })

      const bloque = respuesta.content[0]
      const contenido = bloque.type === 'text' ? bloque.text : ''
      return NextResponse.json({ contenido })
    }

    // ── Modo streaming ────────────────────────────────────────────────────────
    const maxTokStream = typeof max_tokens === 'number' ? max_tokens : 4096
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const streamAnthropic = anthropic.messages.stream({
            model     : 'claude-sonnet-4-5',
            max_tokens: maxTokStream,
            system    : systemPrompt,
            messages  : mensajes,
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
