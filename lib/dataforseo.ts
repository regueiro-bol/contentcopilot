/**
 * lib/dataforseo.ts
 * ─────────────────────────────────────────────────────────────
 * Wrapper tipado para la API v3 de DataForSEO.
 *
 * Autenticación: HTTP Basic Auth con Base64(login:password).
 * Variables de entorno requeridas (server-only):
 *   DATAFORSEO_LOGIN
 *   DATAFORSEO_PASSWORD
 *
 * Defaults para España:
 *   locationCode : 2724  (Spain)
 *   languageCode : "es"
 * ─────────────────────────────────────────────────────────────
 */

const BASE_URL = 'https://api.dataforseo.com/v3'

// ─────────────────────────────────────────────────────────────
// Tipos de respuesta DataForSEO
// ─────────────────────────────────────────────────────────────

export interface DataForSEOTaskResult<T> {
  id          : string
  status_code : number
  status_message: string
  time        : string
  cost        : number
  result_count: number
  path        : string[]
  data        : Record<string, unknown>
  result      : T[] | null
}

export interface DataForSEOResponse<T> {
  version       : string
  status_code   : number
  status_message: string
  time          : string
  cost          : number
  tasks_count   : number
  tasks_error   : number
  tasks         : DataForSEOTaskResult<T>[]
}

// ── Tipos públicos ─────────────────────────────────────────────

export interface MonthlySearch {
  year  : number
  month : number
  search_volume: number
}

export interface KeywordIdeaItem {
  keyword           : string
  location_code     : number
  language_code     : string
  search_volume     : number | null
  competition       : number | null      // 0–1
  competition_level : 'LOW' | 'MEDIUM' | 'HIGH' | null
  cpc               : number | null      // USD
  keyword_difficulty: number | null      // 0–100
  search_intent     : 'informational' | 'transactional' | 'commercial' | 'navigational' | null
  monthly_searches  : MonthlySearch[] | null
  related_keywords  : string[] | null
}

export interface SearchVolumeItem {
  keyword          : string
  location_code    : number
  language_code    : string
  search_volume    : number | null
  competition      : number | null
  competition_level: 'LOW' | 'MEDIUM' | 'HIGH' | null
  cpc              : number | null
  monthly_searches : MonthlySearch[] | null
}

// ── SERP Results ───────────────────────────────────────────────

export interface SerpOrganicItem {
  type          : 'organic'
  rank_group    : number
  rank_absolute : number
  domain        : string
  title         : string
  description   : string | null
  url           : string
  breadcrumb    : string | null
}

export interface SerpResultItem {
  keyword           : string
  type              : string
  se_domain         : string
  location_code     : number
  language_code     : string
  check_url         : string
  datetime          : string
  item_types        : string[]
  se_results_count  : number | null
  items_count       : number
  items             : SerpOrganicItem[]
}

// ── Tipos internos para normalizar la respuesta de la API ──────

interface RawKeywordInfo {
  search_volume    : number | null
  competition      : number | null
  competition_level: 'LOW' | 'MEDIUM' | 'HIGH' | null
  cpc              : number | null
  monthly_searches : MonthlySearch[] | null
}

interface RawKeywordProperties {
  keyword_difficulty: number | null
}

interface RawSearchIntentInfo {
  main_intent: KeywordIdeaItem['search_intent']
}

interface RawKeywordIdeaItem {
  keyword           : string
  location_code     : number
  language_code     : string
  keyword_info      : RawKeywordInfo | null
  keyword_properties: RawKeywordProperties | null
  search_intent_info: RawSearchIntentInfo | null
}

interface RawKeywordIdeasResult {
  seed_keywords: string[]
  items_count  : number
  items        : RawKeywordIdeaItem[]
}

// ── Errores tipados ────────────────────────────────────────────

export class DataForSEOError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly taskErrors?: number,
  ) {
    super(`[DataForSEO ${statusCode}] ${message}`)
    this.name = 'DataForSEOError'
  }
}

// ─────────────────────────────────────────────────────────────
// Cliente interno
// ─────────────────────────────────────────────────────────────

