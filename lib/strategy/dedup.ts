/**
 * lib/strategy/dedup.ts
 *
 * Normalización y detección de solapamiento para la cadena editorial.
 *
 * Dos problemas que resuelve:
 *
 * 1. Fragmentación de clusters. El clustering procesa lotes en paralelo y
 *    cada llamada bautiza sus clusters sin ver los nombres elegidos por las
 *    demás. Resultado: "Precio Incineración Mascotas", "Precios incineración
 *    mascotas" y "Precios Incineración Mascotas" conviven como tres clusters
 *    distintos, y cada uno recibe su cuota de artículos por separado.
 *
 * 2. Títulos duplicados. Los lotes de generate-map también corren en
 *    paralelo, así que un lote no ve los títulos de otro, y dentro de un
 *    mismo cluster con keywords casi sinónimas el modelo produce
 *    reescrituras del mismo artículo.
 */

// ─────────────────────────────────────────────────────────────
// Normalización base
// ─────────────────────────────────────────────────────────────

/** Minúsculas, sin tildes, sin puntuación, espacios colapsados */
export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Singular aproximado en español.
 *
 * No busca corrección lingüística sino CONSISTENCIA: lo importante es que
 * dos variantes de la misma palabra produzcan la misma clave, aunque el
 * resultado no sea un singular real ("analisis" → "analisi").
 */
function singularizar(palabra: string): string {
  if (palabra.length > 4 && palabra.endsWith('es')) {
    const anterior = palabra[palabra.length - 3]
    // consonante + "es" → plural de palabra terminada en consonante
    if (!'aeiou'.includes(anterior)) return palabra.slice(0, -2)
  }
  if (palabra.length > 3 && palabra.endsWith('s')) return palabra.slice(0, -1)
  return palabra
}

/**
 * Clave de agrupación para nombres de cluster.
 * "Precios Incineración Mascotas" y "precio incineracion mascota"
 * producen la misma clave.
 */
export function claveCluster(nombre: string): string {
  return normalizarTexto(nombre)
    .split(' ')
    .filter(Boolean)
    .map(singularizar)
    .sort()          // el orden de las palabras no debe crear clusters distintos
    .join(' ')
}

// ─────────────────────────────────────────────────────────────
// Similitud de títulos
// ─────────────────────────────────────────────────────────────

/** Palabras vacías que no aportan señal al comparar dos títulos */
const STOPWORDS = new Set([
  'a', 'ante', 'con', 'contra', 'de', 'del', 'desde', 'el', 'en', 'entre',
  'hacia', 'hasta', 'la', 'las', 'lo', 'los', 'para', 'por', 'que', 'se',
  'segun', 'sin', 'sobre', 'su', 'sus', 'tras', 'un', 'una', 'uno', 'unos',
  'unas', 'y', 'o', 'e', 'u', 'al', 'es', 'son', 'mas', 'muy', 'todo',
  'toda', 'todos', 'todas', 'guia', 'completa', 'completo',
])

/** Conjunto de palabras con contenido, normalizadas y en singular */
export function tokensContenido(texto: string): Set<string> {
  return new Set(
    normalizarTexto(texto)
      .split(' ')
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
      .map(singularizar),
  )
}

/** Índice de Jaccard entre dos conjuntos de tokens: |A∩B| / |A∪B| */
export function similitudJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let interseccion = 0
  for (const t of Array.from(a)) if (b.has(t)) interseccion++
  const union = a.size + b.size - interseccion
  return union === 0 ? 0 : interseccion / union
}

// ─────────────────────────────────────────────────────────────
// Clusters fuera del negocio
// ─────────────────────────────────────────────────────────────

/** Nombre canónico que el prompt de clustering pide usar */
export const CLUSTER_FUERA_DE_NEGOCIO = 'Sin relación con el negocio'

/**
 * Patrones que marcan un cluster como ajeno a lo que vende el cliente.
 * Incluye el nombre canónico y las variantes que el modelo ha ido
 * inventando por su cuenta en sesiones anteriores.
 */
