/**
 * lib/image-models.ts
 *
 * Catálogo de modelos de imagen disponibles en fal.ai (Fase 1 del selector).
 *
 * SEPARACIÓN INTENCIONADA (para Fase B — defaults configurables):
 *   - Este archivo = "qué modelos EXISTEN" (catálogo declarativo).
 *   - MODELO_IMAGEN_DEFAULT + generateImage (lib/fal.ts) = "qué modelo se USA".
 *   Así en Fase B se podrá configurar el default sin tocar el catálogo ni los llamadores.
 *
 * Endpoints verificados en fal.ai (jul 2026):
 *   - flux-ultra   : fal-ai/flux-pro/v1.1-ultra            → CONFIRMADO (ya en uso en la app)
 *   - seedream     : fal-ai/bytedance/seedream/v4.5/text-to-image → CONFIRMADO
 *   - imagen-ultra : fal-ai/imagen4/preview/ultra          → CONFIRMADO (fal lo etiqueta "preview"
 *                    pero sigue activo; es el modelo de mayor calidad de Google en fal)
 */

/** Cómo espera cada modelo la proporción de la imagen. */
export type FormatoAspect = 'aspect_ratio' | 'image_size'

export interface ImageModel {
  id:                string
  nombre:            string
  endpoint:          string
  descripcion_corta: string
  coste_aprox:       number        // USD por imagen (para registro de coste, CAMBIO 5)
  formatoAspect:     FormatoAspect
  /** true si el endpoint no está confirmado/estable — la UI puede ocultarlo o deshabilitarlo. */
  verificar?:        boolean
}

export const MODELOS_IMAGEN: ImageModel[] = [
  {
    id:                'flux-ultra',
    nombre:            'FLUX 1.1 Ultra',
    endpoint:          'fal-ai/flux-pro/v1.1-ultra',
    descripcion_corta: 'Fotorrealismo, personas, piel natural',
    coste_aprox:       0.06,
    formatoAspect:     'aspect_ratio',
  },
  {
    id:                'seedream',
    nombre:            'Seedream 4.5',
    endpoint:          'fal-ai/bytedance/seedream/v4.5/text-to-image',
    descripcion_corta: 'Producto, texto en imagen, rápido y económico',
    coste_aprox:       0.04,   // verificado ~$0.04/imagen (no 0.03)
    formatoAspect:     'image_size',
  },
  {
    id:                'imagen-ultra',
    nombre:            'Imagen 4 Ultra',
    // Confirmado: fal lo etiqueta "preview" pero sigue activo y funcional.
    endpoint:          'fal-ai/imagen4/preview/ultra',
    descripcion_corta: 'Máxima calidad para piezas premium (más caro)',
    coste_aprox:       0.06,
    formatoAspect:     'aspect_ratio',
  },
]

/** Modelo por defecto (el actual — no rompe nada). */
export const MODELO_IMAGEN_DEFAULT = 'flux-ultra'

/** Devuelve el modelo del catálogo por id; el default si no existe. */
export function getImageModel(modeloId?: string | null): ImageModel {
  return MODELOS_IMAGEN.find((m) => m.id === modeloId)
    ?? MODELOS_IMAGEN.find((m) => m.id === MODELO_IMAGEN_DEFAULT)
    ?? MODELOS_IMAGEN[0]
}

/**
 * Mapea un aspect_ratio canónico ('1:1', '9:16', '16:9', '4:3', '3:4', '3:2')
 * al preset de `image_size` de los modelos que lo usan (Seedream).
 */
const ASPECT_TO_IMAGE_SIZE: Record<string, string> = {
  '1:1':  'square_hd',
  '9:16': 'portrait_16_9',
  '16:9': 'landscape_16_9',
  '4:3':  'landscape_4_3',
  '3:4':  'portrait_4_3',
  '3:2':  'landscape_4_3',   // Seedream no tiene 3:2 — se aproxima a 4:3
}

export function aspectToImageSize(aspectRatio: string): string {
  return ASPECT_TO_IMAGE_SIZE[aspectRatio] ?? 'square_hd'
}
