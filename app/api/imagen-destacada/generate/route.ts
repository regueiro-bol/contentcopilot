import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { calcularCosteFluxUSD, guardarRegistroCoste } from '@/lib/costes'

export const maxDuration = 60

const FAL_MODEL = 'fal-ai/flux-pro/v1.1-ultra'

// Mapeo de formato → aspect_ratio de FAL.ai
const ASPECTO: Record<string, string> = {
  '1200x630':  '16:9',
  '1200x800':  '3:2',
  '1920x1080': '16:9',
}

export async function POST(req: NextRequest) {
  fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? '' })
  try {
    const {
      prompt,
      formato     = '1200x630',
      variantes   = 1,
      contenido_id,
    } = await req.json() as {
      prompt        : string
      formato?      : string
      variantes?    : number
      contenido_id? : string
    }

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'El prompt es obligatorio' }, { status: 400 })
    }

    const aspect_ratio = ASPECTO[formato] ?? '16:9'
    const count = Math.min(Math.max(1, variantes), 3)

    // Generación en paralelo de todas las variantes
    const promesas = Array.from({ length: count }, () =>
      fal.subscribe(FAL_MODEL, {
        input: {
          prompt          : prompt.trim(),
          aspect_ratio,
          num_images      : 1,
          output_format   : 'jpeg',
          safety_tolerance: '4',
          enhance_prompt  : true,
        },
      })
    )

    const resultados = await Promise.all(promesas)
    const urls = resultados
      .map((r) => (r.data as any)?.images?.[0]?.url)
      .filter(Boolean) as string[]

    if (urls.length === 0) {
      return NextResponse.json({ error: 'No se generaron imágenes' }, { status: 500 })
    }

    // ── Registrar coste FLUX (fire & forget) ──────────────────────────────────
    guardarRegistroCoste({
      contenido_id  : contenido_id ?? null,
      tipo_operacion: 'imagen_flux',
      agente        : 'fal_flux',
      modelo        : FAL_MODEL,
      unidades      : urls.length,
      coste_usd     : calcularCosteFluxUSD(urls.length),
      metadatos     : { formato, aspect_ratio },
    }).catch((e) => console.error('[Costes] Error imagen destacada:', e))

    return NextResponse.json({ urls })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al generar imagen' },
      { status: 500 },
    )
  }
}