const PATRONES_EXCLUSION: RegExp[] = [
  /sin\s+relaci[oó]n/i,
  /no\s+relacionad/i,
  /fuera\s+de\s+(negocio|tem[aá]tica|[aá]mbito)/i,
  /irrelevante/i,
  /descartar/i,
  /\(no\s+cliente\)/i,
  /competidor/i,      // el prompt ya prohíbe artículos sobre la competencia
  /\bmarcas?\b.*competencia/i,
]

/** ¿Este cluster debe quedar fuera del generador de mapa? */
export function esClusterExcluido(nombre: string | null | undefined): boolean {
  if (!nombre) return false
  return PATRONES_EXCLUSION.some((p) => p.test(nombre))
}

// ─────────────────────────────────────────────────────────────
// Deduplicación de artículos
// ─────────────────────────────────────────────────────────────

export interface ArticuloDedup {
  title       : string
  main_keyword: string
}

export interface ResultadoDedup<T> {
  conservados: T[]
  descartados: Array<{ item: T; motivo: string; contra: string }>
}

/**
 * Elimina artículos que solapan entre sí o con contenido que ya existe.
 *
 * Tres criterios, del más barato al más caro:
 *   1. Título idéntico tras normalizar
 *   2. main_keyword idéntica tras normalizar
 *   3. Jaccard de palabras con contenido por encima del umbral
 *
 * @param articulos        candidatos generados, en orden de preferencia
 * @param titulosExistentes títulos ya publicados o ya creados en la app
 * @param umbral           similitud a partir de la cual se considera duplicado
 *
 * El umbral por defecto es deliberadamente alto. Con 0.7, dos artículos que
 * solo se distinguen por la especie ("cuánto cuesta incinerar un perro" vs
 * "...un gato") puntúan 0.71 y se fusionan, porque el token discriminante
 * pesa lo mismo que cualquier otro. A 0.8 sobreviven, y las reescrituras
 * reales — que quedan idénticas tras quitar palabras vacías — siguen cayendo.
 */
export function deduplicarArticulos<T extends ArticuloDedup>(
  articulos        : T[],
  titulosExistentes: string[] = [],
  umbral           = 0.8,
): ResultadoDedup<T> {
  const conservados: T[] = []
  const descartados: ResultadoDedup<T>['descartados'] = []

  // Referencias de lo que ya existe — se comparan pero nunca se conservan
  const refsExistentes = titulosExistentes
    .filter(Boolean)
    .map((t) => ({ titulo: t, norm: normalizarTexto(t), tokens: tokensContenido(t) }))

  const vistosTitulo  = new Set(refsExistentes.map((r) => r.norm))
  const vistosKeyword = new Set<string>()
  const refsAceptadas = refsExistentes.map((r) => ({ titulo: r.titulo, tokens: r.tokens }))

  for (const art of articulos) {
    const normTitulo  = normalizarTexto(art.title)
    const normKeyword = normalizarTexto(art.main_keyword)

    if (vistosTitulo.has(normTitulo)) {
      descartados.push({ item: art, motivo: 'titulo_identico', contra: art.title })
      continue
    }

    if (normKeyword && vistosKeyword.has(normKeyword)) {
      descartados.push({ item: art, motivo: 'keyword_identica', contra: art.main_keyword })
      continue
    }

    const tokens = tokensContenido(art.title)
    const choque = refsAceptadas.find((r) => similitudJaccard(tokens, r.tokens) >= umbral)

    if (choque) {
      descartados.push({ item: art, motivo: 'similitud_alta', contra: choque.titulo })
      continue
    }

    conservados.push(art)
    vistosTitulo.add(normTitulo)
    if (normKeyword) vistosKeyword.add(normKeyword)
    refsAceptadas.push({ titulo: art.title, tokens })
  }

  return { conservados, descartados }
}
