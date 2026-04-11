/**
 * POST /api/social/generate-post-image
 *
 * Generates an image for a social post using Fal.ai FLUX.
 * Optionally composes a logo and/or overlay text with sharp.
 * Uploads the result to Supabase Storage bucket 'social-assets'.
 *
 * Body: { postId, clientId, platform, format, visualDescription,
 *         ratio, style, includeLogo, overlayText }
 * Returns: { imageUrl }
 */

import { NextRequest, NextResponse } from 'next/server'
import { fal }                       from '@fal-ai/client'
import sharp                         from 'sharp'
import { createAdminClient }         from '@/lib/supabase/admin'
import { downloadFromDrive }         from '@/lib/google-drive'
import { guardarRegistroCoste }      from '@/lib/costes'

export const dynamic    = 'force-dynamic'
export const maxDuration = 120

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredColor { name: string; hex: string; role?: string; usage?: string }

interface FalImageResult {
  images?: Array<{ url: string }>
  image?:  { url: string }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FAL_MODEL = 'fal-ai/flux-pro/v1.1-ultra'

const RATIO_TO_ASPECT: Record<string, string> = {
  '1:1':  '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:5':  '4:5',
}

const RATIO_DIMS: Record<string, { width: number; height: number }> = {
  '1:1':  { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768  },
  '9:16': { width: 768,  height: 1344 },
  '4:5':  { width: 896,  height: 1120 },
}

const STYLE_DESCRIPTORS: Record<string, string> = {
  photorealistic: 'photorealistic, professional photography, high quality, detailed, commercial',
  illustration  : 'digital illustration, clean vector style, modern design, vibrant colors',
  minimalista   : 'minimalist design, clean, white space, simple geometric elements, elegant',
  editorial     : 'editorial photography style, magazine quality, sophisticated composition',
  corporativo   : 'corporate modern design, professional, clean layout, business aesthetic',
}

const BUCKET = 'social-assets'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureSocialAssetsBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, {
      public       : true,
      fileSizeLimit: 20 * 1024 * 1024,
    }).catch(() => { /* already exists */ })
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: {
    postId           : string
    clientId         : string
    platform         : string
    format           : string
    visualDescription: string
    ratio            : string
    style            : string
    includeLogo      : boolean
    overlayText      : string | null
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const {
    postId, clientId, platform, format,
    visualDescription, ratio, style, includeLogo, overlayText,
  } = body

  if (!postId || !clientId || !visualDescription) {
    return NextResponse.json({ error: 'postId, clientId y visualDescription son obligatorios' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    // ── PASO 1: Load brand context + logo asset ──
    const [{ data: brandCtx }, { data: logoAssets }] = await Promise.all([
      supabase.from('brand_context')
        .select('colors')
        .eq('client_id', clientId)
        .maybeSingle(),
      includeLogo
        ? supabase.from('brand_assets')
            .select('drive_file_id, drive_url, file_name, mime_type')
            .eq('client_id', clientId)
            .eq('asset_type', 'logo')
            .eq('active', true)
            .limit(1)
        : Promise.resolve({ data: [] as any[] }),
    ])

    // Extract primary color from brand_context.colors
    let primaryHex = '#1a1a2e'
    if (brandCtx?.colors && Array.isArray(brandCtx.colors)) {
      const colors = brandCtx.colors as StoredColor[]
      const primary = colors.find((c) => c.role === 'primary' || c.usage === 'primary') ?? colors[0]
      if (primary?.hex) primaryHex = primary.hex
    }

    // ── PASO 2: Build FLUX prompt ──
    const aspectRatio = RATIO_TO_ASPECT[ratio] ?? '1:1'
    const styleDesc   = STYLE_DESCRIPTORS[style] ?? STYLE_DESCRIPTORS.photorealistic

    const imagePrompt = [
      visualDescription,
      `Style: ${styleDesc}.`,
      primaryHex ? `Color palette: use ${primaryHex} as primary accent color.` : '',
      `Platform: ${platform}, optimized for ${format || 'social media'} format.`,
      'No text, no logos, no watermarks. High quality, professional content marketing image.',
    ].filter(Boolean).join(' ')

    // ── PASO 3: Call Fal.ai ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const falResult = await (fal as any).subscribe(FAL_MODEL, {
      input: {
        prompt          : imagePrompt,
        aspect_ratio    : aspectRatio,
        num_images      : 1,
        output_format   : 'jpeg',
        safety_tolerance: '4',
        enhance_prompt  : true,
      },
    }) as unknown as { data?: FalImageResult } | FalImageResult

    const falData = (falResult as { data?: FalImageResult }).data ?? (falResult as FalImageResult)
    const generatedUrl = falData?.images?.[0]?.url ?? (falData as any)?.image?.url ?? null

    if (!generatedUrl) {
      return NextResponse.json({ error: 'Fal.ai no devolvió imagen' }, { status: 502 })
    }

    // ── PASO 4: Download image from Fal.ai URL ──
    const imgResponse = await fetch(generatedUrl)
    if (!imgResponse.ok) {
      return NextResponse.json({ error: 'No se pudo descargar la imagen generada' }, { status: 502 })
    }
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer() as ArrayBuffer)

    const dims = RATIO_DIMS[ratio] ?? RATIO_DIMS['1:1']
    let finalBuffer = imgBuffer

    // ── PASO 5: Compose logo and/or overlay text with sharp (if needed) ──
    const needsCompose = (includeLogo && logoAssets && logoAssets.length > 0) || (overlayText?.trim())

    if (needsCompose) {
      // Keep in PNG (with alpha support) during all composition steps.
      // Only convert to JPEG at the very last step.
      const base = sharp(imgBuffer).resize(dims.width, dims.height, { fit: 'cover' }).png()
      const compositeInputs: sharp.OverlayOptions[] = []

      // Logo overlay
      if (includeLogo && logoAssets && logoAssets.length > 0) {
        const logoAsset = logoAssets[0]
        try {
          let logoBuffer: Buffer | null = null

          if (logoAsset.drive_file_id) {
            const downloaded = await downloadFromDrive(logoAsset.drive_file_id)
            logoBuffer = Buffer.isBuffer(downloaded) ? downloaded : null
          } else if (logoAsset.drive_url) {
            const r = await fetch(logoAsset.drive_url)
            if (r.ok) logoBuffer = Buffer.from(await r.arrayBuffer())
          }

          if (logoBuffer) {
            const logoSize = Math.round(dims.width * 0.15)
            // Keep PNG with alpha channel intact — do NOT convert to JPEG here.
            // blend:'over' tells sharp to respect the alpha channel.
            const resizedLogo = await sharp(logoBuffer)
              .resize(logoSize, logoSize, { fit: 'inside' })
              .png()            // preserve alpha
              .toBuffer()

            compositeInputs.push({
              input : resizedLogo,
              blend : 'over',  // respects alpha transparency
              top   : Math.round(dims.height * 0.04),
              left  : Math.round(dims.width  * 0.04),
            })
          }
        } catch (logoErr) {
          console.warn('[generate-post-image] Logo composite skipped:', logoErr)
        }
      }

      // Text overlay
      if (overlayText?.trim()) {
        const fontSize = Math.round(dims.width * 0.045)
        const maxCharsPerLine = Math.floor(dims.width / (fontSize * 0.55))
        const words = overlayText.trim().split(' ')
        const lines: string[] = []
        let current = ''
        for (const word of words) {
          if ((current + ' ' + word).trim().length > maxCharsPerLine) {
            if (current) lines.push(current)
            current = word
          } else {
            current = current ? current + ' ' + word : word
          }
        }
        if (current) lines.push(current)

        const lineHeight = fontSize * 1.3
        const textBlockH = lines.length * lineHeight + 40
        const textBlockW = dims.width - 80

        const textSvg = `<svg width="${textBlockW}" height="${textBlockH}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${textBlockW}" height="${textBlockH}" rx="8" fill="rgba(0,0,0,0.55)" />
          ${lines.map((line, i) => `
            <text
              x="${textBlockW / 2}"
              y="${24 + (i + 1) * lineHeight - fontSize * 0.2}"
              text-anchor="middle"
              font-family="sans-serif"
              font-size="${fontSize}"
              font-weight="bold"
              fill="white"
            >${escapeXml(line)}</text>`).join('')}
        </svg>`

        compositeInputs.push({
          input : Buffer.from(textSvg),
          left  : 40,
          top   : dims.height - Math.round(textBlockH) - Math.round(dims.height * 0.06),
        })
      }

      if (compositeInputs.length > 0) {
        // Composite on PNG pipeline (alpha preserved), then flatten to JPEG at the end
        finalBuffer = Buffer.from(
          await base
            .composite(compositeInputs)
            .flatten({ background: { r: 255, g: 255, b: 255 } }) // flatten alpha before JPEG
            .jpeg({ quality: 90 })
            .toBuffer(),
        )
      } else {
        finalBuffer = Buffer.from(await base.jpeg({ quality: 90 }).toBuffer())
      }
    } else {
      // Just resize
      finalBuffer = Buffer.from(
        await sharp(imgBuffer)
          .resize(dims.width, dims.height, { fit: 'cover' })
          .jpeg({ quality: 90 })
          .toBuffer(),
      )
    }

    // ── PASO 6: Upload to Supabase Storage ──
    await ensureSocialAssetsBucket(supabase)

    const fileName = `${clientId}/${postId}/${Date.now()}.jpg`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, finalBuffer, {
        contentType: 'image/jpeg',
        upsert      : true,
      })

    if (uploadError) {
      console.error('[generate-post-image] Upload error:', uploadError.message)
      return NextResponse.json({ error: 'Error al subir la imagen' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(fileName)

    // ── PASO 7: Update social_posts ──
    await supabase.from('social_posts').update({
      asset_url   : publicUrl,
      asset_type  : 'image',
      asset_source: 'ai_generated',
      status      : 'listo',
      updated_at  : new Date().toISOString(),
    }).eq('id', postId)

    // ── Register cost ──
    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-generate-post-image',
      modelo        : FAL_MODEL,
      tokens_input  : 0,
      tokens_output : 0,
      coste_usd     : 0.04, // approx flux-pro cost per image
      metadatos     : { ratio, style, includeLogo, hasOverlay: !!overlayText },
    }).catch(console.error)

    return NextResponse.json({ imageUrl: publicUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generate-post-image] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