function getAuthHeader(): string {
  const login    = process.env.DATAFORSEO_LOGIN    ?? ''
  const password = process.env.DATAFORSEO_PASSWORD ?? ''
  if (!login || !password) {
    throw new DataForSEOError(401, 'DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD son obligatorias')
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`
}

async function post<T>(
  endpoint : string,
  payload  : unknown[],
): Promise<DataForSEOResponse<T>> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method : 'POST',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type' : 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new DataForSEOError(res.status, `HTTP ${res.status}: ${res.statusText}`)
  }

  const data = await res.json() as DataForSEOResponse<T>

  if (data.status_code !== 20000) {
    throw new DataForSEOError(data.status_code, data.status_message, data.tasks_error)
  }

  return data
}

// ─────────────────────────────────────────────────────────────
// Funciones públicas
// ─────────────────────────────────────────────────────────────

/** Defaults para España */
const SPAIN_LOCATION = 2724
const SPAIN_LANGUAGE = 'es'

/**
 * Obtiene ideas de keywords relacionadas con las keywords semilla.
 * Endpoint: POST /dataforseo_labs/google/keyword_ideas/live
 *
 * @param keywords    - Array de keywords semilla (máx. 200)
 * @param locationCode - Código de país DataForSEO (default: 2724 = España)
 * @param languageCode - Código de idioma (default: "es")
 */
export async function getKeywordIdeas(
  keywords    : string[],
  locationCode: number = SPAIN_LOCATION,
  languageCode: string = SPAIN_LANGUAGE,
): Promise<KeywordIdeaItem[]> {
  if (keywords.length === 0) return []

  const response = await post<RawKeywordIdeasResult>(
    '/dataforseo_labs/google/keyword_ideas/live',
    [{
      keywords,
      location_code      : locationCode,
      language_code      : languageCode,
      include_serp_info  : true,
      include_seed_keyword: true,
      limit              : 100,
    }],
  )

  // La respuesta tiene estructura: tasks[0].result[0].items[]
  const items: RawKeywordIdeaItem[] = response.tasks?.[0]?.result?.[0]?.items ?? []

  return items.map((item) => ({
    keyword           : item.keyword,
    location_code     : item.location_code,
    language_code     : item.language_code,
    search_volume     : item.keyword_info?.search_volume     ?? null,
    competition       : item.keyword_info?.competition       ?? null,
    competition_level : item.keyword_info?.competition_level ?? null,
    cpc               : item.keyword_info?.cpc               ?? null,
    keyword_difficulty: item.keyword_properties?.keyword_difficulty ?? null,
    search_intent     : item.search_intent_info?.main_intent ?? null,
    monthly_searches  : item.keyword_info?.monthly_searches  ?? null,
    related_keywords  : null,
  }))
}

/**
 * Obtiene el volumen de búsqueda histórico de keywords específicas.
 * Endpoint: POST /keywords_data/google_ads/search_volume/live
 *
 * @param keywords    - Array de keywords exactas (máx. 700)
 * @param locationCode - Código de país DataForSEO (default: 2724 = España)
 * @param languageCode - Código de idioma (default: "es")
 */
export async function getSearchVolume(
  keywords    : string[],
  locationCode: number = SPAIN_LOCATION,
  languageCode: string = SPAIN_LANGUAGE,
): Promise<SearchVolumeItem[]> {
  if (keywords.length === 0) return []

  const response = await post<SearchVolumeItem>(
    '/keywords_data/google_ads/search_volume/live',
    [{
      keywords,
      location_code: locationCode,
      language_code: languageCode,
    }],
  )

  const results = response.tasks?.[0]?.result ?? []
  return results
}

/**
 * Obtiene los resultados orgánicos del SERP de Google para una keyword.
 * Endpoint: POST /serp/google/organic/live/advanced
 *
 * @param keyword     - Keyword a analizar
 * @param locationCode - Código de país DataForSEO (default: 2724 = España)
 * @param languageCode - Código de idioma (default: "es")
 * @param depth       - Número de resultados (default: 10)
 */
export async function getSerpResults(
  keyword     : string,
  locationCode: number = SPAIN_LOCATION,
  languageCode: string = SPAIN_LANGUAGE,
  depth       : number = 10,
): Promise<SerpResultItem | null> {
  const response = await post<SerpResultItem>(
    '/serp/google/organic/live/advanced',
    [{
      keyword,
      location_code: locationCode,
      language_code: languageCode,
      depth,
      se_domain: 'google.es',
    }],
  )

  return response.tasks?.[0]?.result?.[0] ?? null
}

/**
 * Formatea el nivel de dificultad de keyword a etiqueta legible.
 */
export function dificultadLabel(kd: number | null | undefined): string {
  if (kd == null) return '—'
  if (kd < 20)  return 'Muy fácil'
  if (kd < 40)  return 'Fácil'
  if (kd < 60)  return 'Media'
  if (kd < 80)  return 'Difícil'
  return 'Muy difícil'
}

/**
 * Formatea el volumen de búsqueda con separador de miles.
 */
export function volumenLabel(vol: number | null | undefined): string {
  if (vol == null) return '—'
  return vol.toLocaleString('es-ES')
}

/**
 * Mapea search_intent de DataForSEO a etiqueta en español.
 */
export function intentLabel(intent: KeywordIdeaItem['search_intent'] | undefined): string {
  if (!intent) return '—'
  const map: Record<string, string> = {
    informational : 'Informacional',
    transactional : 'Transaccional',
    commercial    : 'Comercial',
    navigational  : 'Navegacional',
  }
  return map[intent] ?? intent
}

// ─────────────────────────────────────────────────────────────
// Competitor Keywords (DataForSEO Labs)
// ─────────────────────────────────────────────────────────────

export interface CompetitorKeyword {
  keyword   : string
  volume    : number
  position  : number
  url       : string
  difficulty: number | null
  intent    : string | null
}

/**
 * Extrae el dominio limpio de una URL.
 * "https://www.ejemplo.es/pagina" → "ejemplo.es"
 */
export function extractDomain(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim()
}

/**
 * Obtiene las keywords que rankea un dominio competidor.
 * Endpoint: POST /dataforseo_labs/google/ranked_keywords/live
 *
 * @param domain       - Dominio sin protocolo ni trailing slash (ej: "competidor.es")
 * @param locationCode - Código de país DataForSEO (default: 2724 = España)
 * @param languageCode - Código de idioma (default: "es")
 * @param limit        - Máximo de keywords a devolver (default: 100)
 */
export async function getCompetitorKeywords(
  domain      : string,
  locationCode: number = SPAIN_LOCATION,
  languageCode: string = SPAIN_LANGUAGE,
  limit       : number = 100,
): Promise<CompetitorKeyword[]> {
  console.log(`[DataForSEO] Ranked keywords para ${domain} (limit=${limit})`)

  const data = await post<{
    items: Array<{
      keyword_data?: {
        keyword           : string
        keyword_info?: {
          search_volume     : number | null
          keyword_difficulty: number | null
          main_intent?      : string | null
        }
      }
      ranked_serp_element?: {
        serp_item?: {
          rank_absolute: number | null
          url          : string | null
        }
      }
    }>
  }>('/dataforseo_labs/google/ranked_keywords/live', [
    {
      target       : domain,
      location_code: locationCode,
      language_code: languageCode,
      limit,
      filters      : [
        ['keyword_data.keyword_info.search_volume', '>', 10],
      ],
    },
  ])

  const items = data.tasks?.[0]?.result?.[0]?.items ?? []
  console.log(`[DataForSEO] ${domain}: ${items.length} ranked keywords`)

  return items
    .filter((item) => item.keyword_data?.keyword)
    .map((item) => ({
      keyword   : item.keyword_data!.keyword,
      volume    : item.keyword_data?.keyword_info?.search_volume ?? 0,
      position  : item.ranked_serp_element?.serp_item?.rank_absolute ?? 0,
      url       : item.ranked_serp_element?.serp_item?.url ?? '',
      difficulty: item.keyword_data?.keyword_info?.keyword_difficulty ?? null,
      intent    : (item.keyword_data?.keyword_info as any)?.main_intent ?? null,
    }))
}
