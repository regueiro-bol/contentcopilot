// ─── Platform constants shared across the social module ──────────────────────

export const PLATFORMS = [
  'linkedin', 'twitter_x', 'instagram', 'facebook', 'tiktok', 'youtube',
] as const

export type Platform = typeof PLATFORMS[number]

export const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin  : 'LinkedIn',
  twitter_x : 'Twitter/X',
  instagram : 'Instagram',
  facebook  : 'Facebook',
  tiktok    : 'TikTok',
  youtube   : 'YouTube',
}

export const PLATFORM_COLORS: Record<Platform, { bg: string; text: string; ring: string; dot: string }> = {
  linkedin  : { bg: 'bg-blue-600',   text: 'text-white', ring: 'ring-blue-300',   dot: 'bg-blue-600'   },
  twitter_x : { bg: 'bg-gray-900',   text: 'text-white', ring: 'ring-gray-400',   dot: 'bg-gray-900'   },
  instagram : { bg: 'bg-pink-500',   text: 'text-white', ring: 'ring-pink-300',   dot: 'bg-pink-500'   },
  facebook  : { bg: 'bg-indigo-600', text: 'text-white', ring: 'ring-indigo-300', dot: 'bg-indigo-600' },
  tiktok    : { bg: 'bg-cyan-500',   text: 'text-white', ring: 'ring-cyan-300',   dot: 'bg-cyan-500'   },
  youtube   : { bg: 'bg-red-600',    text: 'text-white', ring: 'ring-red-300',    dot: 'bg-red-600'    },
}

export const PLATFORM_FORMATS: Record<Platform, string[]> = {
  linkedin: [
    'Artículo nativo', 'Post de texto', 'Documento PDF nativo', 'Vídeo corto',
    'Encuesta', 'Celebración / Logro', 'Noticia del sector',
  ],
  twitter_x: [
    'Tweet único', 'Hilo de tweets', 'Tweet con imagen', 'Tweet con vídeo',
    'Encuesta', 'Respuesta / Conversación',
  ],
  instagram: [
    'Post imagen', 'Carrusel', 'Reel', 'Story', 'Vídeo IGTV',
    'Colaboración', 'UGC',
  ],
  facebook: [
    'Post texto', 'Post imagen', 'Vídeo nativo', 'Reel', 'Story',
    'Evento', 'Encuesta', 'Live',
  ],
  tiktok: [
    'Vídeo corto (<60s)', 'Vídeo largo (>60s)', 'Dueto', 'Stitch',
    'Live', 'Serie',
  ],
  youtube: [
    'Vídeo largo (>10min)', 'Shorts', 'Live', 'Premiere',
    'Post de comunidad', 'Playlist',
  ],
}

export const STATUS_COLORS: Record<string, { dot: string; label: string }> = {
  planificado  : { dot: 'bg-gray-400',   label: 'Planificado'   },
  en_produccion: { dot: 'bg-yellow-400', label: 'En producción' },
  aprobado     : { dot: 'bg-green-400',  label: 'Aprobado'      },
  publicado    : { dot: 'bg-green-700',  label: 'Publicado'     },
}
