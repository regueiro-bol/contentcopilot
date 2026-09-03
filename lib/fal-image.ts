/**
 * lib/fal-image.ts
 *
 * Helper central de generación de imágenes con fal.ai (Fase 1 del selector de modelo).
 *
 * Qué hace:
 *   1. Resuelve el modelo del catálogo (lib/image-models.ts) por modelo_id
 *      (default 'flux-ultra' si no se pasa — así los llamadores actuales no cambian).
 *   2. Mapea el `aspect` canónico al parámetro que cada modelo espera
 *      (aspect_ratio vs image_size), según el campo formatoAspect del catálogo.
 *   3. Llama a fal.subscribe con los params comunes + los específicos del modelo.
 *   4. Devuelve la URL de la imagen + modelo y coste (para el registro de coste, CAMBIO 5).
 *
 * Contrato de salida compatible con el uso actual: los llamadores leen `.url`
 * igual que hoy; `modeloId`/`endpoint`/`costeUsd` son extra para el coste.
 *
 * NOTA: este archivo solo CREA el helper. No refactoriza ningún llamador todavía
 * (pendiente de confirmar alcance — el mensaje del usuario se cortó en ese punto).
 */

import { fal } from '@fal-ai/client'
import { getImageModel, aspectToImageSize } from '@/lib/image-models'

export interface GenerateImageOptions {
  /** id del catálogo (lib/image-models.ts). Si se omite → default 'flux-ultra'. */
  modelo_id?:         string | null
  /** aspecto canónico: '1:1' | '9:16' | '16:9' | '4:3' | '3:4' | '3:2'. Default '1:1'. */
  aspect?:            string
  /** imagen de referencia (image-to-image) cuando el llamador la aporta. */
  referenceImageUrl?: string | null
  /** nº de imágenes en una sola llamada (default 1). */
  numImages?:         number
}

export interface GenerateImageResult {
  url:      string | null
  modeloId: string
  endpoint: string
  costeUsd: number   // coste_aprox del modelo × numImages
}

const esFlux = (endpoint: string) => endpoint.startsWith('fal-ai/flux')

export async function generateImage(
  prompt: string,
  opts: GenerateImageOptions = {},
): Promise<GenerateImageResult> {
  fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? '' })

  const modelo    = getImageModel(opts.modelo_id)
  const aspect    = opts.aspect ?? '1:1'
  const numImages = Math.max(1, opts.numImages ?? 1)

  // ── Input común ──
  const input: Record<string, unknown> = {
    prompt:        prompt.trim(),
    num_images:    numImages,
    output_format: 'jpeg',
  }

  // ── Aspecto según el formato que espera el modelo ──
  if (modelo.formatoAspect === 'image_size') {
    input.image_size = aspectToImageSize(aspect)   // Seedream
  } else {
    input.aspect_ratio = aspect                    // FLUX, Imagen
  }

  // ── Params específicos de FLUX pro (no aplican a Seedream/Imagen) ──
  if (esFlux(modelo.endpoint)) {
    input.safety_tolerance = '4'
    input.enhance_prompt   = true
  }

  // ── Imagen de referencia (image-to-image) ──
  if (opts.referenceImageUrl) {
    input.image_url = opts.referenceImageUrl
    if (esFlux(modelo.endpoint)) input.strength = 0.2
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (fal as any).subscribe(modelo.endpoint, { input })
  const data   = (result?.data ?? result) as { images?: Array<{ url: string }>; image?: { url: string } }
  const url    = data?.images?.[0]?.url ?? data?.image?.url ?? null

  return {
    url,
    modeloId: modelo.id,
    endpoint: modelo.endpoint,
    costeUsd: modelo.coste_aprox * numImages,
  }
}
