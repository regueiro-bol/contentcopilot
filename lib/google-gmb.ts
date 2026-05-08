/**
 * lib/google-gmb.ts
 *
 * Wrapper para la API de Google My Business.
 * Usa tres endpoints distintos según la versión de la API:
 *   - Account Management: mybusinessaccountmanagement.googleapis.com/v1
 *   - Business Information: mybusinessbusinessinformation.googleapis.com/v1
 *   - Reviews / Insights:  mybusiness.googleapis.com/v4
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface GMBAccount {
  name        : string   // "accounts/12345"
  accountName : string
  type        : string
}

export interface GMBLocation {
  name         : string   // "accounts/12345/locations/67890"
  locationId   : string   // extracted id
  title        : string
  address      : string | null
  phone        : string | null
  websiteUri   : string | null
  primaryCategory: string | null
}

export interface GMBReview {
  reviewId    : string
  rating      : number        // 1-5
  comment     : string
  createTime  : string
  updateTime  : string
  reviewerName: string
}

export interface GMBInsights {
  viewsMaps       : number
  viewsSearch     : number
  clicksWebsite   : number
  clicksPhone     : number
  clicksDirections: number
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function gmbFetch(
  accessToken: string,
  url        : string,
  method     : 'GET' | 'POST' = 'GET',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?      : Record<string, any>,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type' : 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GMB API ${res.status} ${url.split('/').pop()}: ${text.substring(0, 300)}`)
  }

  return res.json()
}

/** Extrae el ID corto de un recurso GMB: "accounts/123/locations/456" → "456" */
function extractId(name: string): string {
  return name.split('/').pop() ?? name
}

// ─────────────────────────────────────────────────────────────
// Accounts
// ─────────────────────────────────────────────────────────────

/**
 * Lista las cuentas GMB accesibles con el token.
 */
export async function getGMBAccounts(accessToken: string): Promise<GMBAccount[]> {
  const data = await gmbFetch(
    accessToken,
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
  )

  const accounts = (data.accounts as Array<Record<string, unknown>> | undefined) ?? []

  return accounts.map((a) => ({
    name       : String(a.name        ?? ''),
    accountName: String(a.accountName ?? ''),
    type       : String(a.type        ?? ''),
  }))
}

// ─────────────────────────────────────────────────────────────
// Locations
// ─────────────────────────────────────────────────────────────

/**
 * Lista las ubicaciones de una cuenta GMB.
 * @param accountName — e.g. "accounts/12345"
 */
