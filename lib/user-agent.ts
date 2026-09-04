/**
 * lib/user-agent.ts
 *
 * User-Agent para las descargas que hace ContentCopilot sobre webs de
 * clientes y competidores.
 *
 * ⚠️ NO volver al prefijo "Mozilla/5.0 (compatible; ...)".
 *
 * Esa cadena es la firma clásica de scrapers y la bloquean por defecto
 * varios plugins de seguridad de WordPress (Wordfence y similares). Con
 * ella, galicia.pet devolvía 403 de forma determinista mientras que el
 * mismo identificador sin el disfraz de Mozilla respondía 200:
 *
 *   Mozilla/5.0 (compatible; ContentCopilot/1.0; +https://…)  → 403
 *   Mozilla/5.0 (compatible)                                  → 403
 *   ContentCopilot/1.0 (+https://contentcopilot.ai)           → 200
 *
 * Además de funcionar, identificarnos honestamente es lo correcto: no
 * somos un navegador y no tiene sentido aparentarlo.
 */
export const USER_AGENT = 'ContentCopilot/1.0 (+https://contentcopilot.ai)'
