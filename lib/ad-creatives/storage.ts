/**
 * lib/ad-creatives/storage.ts
 *
 * Sube el PNG compuesto de un ad creative al bucket 'ad-creatives'
 * de Supabase Storage y devuelve la URL pública.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'ad-creatives'

/** Crea el bucket si no existe. Se llama una vez al inicio del handler. */
export async function ensureAdCreativesBucket(): Promise<void> {
  const supabase = createAdminClient()
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) {
    console.warn('[storage] No se pudo listar buckets:', error.message)
    return
  }
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 20 * 1024 * 1024,  // 20 MB
    })
    if (createErr) {
      console.error('[storage] Error creando bucket:', createErr.message)
    } else {
      console.log(`[storage] Bucket '${BUCKET}' creado`)
    }
  }
}

/**
 * Sube un buffer PNG al bucket y devuelve la URL pública.
 * Devuelve null si el upload falla.
 */
export async function uploadAdCreative(params: {
  buffer:         Buffer
  clientId:       string
  campaignName:   string | null | undefined
  format:         string
  variationIndex: number
}): Promise<string | null> {
  const { buffer, clientId, campaignName, format, variationIndex } = params
  const supabase = createAdminClient()

  const slug = (campaignName ?? 'sin-nombre')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quitar acentos
    .replace(/[^a-zA-Z0-9-_\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase()
    .slice(0, 60)

  const ts   = Date.now()
  const path = `${clientId}/${slug}/${format}_v${variationIndex}_${ts}.png`

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'image/png',
    upsert: true,
  })

  if (error) {
    console.error('[storage] Error subiendo creativo:', error.message)
    return null
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