export async function getGMBLocations(
  accessToken: string,
  accountName: string,
): Promise<GMBLocation[]> {
  const data = await gmbFetch(
    accessToken,
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations` +
    '?readMask=name,title,storefrontAddress,phoneNumbers,websiteUri,categories',
  )

  const locations = (data.locations as Array<Record<string, unknown>> | undefined) ?? []

  return locations.map((loc) => {
    const addr = loc.storefrontAddress as Record<string, unknown> | undefined
    const phones = loc.phoneNumbers as Record<string, unknown> | undefined
    const cats = loc.categories as Record<string, unknown> | undefined
    const primaryCat = cats?.primaryCategory as Record<string, unknown> | undefined

    return {
      name          : String(loc.name  ?? ''),
      locationId    : extractId(String(loc.name ?? '')),
      title         : String(loc.title ?? ''),
      address       : addr
        ? [addr.addressLines, addr.locality, addr.administrativeArea].flat().filter(Boolean).join(', ')
        : null,
      phone         : (phones?.primaryPhone as string) || null,
      websiteUri    : (loc.websiteUri as string) || null,
      primaryCategory: (primaryCat?.displayName as string) || null,
    }
  })
}

/**
 * Lista todas las locations de todas las cuentas accesibles.
 * Conveniente para el selector en UI.
 */
export async function getAllGMBLocations(
  accessToken: string,
): Promise<Array<GMBLocation & { accountName: string }>> {
  const accounts = await getGMBAccounts(accessToken)
  const results: Array<GMBLocation & { accountName: string }> = []

  for (const account of accounts) {
    try {
      const locs = await getGMBLocations(accessToken, account.name)
      for (const loc of locs) {
        results.push({ ...loc, accountName: account.accountName })
      }
    } catch (e) {
      console.warn(`[GMB] Error getting locations for ${account.name}:`, e)
    }
  }

  return results
}

// ─────────────────────────────────────────────────────────────
// Reviews
// ─────────────────────────────────────────────────────────────

const STAR_MAP: Record<string, number> = {
  STAR_RATING_UNSPECIFIED: 0,
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
}

/**
 * Obtiene las últimas 50 reseñas de una ubicación.
 * @param locationName — e.g. "accounts/123/locations/456"
 */
export async function getGMBReviews(
  accessToken  : string,
  locationName : string,
): Promise<GMBReview[]> {
  const data = await gmbFetch(
    accessToken,
    `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50`,
  )

  const reviews = (data.reviews as Array<Record<string, unknown>> | undefined) ?? []

  return reviews.map((r) => ({
    reviewId    : String(r.reviewId    ?? ''),
    rating      : STAR_MAP[String(r.starRating ?? 'STAR_RATING_UNSPECIFIED')] ?? 0,
    comment     : String((r.comment as string) ?? ''),
    createTime  : String(r.createTime  ?? ''),
    updateTime  : String(r.updateTime  ?? ''),
    reviewerName: String((r.reviewer as Record<string, unknown>)?.displayName ?? 'Anónimo'),
  }))
}

// ─────────────────────────────────────────────────────────────
// Insights (métricas de visibilidad)
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene métricas de visibilidad de los últimos 30 días.
 * @param locationName — e.g. "accounts/123/locations/456"
 */
export async function getGMBInsights(
  accessToken : string,
  locationName: string,
): Promise<GMBInsights> {
  const endDate   = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 30)

  const fmt = (d: Date) => ({
    year : d.getFullYear(),
    month: d.getMonth() + 1,
    day  : d.getDate(),
  })

  try {
    const data = await gmbFetch(
      accessToken,
      `https://mybusiness.googleapis.com/v4/${locationName}:reportInsights`,
      'POST',
      {
        locationNames: [locationName],
        basicRequest : {
          metricRequests: [
            { metric: 'VIEWS_MAPS'               },
            { metric: 'VIEWS_SEARCH'             },
            { metric: 'ACTIONS_WEBSITE'          },
            { metric: 'ACTIONS_PHONE'            },
            { metric: 'ACTIONS_DRIVING_DIRECTIONS' },
          ],
          timeRange: {
            startTime: startDate.toISOString(),
            endTime  : endDate.toISOString(),
          },
        },
      },
    )

    const locationMetrics = (data.locationMetrics as Array<Record<string, unknown>> | undefined)?.[0]
    const metricValues    = (locationMetrics?.metricValues as Array<Record<string, unknown>> | undefined) ?? []

    const getVal = (metric: string): number => {
      const entry = metricValues.find((m) => m.metric === metric)
      const totalVal = (entry?.totalValue as Record<string, unknown> | undefined)?.value
      return Number(totalVal ?? 0)
    }

    return {
      viewsMaps       : getVal('VIEWS_MAPS'),
      viewsSearch     : getVal('VIEWS_SEARCH'),
      clicksWebsite   : getVal('ACTIONS_WEBSITE'),
      clicksPhone     : getVal('ACTIONS_PHONE'),
      clicksDirections: getVal('ACTIONS_DRIVING_DIRECTIONS'),
    }
  } catch (e) {
    console.warn('[GMB] Insights API error (non-fatal):', e instanceof Error ? e.message : e)
    return { viewsMaps: 0, viewsSearch: 0, clicksWebsite: 0, clicksPhone: 0, clicksDirections: 0 }
  }
}

/**
 * Obtiene el rating promedio y conteo de reseñas desde la API de Business Information.
 */
export async function getGMBRatingSummary(
  accessToken : string,
  locationName: string,
): Promise<{ avgRating: number; totalReviews: number }> {
  try {
    const data = await gmbFetch(
      accessToken,
      `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?readMask=metadata`,
    )

    const meta = data.metadata as Record<string, unknown> | undefined
    return {
      avgRating   : Number(meta?.avgRating    ?? 0),
      totalReviews: Number(meta?.totalReviews ?? 0),
    }
  } catch {
    return { avgRating: 0, totalReviews: 0 }
  }
}
