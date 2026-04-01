/**
 * GET /api/brand-assets/[id]/preview
 *
 * Sirve el fichero binario del activo directamente desde Google Drive
 * usando la service account. Se usa como src de <img> en la UI.
 *
 * Cacheable 1 h en el cliente (max-age=3600).
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth()
  if (!userId) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  // 1. Obtener drive_file_id y mime_type desde Supabase
  const supabase = createAdminClient()
  const { data: asset, error } = await supabase
    .from('brand_assets')
    .select('drive_file_id, mime_type')
    .eq('id', params.id)
    .single()

  if (error || !asset?.drive_file_id) {
    return new NextResponse('Asset no encontrado', { status: 404 })
  }

  // 2. Cliente de Drive con service account
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    return new NextResponse('Drive no configurado', { status: 500 })
  }

  let credentials: object
  try {
    credentials = JSON.parse(raw)
  } catch {
    return new NextResponse('Credenciales inválidas', { status: 500 })
  }

  const authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  const drive = google.drive({ version: 'v3', auth: authClient })

  // 3. Descargar bytes del fichero
  let buffer: Buffer
  try {
    const res = await drive.files.get(
      { fileId: asset.drive_file_id, alt: 'media' },
      { responseType: 'arraybuffer' },
    )
    buffer = Buffer.from(res.data as ArrayBuffer)
  } catch (err) {
    console.error('[preview] Error descargando desde Drive:', err)
    return new NextResponse('Error descargando fichero', { status: 502 })
  }

  const contentType = asset.mime_type ?? 'application/octet-stream'

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
