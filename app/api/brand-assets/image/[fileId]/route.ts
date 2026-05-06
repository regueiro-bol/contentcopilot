/**
 * GET /api/brand-assets/image/[fileId]
 *
 * Proxy directo de Google Drive por fileId.
 * No requiere lookup en Supabase — usa el drive_file_id directamente.
 * Más ligero que /api/brand-assets/[id]/preview para uso en <img src>.
 *
 * Cache público de 1 hora para evitar saturar la API de Drive.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

// Mapa de extensión → MIME type para inferir el Content-Type sin DB lookup
const EXT_MIME: Record<string, string> = {
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  svg:  'image/svg+xml',
  pdf:  'application/pdf',
  ttf:  'font/ttf',
  otf:  'font/otf',
  woff: 'font/woff',
  woff2:'font/woff2',
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { fileId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const { fileId } = params
  if (!fileId) {
    return new NextResponse('fileId requerido', { status: 400 })
  }

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    return new NextResponse('Drive no configurado', { status: 500 })
  }

  let credentials: object
  try {
    credentials = JSON.parse(raw)
  } catch {
    console.error('[drive-proxy] JSON de service account inválido')
    return new NextResponse('Credenciales inválidas', { status: 500 })
  }

  const authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  const drive = google.drive({ version: 'v3', auth: authClient })

  let buffer: Buffer
  let mimeType: string | undefined

  try {
    // Obtener metadata primero para el MIME type real
    const meta = await drive.files.get({ fileId, fields: 'mimeType,name' })
    mimeType = meta.data.mimeType ?? undefined

    // Inferir por extensión si Drive no devuelve MIME
    if (!mimeType) {
      const ext = (meta.data.name ?? '').split('.').pop()?.toLowerCase() ?? ''
      mimeType = EXT_MIME[ext] ?? 'application/octet-stream'
    }

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' },
    )
    buffer = Buffer.from(res.data as ArrayBuffer)
  } catch (err) {
    console.error('[drive-proxy] Error descargando:', err instanceof Error ? err.message : String(err))
    return new NextResponse('Error descargando fichero', { status: 502 })
  }

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    headers: {
      'Content-Type':  mimeType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
