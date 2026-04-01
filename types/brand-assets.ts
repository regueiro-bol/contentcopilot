// ============================================================
// Tipos TypeScript — Brand Asset Manager
// Inferidos del schema de supabase/migrations/006_brand_assets.sql
// ============================================================

// ─────────────────────────────────────────────────────────────
// ENUMs (string literal unions — espejo de los tipos PG)
// ─────────────────────────────────────────────────────────────

/** Tipo de activo de marca. Espejo del ENUM `asset_type` de Postgres. */
export type AssetType =
  | 'logo'            // Logotipos (SVG, PNG transparente)
  | 'brand_book'      // Brand book / guía de estilo (PDF, PPTX…)
  | 'product_image'   // Fotografías de producto
  | 'reference_ad'    // Anuncios de referencia aprobados
  | 'template'        // Plantillas (Canva, Figma, Word…)

/** Intención de publicación. Espejo del ENUM `publication_intent` de Postgres. */
export type PublicationIntent =
  | 'organic_informative'   // Contenido orgánico educativo / informativo
  | 'organic_brand'         // Contenido orgánico de marca / storytelling
  | 'paid_campaign'         // Creatividades para campañas de pago

// ─────────────────────────────────────────────────────────────
// Metadata por asset_type
// Cada variante tipifica el JSONB `metadata` de brand_assets.
// Los campos con ? son opcionales porque no todos los activos
// tienen los mismos datos disponibles en el momento de la sync.
// ─────────────────────────────────────────────────────────────

/** Metadata para brand books / guías de estilo. */
export interface BrandBookMetadata {
  /** Formato del fichero */
  format?: 'pdf' | 'pptx' | 'docx' | 'key' | 'figma' | 'other'
  /** Número de páginas aproximado */
  pages?: number
  /** Versión del documento. Ej: '2024-Q1' */
  version?: string
  /** Notas libres */
  notes?: string
}

/** Metadata para logos corporativos. */
export interface LogoMetadata {
  /** Formato del fichero: 'svg' | 'png' | 'eps' | 'ai' | 'pdf' */
  format?: 'svg' | 'png' | 'eps' | 'ai' | 'pdf'
  /** Variante dentro de la identidad visual */
  variant?: 'primary' | 'secondary' | 'icon' | 'horizontal' | 'vertical' | 'monochrome'
  /** Fondo para el que fue diseñado */
  background?: 'transparent' | 'white' | 'dark' | 'color'
  /** Versión cromática */
  color_version?: 'full_color' | 'monochrome' | 'inverted'
  /** Dimensiones originales en píxeles */
  width_px?: number
  height_px?: number
  /** Notas libres del equipo creativo */
  notes?: string
}

/** Metadata para colores corporativos. */
export interface ColorMetadata {
  /** Valor hexadecimal — campo principal. Ej: '#1A2B3C' */
  hex: string
  /** Valores RGB */
  rgb?: { r: number; g: number; b: number }
  /** Valores CMYK (0–100) */
  cmyk?: { c: number; m: number; y: number; k: number }
  /** Referencia Pantone si aplica. Ej: 'PMS 286 C' */
  pantone?: string
  /** Nombre semántico del color. Ej: 'Azul corporativo' */
  name: string
  /** Rol del color en la paleta */
  usage?: 'primary' | 'secondary' | 'accent' | 'neutral' | 'background' | 'text'
  /** Notas libres (contraste, accesibilidad, casos de uso…) */
  notes?: string
}

/** Metadata para tipografías corporativas. */
export interface FontMetadata {
  /** Familia tipográfica. Ej: 'Inter', 'Playfair Display' */
  family: string
  /** Peso. Puede ser numérico (400, 700) o descriptivo ('Regular', 'Bold') */
  weight?: number | string
  /** Estilo del font */
  style?: 'normal' | 'italic' | 'oblique'
  /** Formato del fichero de fuente */
  format?: 'ttf' | 'otf' | 'woff' | 'woff2'
  /** Uso previsto en la jerarquía tipográfica */
  usage?: 'heading' | 'body' | 'display' | 'mono' | 'accent'
  /** Escala tipográfica de referencia. Ej: 'H1: 48px, H2: 36px, body: 16px' */
  size_scale?: string
  /** Notas libres */
  notes?: string
}

/** Metadata para imágenes de producto. */
export interface ProductImageMetadata {
  /** SKU o referencia del producto */
  sku?: string
  /** Nombre del producto */
  product_name?: string
  /** Ángulo o tipo de toma fotográfica */
  angle?: 'front' | 'side' | 'back' | 'detail' | 'lifestyle' | 'packshot'
  /** Tipo de fondo */
  background?: 'white' | 'transparent' | 'lifestyle' | 'gradient' | 'other'
  /** Dimensiones originales en píxeles */
  width_px?: number
  height_px?: number
  /** Resolución en DPI */
  dpi?: number
  /** Notas libres (dirección de arte, contexto, restricciones de uso…) */
  notes?: string
}

