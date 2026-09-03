/**
 * lib/video/fonts.ts
 *
 * Catálogo de tipografías renderizables en los Reels/Stories.
 * Módulo puro (sin dependencias de servidor) — se importa tanto desde la UI
 * (selector de tipografía) como desde lib/video/text-overlay.ts (registro
 * de las fuentes en @napi-rs/canvas).
 *
 * Los .ttf viven en public/fonts/ (regular + bold, licencias libres OFL /
 * DejaVu). Las fuentes corporativas propietarias de un cliente (p. ej.
 * Santander Headline) no se pueden incluir — el matching con
 * brand_context.typography permite ofrecer primero las equivalentes libres.
 */

export interface FuenteVideo {
  id: string
  nombre: string
  /** Nombre de familia con el que se registra en canvas y se usa en ctx.font */
  familia: string
  /** Ficheros TTF en public/fonts/ */
  files: { regular: string; bold: string }
}

export const FUENTES_DISPONIBLES: FuenteVideo[] = [
  {
    id: 'dejavu',
    nombre: 'DejaVu Sans',
    familia: 'DejaVu Sans',
    files: { regular: 'DejaVuSans.ttf', bold: 'DejaVuSans-Bold.ttf' },
  },
  {
    id: 'poppins',
    nombre: 'Poppins',
    familia: 'Poppins',
    files: { regular: 'Poppins-Regular.ttf', bold: 'Poppins-Bold.ttf' },
  },
  {
    id: 'opensans',
    nombre: 'Open Sans',
    familia: 'Open Sans',
    files: { regular: 'OpenSans-Regular.ttf', bold: 'OpenSans-Bold.ttf' },
  },
  {
    id: 'montserrat',
    nombre: 'Montserrat',
    familia: 'Montserrat',
    files: { regular: 'Montserrat-Regular.ttf', bold: 'Montserrat-Bold.ttf' },
  },
]

export const FUENTE_DEFAULT_ID = 'dejavu'

/** Resuelve un id de fuente a su familia canvas; DejaVu si no existe. */
export function familiaDeFuente(fuenteId?: string | null): string {
  const fuente = FUENTES_DISPONIBLES.find((f) => f.id === fuenteId)
  return (fuente ?? FUENTES_DISPONIBLES[0]).familia
}

/**
 * Dado el array typography del brand_context ({name, ...}), devuelve los ids
 * del catálogo mencionados en las fuentes del cliente (match por nombre,
 * case-insensitive, en ambas direcciones).
 */
export function fuentesDeMarca(typography: Array<{ name?: string }> | null | undefined): string[] {
  if (!Array.isArray(typography)) return []
  const nombresCliente = typography
    .map((t) => t?.name?.trim().toLowerCase())
    .filter((n): n is string => !!n)
  if (nombresCliente.length === 0) return []

  return FUENTES_DISPONIBLES
    .filter((f) => {
      const nombre = f.nombre.toLowerCase()
      return nombresCliente.some((n) => n.includes(nombre) || nombre.includes(n))
    })
    .map((f) => f.id)
}
