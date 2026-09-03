import { NextRequest, NextResponse } from 'next/server'
import { guardarRegistroCoste } from '@/lib/costes'
import { generateImage } from '@/lib/fal-image'

export const maxDuration = 60

// Mapeo de formato → aspect canónico
const ASPECTO: Record<string, string> = {
  '1200x630':  '16:9',
  '1200x800':  '3:2',
  '1920x1080': '16:9',
}

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      formato     = '1200x630',
      variantes   = 1,
      contenido_id,
      modelo_id,
    } = await req.json() as {
      prompt        : string
      formato?      : string
      variantes?    : number
      contenido_id? : string
      modelo_id?    : string
    }

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'El prompt es obligatorio' }, { status: 400 })
    }

    const aspect = ASPECTO[formato] ?? '16:9'
    const count = Math.min(Math.max(1, variantes), 3)

    // Generación en paralelo de todas las variantes — vía helper central.
    // Si no se pasa modelo_id, generateImage usa el default ('flux-ultra').
    const resultados = await Promise.all(
      Array.from({ length: count }, () => generateImage(prompt, { modelo_id, aspect })),
    )
    const exitosos = resultados.filter((r) => r.url)
    const urls = exitosos.map((r) => r.url) as string[]

    if (urls.length === 0) {
      return NextResponse.json({ error: 'No se generaron imágenes' }, { status: 500 })
    }

    // ── Registrar coste por modelo (fire & forget) ────────────────────────────
    // tipo_operacion 'imagen_ia' + agente 'fal' (genéricos: abarca FLUX/Seedream/Imagen).
    guardarRegistroCoste({
      contenido_id  : contenido_id ?? null,
      tipo_operacion: 'imagen_ia',
      agente        : 'fal',
      modelo        : exitosos[0].endpoint,   // modelo realmente usado
      unidades      : urls.length,
      coste_usd     : exitosos.reduce((s, r) => s + r.costeUsd, 0),
      metadatos     : { formato, aspect, modelo_id: exitosos[0].modeloId },
    }).catch((e) => console.error('[Costes] Error imagen destacada:', e))

    return NextResponse.json({ urls })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al generar imagen' },
      { status: 500 },
    )
  }
}
