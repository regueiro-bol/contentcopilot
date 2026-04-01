/**
 * lib/google-drive.ts
 *
 * Utilidad compartida para descargar ficheros de Google Drive
 * usando la service account configurada en GOOGLE_SERVICE_ACCOUNT_JSON.
 */

import { google } from 'googleapis'

/**
 * Descarga un fichero de Drive por su fileId.
 * Devuelve null si no hay credenciales o si la descarga falla.
 */
export async function downloadFromDrive(fileId: string): Promise<Buffer | null> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    console.warn('[drive] GOOGLE_SERVICE_ACCOUNT_JSON no configurado')
    return null
  }

  let credentials: object
  try {
    credentials = JSON.parse(raw)
  } catch {
    console.error('[drive] JSON de service account inválido')
    return null
  }

  try {
    const authClient = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })
    const drive = google.drive({ version: 'v3', auth: authClient })
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' },
    )
    return Buffer.from(res.data as ArrayBuffer)
  } catch (err) {
    console.error('[drive] Error descargando fichero:', err instanceof Error ? err.message : String(err))
    return null
  }
}
