/**
 * GET /api/ad-creatives/download?client_id=xxx
 *
 * Descarga un ZIP con todos los creatives aprobados del cliente.
 * Cada imagen se nombra: [cliente]_[formato]_v[variacion]_[fecha].png/jpg
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('client_id')
  if (!clientId) {
    return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Obtener cliente + creatives aprobados
  const [{ data: cliente }, { data: creatives, error }] = await Promise.all([
    supabase.from('clientes').select('nombre').eq('id', clientId).single(),
    supabase
      .from('ad_creatives')
      .select('id, image_url, format, variation_index, publication_intent, created_at')
      .eq('client_id', clientId)
      .eq('status', 'approved')
      .not('image_url', 'is', null)
      .order('created_at', { ascending: true }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!creatives || creatives.length === 0) {
    return NextResponse.json({ error: 'No hay creatives aprobados para descargar' }, { status: 404 })
  }

  // Nombre base del cliente (slug seguro para sistema de ficheros)
  const clientSlug = (cliente?.nombre ?? 'cliente')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar tildes
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

  const zip = new JSZip()

  // Descargar cada imagen en paralelo (máx 10 concurrentes para no saturar)
  const BATCH_SIZE = 10
  for (let i = 0; i < creatives.length; i += BATCH_SIZE) {
    const batch = creatives.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (creative) => {
        if (!creative.image_url) return

        try {
          const res = await fetch(creative.image_url, { signal: AbortSignal.timeout(30_000) })
          if (!res.ok) return

          const buffer = await res.arrayBuffer()
          const contentType = res.headers.get('content-type') ?? 'image/png'
          const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png'

          const date = new Date(creative.created_at).toISOString().slice(0, 10)
          const fileName = `${clientSlug}_${creative.format}_v${creative.variation_index + 1}_${date}.${ext}`

          zip.file(fileName, buffer)
        } catch {
          // Si falla una imagen individual, continuar con las demás
        }
      }),
    )
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  const zipName = `${clientSlug}_ad_creatives_${new Date().toISOString().slice(0, 10)}.zip`

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Content-Length':      String(zipBuffer.length),
    },
  })
}
