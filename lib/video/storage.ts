/**
 * lib/video/storage.ts — bucket 'videos' en Supabase Storage.
 */
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'videos'

export async function ensureVideosBucket(): Promise<void> {
  const supabase = createAdminClient()
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) {
    console.warn('[video/storage] No se pudo listar buckets:', error.message)
    return
  }
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 200 * 1024 * 1024, // 200 MB
    })
    if (createErr) {
      console.error('[video/storage] Error creando bucket:', createErr.message)
    }
  }
}

export async function uploadVideoAsset(params: {
  buffer: Buffer
  path: string
  contentType: string
}): Promise<string | null> {
  const { buffer, path, contentType } = params
  const supabase = createAdminClient()
  await ensureVideosBucket()

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
    cacheControl: '3600',
  })
  if (error) {
    console.error('[video/storage] upload error:', error.message)
    return null
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
