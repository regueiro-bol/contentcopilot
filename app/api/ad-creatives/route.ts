/**
 * GET  /api/ad-creatives?client_id=xxx
 *      /api/ad-creatives?contenido_id=xxx&campaign_name=Imagen+destacada
 *
 * POST /api/ad-creatives
 *      Inserta un creative simple (usado desde el tab Imagen del detalle de contenido).
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const params      = request.nextUrl.searchParams
  const clientId    = params.get('client_id')
  const contenidoId = params.get('contenido_id')
  const campaignName = params.get('campaign_name')

  const supabase = createAdminClient()

  // ── Modo 1: filtrar por client_id (galería de ad creatives del cliente) ────
  if (clientId) {
    const { data, error } = await supabase
      .from('ad_creatives')
      .select('*')
      .eq('client_id', clientId)
      .not('image_url', 'is', null)
      .order('created_at', { ascending: false })
      .order('variation_index', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ creatives: data ?? [] })
  }

  // ── Modo 2: filtrar por contenido_id (tab Imagen del detalle) ─────────────
  if (contenidoId) {
    let query = supabase
      .from('ad_creatives')
      .select('id, image_url, format, status, campaign_name, created_at')
      .eq('contenido_id', contenidoId)
      .not('image_url', 'is', null)
      .order('created_at', { ascending: false })

    // Filtro por prefijo: "Imagen destacada%" soporta "Imagen destacada — Título"
    if (campaignName) query = query.ilike('campaign_name', `${campaignName}%`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const imagenes = (data ?? []).map((c) => ({
      id     : c.id as string,
      url    : c.image_url as string,
      formato: c.format as string,
    }))
    return NextResponse.json({ imagenes })
  }

  return NextResponse.json({ error: 'Proporciona client_id o contenido_id' }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: {
    contenido_id?      : string
    client_id          : string
    image_url          : string
    format?            : string
    status?            : string
    campaign_name?     : string
    publication_intent?: string
    copy?              : Record<string, string>
  }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { contenido_id, client_id, image_url, format, status, campaign_name, publication_intent, copy } = body
  if (!client_id || !image_url) {
    return NextResponse.json({ error: 'client_id e image_url son obligatorios' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('ad_creatives')
    .insert({
      contenido_id      : contenido_id       ?? null,
      client_id,
      image_url,
      format            : format             ?? '1200x630',
      status            : status             ?? 'draft',
      campaign_name     : campaign_name      ?? 'Imagen destacada',
      publication_intent: publication_intent ?? 'organic_informative',
      brief             : campaign_name      ?? 'Imagen destacada',
      model_used        : 'fal-ai/flux-pro/v1.1-ultra',
      variation_index   : 0,
      batch_id          : crypto.randomUUID(),
      copy              : copy ?? {},
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
