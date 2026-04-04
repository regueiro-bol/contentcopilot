/**
 * lib/google-api.ts
 *
 * Wrapper para OAuth 2.0 de Google y APIs de GSC / GA4.
 * Usa la librería `googleapis` (ya instalada).
 *
 * Variables de entorno requeridas:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   NEXT_PUBLIC_APP_URL       (para construir redirect URI)
 */

import { google } from 'googleapis'

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',   // GSC
  'https://www.googleapis.com/auth/analytics.readonly',     // GA4
  'https://www.googleapis.com/auth/userinfo.email',         // Email del usuario
]

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

/** Construye el redirect URI dinámicamente desde NEXT_PUBLIC_APP_URL */
export function buildRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/auth/google/callback`
}

/** Crea un cliente OAuth2 configurado */
function getOAuth2Client() {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('[GoogleAPI] GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no configurados')
  }

  return new google.auth.OAuth2(clientId, clientSecret, buildRedirectUri())
}

/** Crea un cliente OAuth2 con un access token para llamadas API */
function getAuthenticatedClient(accessToken: string) {
  const client = getOAuth2Client()
  client.setCredentials({ access_token: accessToken })
  return client
}

// ─────────────────────────────────────────────────────────────
// OAuth Flow
// ─────────────────────────────────────────────────────────────

/**
 * Genera la URL de autorización OAuth.
 * @param accountHint — email para pre-seleccionar la cuenta Google
 */
export function getAuthUrl(accountHint?: string): string {
  const client = getOAuth2Client()

  return client.generateAuthUrl({
    access_type : 'offline',
    prompt      : 'consent',    // Fuerza refresh_token en cada autorización
    scope       : SCOPES,
    ...(accountHint ? { login_hint: accountHint } : {}),
  })
}

/**
 * Intercambia un authorization code por tokens.
 * Devuelve access_token, refresh_token y fecha de expiración.
 */
export async function exchangeCode(code: string): Promise<{
  access_token  : string
  refresh_token : string
  expiry_date   : number | null
}> {
  const client = getOAuth2Client()
  const { tokens } = await client.getToken(code)

  if (!tokens.refresh_token) {
    throw new Error('Google no devolvió refresh_token. Revoca el acceso en myaccount.google.com y vuelve a conectar.')
  }

  return {
    access_token  : tokens.access_token  ?? '',
    refresh_token : tokens.refresh_token,
    expiry_date   : tokens.expiry_date   ?? null,
  }
}

/**
 * Refresca un access_token usando el refresh_token almacenado.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  expiry_date : number | null
}> {
  const client = getOAuth2Client()
  client.setCredentials({ refresh_token: refreshToken })

  const { credentials } = await client.refreshAccessToken()

  return {
    access_token: credentials.access_token ?? '',
    expiry_date : credentials.expiry_date  ?? null,
  }
}

/**
 * Obtiene el email y nombre del usuario autenticado.
 */
export async function getUserInfo(accessToken: string): Promise<{
  email       : string
  displayName : string | null
}> {
  const auth   = getAuthenticatedClient(accessToken)
  const oauth2 = google.oauth2({ version: 'v2', auth })
  const { data } = await oauth2.userinfo.get()

  return {
    email      : data.email ?? '',
    displayName: data.name  ?? null,
  }
}

// ─────────────────────────────────────────────────────────────
// Google Search Console
// ─────────────────────────────────────────────────────────────

export interface GSCProperty {
  siteUrl         : string
  permissionLevel : string | null
}

/**
 * Lista las propiedades (sites) de GSC accesibles con el token.
 */
export async function getGSCProperties(accessToken: string): Promise<GSCProperty[]> {
  const auth       = getAuthenticatedClient(accessToken)
  const webmasters = google.webmasters({ version: 'v3', auth })

  const { data } = await webmasters.sites.list()

  return (data.siteEntry ?? []).map((s) => ({
    siteUrl        : s.siteUrl         ?? '',
    permissionLevel: s.permissionLevel ?? null,
  }))
}

export interface GSCKeyword {
  query       : string
  clicks      : number
  impressions : number
  ctr         : number
  position    : number
}

/**
 * Obtiene keywords de GSC con métricas (clicks, impressions, ctr, position).
 * Agrupa por query, máximo 1000 filas.
 */
export async function getGSCKeywords(
  accessToken: string,
  siteUrl    : string,
  startDate  : string,
  endDate    : string,
): Promise<GSCKeyword[]> {
  const auth       = getAuthenticatedClient(accessToken)
  const webmasters = google.webmasters({ version: 'v3', auth })

  const { data } = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions : ['query'],
      rowLimit   : 1000,
      startRow   : 0,
    },
  })

  return (data.rows ?? []).map((row) => ({
    query      : row.keys?.[0] ?? '',
    clicks     : row.clicks      ?? 0,
    impressions: row.impressions  ?? 0,
    ctr        : row.ctr          ?? 0,
    position   : row.position     ?? 0,
  }))
}

// ─────────────────────────────────────────────────────────────
// Google Analytics 4
// ─────────────────────────────────────────────────────────────

export interface GA4Property {
  propertyId  : string
  displayName : string
  account     : string | null
}

/**
 * Lista las propiedades GA4 accesibles con el token.
 * Usa accountSummaries que devuelve cuentas + propiedades en una sola llamada.
 * Endpoint: GET https://analyticsadmin.googleapis.com/v1beta/accountSummaries
 *
 * Requiere que "Google Analytics Admin API" esté habilitada en Google Cloud Console.
 */
export async function getGA4Properties(accessToken: string): Promise<GA4Property[]> {
  const auth           = getAuthenticatedClient(accessToken)
  const analyticsAdmin = google.analyticsadmin({ version: 'v1beta', auth })

  const properties: GA4Property[] = []
  let pageToken: string | undefined

  try {
    // Paginar por si hay muchas cuentas/propiedades
    do {
      const { data } = await analyticsAdmin.accountSummaries.list({
        pageSize : 200,
        pageToken: pageToken,
      })

      console.log(`[GoogleAPI] accountSummaries: ${data.accountSummaries?.length ?? 0} cuentas en esta página`)

      for (const account of data.accountSummaries ?? []) {
        const accountName = account.displayName ?? account.account ?? ''

        for (const prop of account.propertySummaries ?? []) {
          properties.push({
            propertyId : prop.property?.replace('properties/', '') ?? '',
            displayName: prop.displayName ?? '',
            account    : accountName,
          })
        }
      }

      pageToken = data.nextPageToken ?? undefined
    } while (pageToken)

  } catch (err) {
    console.error('[GoogleAPI] Error en accountSummaries:', err instanceof Error ? err.message : err)
    // Si falla, devolvemos lo que tengamos (puede ser vacío)
  }

  console.log(`[GoogleAPI] Total propiedades GA4: ${properties.length}`)
  return properties
}