/** Metadata para anuncios de referencia. */
export interface ReferenceAdMetadata {
  /** Plataforma donde se publicó o está previsto publicar */
  platform?: 'meta' | 'google' | 'linkedin' | 'twitter' | 'tiktok' | 'display' | 'other'
  /** Formato del anuncio */
  format?: 'feed' | 'story' | 'reel' | 'banner' | 'carousel' | 'video'
  /** Dimensiones del creativo. Ej: '1080x1080', '1920x1080' */
  dimensions?: string
  /** Intención de publicación — clasifica la creatividad por objetivo */
  publication_intent?: PublicationIntent
  /** Nombre de la campaña de referencia */
  campaign_name?: string
  /** Notas de rendimiento del anuncio (CTR, ROAS, observaciones del equipo) */
  performance_notes?: string
  /** Notas libres */
  notes?: string
}

/** Metadata para plantillas editables. */
export interface TemplateMetadata {
  /** Herramienta con la que fue creada */
  tool?: 'canva' | 'figma' | 'powerpoint' | 'word' | 'illustrator' | 'photoshop' | 'other'
  /** Categoría o uso previsto. Ej: 'Post Instagram', 'Portada blog' */
  category?: string
  /** Dimensiones del formato */
  dimensions?: string
  /** Si la plantilla es editable por el equipo sin la herramienta original */
  editable?: boolean
  /** Notas libres */
  notes?: string
}

/**
 * Unión discriminada de todos los tipos de metadata posibles.
 * Úsala cuando el asset_type aún no está determinado.
 */
export type BrandAssetMetadata =
  | BrandBookMetadata
  | LogoMetadata
  | ProductImageMetadata
  | ReferenceAdMetadata
  | TemplateMetadata

// ─────────────────────────────────────────────────────────────
// Fila base de la tabla brand_assets (espejo 1:1 del schema PG)
// ─────────────────────────────────────────────────────────────

