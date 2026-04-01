import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { EstadoContenido } from '@/types'

/**
 * Combina clases de Tailwind evitando conflictos
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea una fecha en español
 */
export function formatearFecha(fecha: string | Date): string {
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Formatea una fecha relativa (hace X tiempo)
 */
export function formatearFechaRelativa(fecha: string | Date): string {
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha
  const ahora = new Date()
  const diffMs = ahora.getTime() - date.getTime()
  const diffMinutos = Math.floor(diffMs / 60000)
  const diffHoras = Math.floor(diffMinutos / 60)
  const diffDias = Math.floor(diffHoras / 24)

  if (diffMinutos < 1) return 'Justo ahora'
  if (diffMinutos < 60) return `Hace ${diffMinutos} minuto${diffMinutos !== 1 ? 's' : ''}`
  if (diffHoras < 24) return `Hace ${diffHoras} hora${diffHoras !== 1 ? 's' : ''}`
  if (diffDias < 7) return `Hace ${diffDias} día${diffDias !== 1 ? 's' : ''}`
  return formatearFecha(date)
}

/**
 * Trunca un texto a un número máximo de caracteres
 */
export function truncarTexto(texto: string, maxCaracteres: number): string {
  if (texto.length <= maxCaracteres) return texto
  return `${texto.substring(0, maxCaracteres)}...`
}

/**
 * Obtiene las iniciales de un nombre completo
 */
export function obtenerIniciales(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((palabra) => palabra[0])
    .join('')
    .toUpperCase()
}

/**
 * Mapea el estado de un contenido a clases CSS de color
 */
export function colorEstadoContenido(estado: EstadoContenido | string): string {
  const colores: Record<string, string> = {
    pendiente:          'bg-gray-100 text-gray-600',
    borrador:           'bg-blue-100 text-blue-700',
    revision_seo:       'bg-yellow-100 text-yellow-700',
    revision_cliente:   'bg-orange-100 text-orange-700',
    devuelto:           'bg-red-100 text-red-700',
    aprobado:           'bg-green-100 text-green-700',
    publicado:          'bg-emerald-100 text-emerald-800',
  }
  return colores[estado] ?? 'bg-gray-100 text-gray-700'
}

/**
 * Etiqueta legible del estado del contenido
 */
export function etiquetaEstadoContenido(estado: EstadoContenido | string): string {
  const etiquetas: Record<string, string> = {
    pendiente:          'Pendiente',
    borrador:           'Borrador',
    revision_seo:       'Revisión SEO',
    revision_cliente:   'Revisión cliente',
    devuelto:           'Devuelto',
    aprobado:           'Aprobado',
    publicado:          'Publicado',
  }
  return etiquetas[estado] ?? estado
}

// Aliases de compatibilidad (para código legacy)
export const colorEstadoProyecto = colorEstadoContenido
export const etiquetaEstado = etiquetaEstadoContenido
