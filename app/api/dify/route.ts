import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const DIFY_BASE_URL = process.env.DIFY_BASE_URL ?? 'https://api.dify.ai/v1'
const DIFY_API_KEY = process.env.DIFY_API_KEY ?? ''

/**
 * Selecciona la API key de Dify según el UUID del app recibido.
 *
 * El frontend envía el UUID exacto de la app de Dify (NEXT_PUBLIC_DIFY_*_APP_ID).
 * El mapa asocia cada UUID a su API key de servidor correspondiente.
 * Fallback a DIFY_API_KEY si el UUID no está en el mapa.
 */
function resolverApiKey(appId?: string): string {
  const keyMap: Record<string, string> = {
    // Brief SEO
    'b192c433-abce-46a8-a843-63270005a3c0': process.env.DIFY_BRIEF_SEO_API_KEY ?? '',
    // Revisor GEO-SEO
    'ca381077-a8cf-4a1b-a285-e8ffbc676857': process.env.DIFY_REVISOR_GEO_SEO_API_KEY ?? '',
    // Humanizador
    '9a4ee2d7-1ebc-4ecf-b612-e93a04517eab': process.env.DIFY_HUMANIZADOR_API_KEY ?? '',
    // Legibilidad Lectora
    'ec87a85c-e9a1-4221-9ad5-9c240279b709': process.env.DIFY_LEGIBILIDAD_API_KEY ?? '',
    // Voz de Marca
    '1c01af4e-0e1a-49dc-9c36-f8ce1151a6da': process.env.DIFY_VOZ_MARCA_API_KEY ?? '',
    // Perfil de Autor
    'aa474240-0825-453b-87ad-40fdc86d11a6': process.env.DIFY_PERFIL_AUTOR_API_KEY ?? '',
    // GEO Optimizer
    '297b8e75-496b-4e72-a74e-d173c71b3174': process.env.DIFY_GEO_OPTIMIZER_API_KEY ?? '',
    // Estrategia de Contenidos
    'ab18f2a5-941c-479f-b188-7e70bc218fb5': process.env.DIFY_ESTRATEGIA_API_KEY ?? '',
    // Asistente de Briefing
    '61996838-7126-4760-941c-15fe311ad8dd': process.env.DIFY_ASISTENTE_BRIEFING_API_KEY ?? '',
    // Redactor Copiloto
    '54d131e3-b545-49d8-9b32-e082fa8fff93': process.env.DIFY_REDACTOR_COPILOTO_API_KEY ?? '',
  }

  if (appId && keyMap[appId]) return keyMap[appId]

  // Fallback: clave universal
  return DIFY_API_KEY
}

/**
 * POST /api/dify
 * Proxy hacia la API de Dify para ejecutar agentes de IA.
 *
 * Body:
 *   query         string   — Texto del mensaje / datos a procesar
 *   app_id        string?  — Identificador del agente Dify (brief_seo, redactor…)
 *   conversacion_id string? — ID de conversación para continuar un hilo
 *   entradas      object?  — Inputs adicionales para el agente
 *   modo          string?  — 'blocking' (default) | 'streaming'
 *   usuario       string?  — ID de usuario (usa Clerk userId si se omite)
 *
 * Response (blocking):
 *   { answer, respuesta, conversacion_id, mensaje_id, metadatos }
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      query,
      app_id,
      conversacion_id,
      entradas = {},
      modo = 'blocking',
      usuario = userId,
    } = body

    if (!query?.trim()) {
      return NextResponse.json({ error: 'El campo query es requerido' }, { status: 400 })
    }

    // ── Diagnóstico ──────────────────────────────────────────────────────
    console.log('[dify] DIFY_BASE_URL:', DIFY_BASE_URL)
    console.log('[dify] DIFY_API_KEY present:', !!process.env.DIFY_API_KEY)
    console.log('[dify] DIFY_BRIEF_SEO_API_KEY present:', !!process.env.DIFY_BRIEF_SEO_API_KEY)
    console.log('[dify] app_id recibido:', app_id)
    console.log('[dify] query recibida (50 chars):', query?.substring(0, 50))
    // ────────────────────────────────────────────────────────────────────

    const apiKey = resolverApiKey(app_id)
    if (!apiKey) {
      console.error('[dify] No hay API key configurada. Define DIFY_API_KEY en .env.local')
      return NextResponse.json(
        { error: 'No hay API key de Dify configurada. Define DIFY_API_KEY en .env.local' },
        { status: 500 }
      )
    }

    console.log('[dify] Usando key terminada en:', apiKey.slice(-6))

    const payloadDify = {
      inputs: entradas,
      query,
      response_mode: modo,
      conversation_id: conversacion_id ?? '',
      user: usuario,
    }

    console.log('[dify] Llamando a:', `${DIFY_BASE_URL}/chat-messages`)

    const respuestaDify = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payloadDify),
    })

    console.log('[dify] Response status:', respuestaDify.status)
    console.log('[dify] Response ok:', respuestaDify.ok)

    if (!respuestaDify.ok) {
      const errorDify = await respuestaDify.text()
      console.error('[dify] Error body de Dify:', errorDify)
      return NextResponse.json(
        { error: `Error de Dify (${respuestaDify.status}): ${errorDify}` },
        { status: respuestaDify.status }
      )
    }

    // Streaming: reenviar el stream directamente
    if (modo === 'streaming' && respuestaDify.body) {
      return new Response(respuestaDify.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // Blocking: devolver respuesta normalizada
    const datos = await respuestaDify.json()
    return NextResponse.json({
      answer: datos.answer,           // campo estándar
      respuesta: datos.answer,        // alias legacy
      conversacion_id: datos.conversation_id,
      mensaje_id: datos.message_id,
      metadatos: datos.metadata,
    })
  } catch (error) {
    console.error('[dify] Error en POST /api/dify:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

/**
 * GET /api/dify
 * Obtiene el historial de conversaciones de un agente
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const conversacionId = searchParams.get('conversacion_id')

  if (!conversacionId) {
    return NextResponse.json({ error: 'conversacion_id es requerido' }, { status: 400 })
  }

  try {
    const respuesta = await fetch(
      `${DIFY_BASE_URL}/messages?conversation_id=${conversacionId}&user=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${DIFY_API_KEY}`,
        },
      }
    )

    const datos = await respuesta.json()
    return NextResponse.json(datos)
  } catch (error) {
    console.error('Error al obtener historial de Dify:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