/** Fila raw de brand_assets tal como la devuelve Supabase. */
export interface BrandAssetRow {
  id: string
  client_id: string
  asset_type: AssetType
  drive_file_id: string
  drive_url: string
  file_name: string | null
  mime_type: string | null
  /** JSONB sin tipar — usa BrandAsset para la versión tipada */
  metadata: Record<string, unknown>
  approved: boolean
  active: boolean
  /** ISO 8601 — null si nunca se ha sincronizado */
  synced_at: string | null
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────
// BrandAsset — tipo de aplicación (discriminated union)
// Correlaciona asset_type con su metadata tipada para que
// TypeScript infiera el tipo correcto de metadata en cada rama.
// ─────────────────────────────────────────────────────────────

type BrandAssetBase = Omit<BrandAssetRow, 'asset_type' | 'metadata'>

/**
 * Activo de marca con tipado fuerte. Usa asset_type como discriminant
 * para que TypeScript infiera automáticamente la forma de metadata.
 *
 * @example
 * function render(asset: BrandAsset) {
 *   if (asset.asset_type === 'color') {
 *     console.log(asset.metadata.hex)   // ✅ TypeScript lo sabe
 *   }
 * }
 */
export type BrandAsset =
  | (BrandAssetBase & { asset_type: 'logo';          metadata: LogoMetadata })
  | (BrandAssetBase & { asset_type: 'brand_book';    metadata: BrandBookMetadata })
  | (BrandAssetBase & { asset_type: 'product_image'; metadata: ProductImageMetadata })
  | (BrandAssetBase & { asset_type: 'reference_ad';  metadata: ReferenceAdMetadata })
  | (BrandAssetBase & { asset_type: 'template';      metadata: TemplateMetadata })

// ─────────────────────────────────────────────────────────────
// Helpers de narrowing por asset_type
// ─────────────────────────────────────────────────────────────

export function isLogoAsset(a: BrandAsset): a is BrandAsset & { asset_type: 'logo'; metadata: LogoMetadata } {
  return a.asset_type === 'logo'
}
export function isBrandBookAsset(a: BrandAsset): a is BrandAsset & { asset_type: 'brand_book'; metadata: BrandBookMetadata } {
  return a.asset_type === 'brand_book'
}
export function isProductImageAsset(a: BrandAsset): a is BrandAsset & { asset_type: 'product_image'; metadata: ProductImageMetadata } {
  return a.asset_type === 'product_image'
}
export function isReferenceAdAsset(a: BrandAsset): a is BrandAsset & { asset_type: 'reference_ad'; metadata: ReferenceAdMetadata } {
  return a.asset_type === 'reference_ad'
}
export function isTemplateAsset(a: BrandAsset): a is BrandAsset & { asset_type: 'template'; metadata: TemplateMetadata } {
  return a.asset_type === 'template'
}

// ─────────────────────────────────────────────────────────────
// Vista brand_assets_coverage
// ─────────────────────────────────────────────────────────────

/** Estado de generación inferido de la cobertura de activos. */
export type GenerationStatus =
  | 'blocked'   // Falta logo aprobado — mínimo imprescindible
  | 'pending'   // Hay logo pero faltan colores — marca incompleta
  | 'ready'     // Logo + colores aprobados — puede generar

/**
 * Fila de la tabla `brand_context`.
 * Un único registro por cliente; `processed_at` es null hasta que el
 * procesador de IA extrae el contexto del brand book.
 */
export interface BrandContextRow {
  id: string
  client_id: string
  /** Array de paleta de colores corporativos (JSONB) */
  colors: ColorMetadata[]
  /** Array de tipografías corporativas (JSONB) */
  typography: FontMetadata[]
  tone_of_voice: string | null
  style_keywords: string[] | null
  restrictions: string | null
  raw_summary: string | null
  processed_at: string | null
  source_file_id: string | null
  created_at: string
  updated_at: string
}

/**
 * Fila de la vista `brand_assets_coverage`.
 * Incluye todos los clientes (incluso los que tienen 0 activos).
 */
export interface BrandAssetsCoverage {
  /** UUID del cliente */
  cliente_id: string
  /** Nombre del cliente */
  cliente_nombre: string
  /** True si tiene al menos un logo aprobado y activo */
  has_logo: boolean
  /** True si tiene al menos un brand book aprobado y activo */
  has_brand_book: boolean
  /** True si tiene al menos una imagen de producto aprobada y activa */
  has_product_images: boolean
  /** True si el brand book ha sido procesado (brand_context.processed_at IS NOT NULL) */
  has_context: boolean
  /** Total de activos activos (no archivados) */
  total_assets: number
  /** Activos activos pendientes de aprobación */
  pending_review: number
  /** Estado calculado de la cobertura para generación de contenido */
  generation_status: GenerationStatus
}

// ─────────────────────────────────────────────────────────────
// Inputs para mutaciones (INSERT / UPDATE)
// ─────────────────────────────────────────────────────────────

/**
 * Input para crear un nuevo activo de marca.
 * Omite los campos autogenerados (id, created_at, updated_at).
 * `approved` y `active` son opcionales — por defecto false/true (ver schema).
 */
export interface CreateBrandAssetInput {
  client_id: string
  asset_type: AssetType
  drive_file_id: string
  drive_url: string
  file_name?: string
  mime_type?: string
  metadata?: BrandAssetMetadata
  approved?: boolean
  active?: boolean
  synced_at?: string
}

/**
 * Versión con tipado fuerte por asset_type.
 * Úsala cuando conoces el tipo en tiempo de compilación.
 *
 * @example
 * const input: CreateBrandAssetInputTyped<'color'> = {
 *   client_id: '...',
 *   asset_type: 'color',
 *   drive_file_id: '...',
 *   drive_url: '...',
 *   metadata: { hex: '#FF0000', name: 'Rojo corporativo' }, // ✅ inferido
 * }
 */
export type CreateBrandAssetInputTyped<T extends AssetType> = Omit<
  CreateBrandAssetInput,
  'asset_type' | 'metadata'
> & {
  asset_type: T
  metadata?: T extends 'logo'          ? LogoMetadata
           : T extends 'brand_book'    ? BrandBookMetadata
           : T extends 'product_image' ? ProductImageMetadata
           : T extends 'reference_ad'  ? ReferenceAdMetadata
           : T extends 'template'      ? TemplateMetadata
           : never
}

/**
 * Input para actualizar un activo existente.
 * Todos los campos mutables son opcionales excepto `id`.
 * No se puede cambiar `asset_type` (requeriría un DELETE + INSERT).
 */
export interface UpdateBrandAssetInput {
  id: string
  drive_file_id?: string
  drive_url?: string
  file_name?: string | null
  mime_type?: string | null
  metadata?: BrandAssetMetadata
  approved?: boolean
  active?: boolean
  synced_at?: string | null
}

// ─────────────────────────────────────────────────────────────
// Tipos auxiliares de conveniencia
// ─────────────────────────────────────────────────────────────

/**
 * Activos de un cliente agrupados por tipo.
 * Resultado típico de un fetch completo de la biblioteca de marca.
 */
export type BrandAssetsByType = {
  [T in AssetType]?: Extract<BrandAsset, { asset_type: T }>[]
}

/**
 * Resumen de un cliente con su cobertura y activos.
 * Combina BrandAssetsCoverage con la lista real de activos.
 */
export interface ClientBrandLibrary {
  coverage: BrandAssetsCoverage
  assets: BrandAssetsByType
}

/** Labels en español para mostrar en la UI */
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  logo:          'Logo',
  brand_book:    'Brand Book',
  product_image: 'Imagen de producto',
  reference_ad:  'Anuncio de referencia',
  template:      'Plantilla',
}

export const PUBLICATION_INTENT_LABELS: Record<PublicationIntent, string> = {
  organic_informative: 'Orgánico informativo',
  organic_brand:       'Orgánico de marca',
  paid_campaign:       'Campaña de pago',
}

export const GENERATION_STATUS_LABELS: Record<GenerationStatus, string> = {
  blocked: 'Bloqueado',
  pending: 'Pendiente',
  ready:   'Listo',
}
