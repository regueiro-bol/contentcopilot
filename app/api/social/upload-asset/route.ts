/**
 * POST /api/social/upload-asset
 *
 * Multipart file upload for social post visual assets.
 * Uploads to Supabase Storage bucket 'social-assets'.
 *
 * Form fields:
 *   file     — the file (image/*, video/*)
 *   clientId — string
 *   postId   — string
 *
 * Returns: { url: string, assetType: 'image' | 'video' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const BUCKET          = 'social-assets'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024   // 10 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024   // 50 MB

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, {
      public       : true,
      fileSizeLimit: 50 * 1024 * 1024,
    }).catch(() => { /* already exists */ })
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()

    const file     = form.get('file')     as File | null
    const clientId = form.get('clientId') as string | null
    const postId   = form.get('postId')   as string | null

    if (!file || !clientId || !postId) {
      return NextResponse.json({ error: 'file, clientId y postId son obligatorios' }, { status: 400 })
    }

    const mimeType  = file.type || 'application/octet-stream'
    const isImage   = mimeType.startsWith('image/')
    const isVideo   = mimeType.startsWith('video/')

    if (!isImage && !isVideo) {
      return NextResponse.json({ error: 'Solo se aceptan archivos de imagen o vídeo' }, { status: 400 })
    }

    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (file.size > maxBytes) {
      const limit = isVideo ? '50MB' : '10MB'
      return NextResponse.json(
        { error: `El archivo supera el límite de ${limit}` },
        { status: 413 },
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Determine extension from mime type
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
      'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    }
    const ext = extMap[mimeType] ?? (isImage ? 'jpg' : 'mp4')

    const supabase = createAdminClient()
    await ensureBucket(supabase)

    const fileName = `${clientId}/${postId}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert      : true,
      })

    if (uploadError) {
      console.error('[upload-asset] Upload error:', uploadError.message)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(fileName)

    return NextResponse.json({
      url      : publicUrl,
      assetType: isImage ? 'image' : 'video',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload-asset] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
