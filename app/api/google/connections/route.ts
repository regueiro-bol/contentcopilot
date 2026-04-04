import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/google/connections?client_id=...
 *
 * Devuelve la conexión Google activa de un cliente (si existe).
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const clientId = request.nextUrl.searchParams.get('client_id')
  if (!clientId) {
    return NextResponse.json({ error: 'client_id es obligatorio' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: connection, error } = await supabase
    .from('client_google_connections')
    .select('id, client_id, google_account_id, gsc_property_url, ga4_property_id, ga4_stream_id, status, google_accounts(email, display_name)')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    console.error('[GoogleConnections] Error cargando conexión:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ connection })
}

/**
 * POST /api/google/connections
 *
 * Crea o actualiza una conexión entre un cliente y una cuenta Google,
 * con las propiedades GSC y GA4 seleccionadas.
 *
 * Body: {
 *   client_id         : string
 *   google_account_id : string
 *   gsc_property_url? : string | null
 *   ga4_property_id?  : string | null
 *   ga4_stream_id?    : string | null
 * }
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: {
    client_id         : string
    google_account_id : string
    gsc_property_url? : string | null
    ga4_property_id?  : string | null
    ga4_stream_id?    : string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { client_id, google_account_id } = body

  if (!client_id || !google_account_id) {
    return NextResponse.json(
      { error: 'client_id y google_account_id son obligatorios' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  // Verificar que el cliente existe
  const { data: client } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', client_id)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  // Verificar que la cuenta Google existe
  const { data: account } = await supabase
    .from('google_accounts')
    .select('id')
    .eq('id', google_account_id)
    .single()

  if (!account) {
    return NextResponse.json({ error: 'Cuenta Google no encontrada' }, { status: 404 })
  }

  // Upsert conexión (unique constraint: client_id + google_account_id)
  const { data: connection, error } = await supabase
    .from('client_google_connections')
    .upsert(
      {
        client_id,
        google_account_id,
        gsc_property_url: body.gsc_property_url ?? null,
        ga4_property_id : body.ga4_property_id  ?? null,
        ga4_stream_id   : body.ga4_stream_id    ?? null,
        status          : 'active',
        updated_at      : new Date().toISOString(),
      },
      { onConflict: 'client_id,google_account_id' },
    )
    .select('id, client_id, google_account_id, gsc_property_url, ga4_property_id, status')
    .single()

  if (error) {
    console.error('[GoogleConnections] Error guardando conexión:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[GoogleConnections] Conexión guardada: cliente=${client_id}, cuenta=${google_account_id}`)

  return NextResponse.json({ ok: true, connection })
}
