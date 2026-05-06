/**
 * GET /api/social/benchmark/competitors?clientId=xxx
 *
 * Devuelve los competidores editoriales (referencias_externas tipo='competidor_editorial')
 * que tienen al menos una presencia social configurada en referencia_presencias.
 * Plataformas sociales: instagram, tiktok, x, youtube, linkedin.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const SOCIAL_PLATFORMS = ['instagram', 'tiktok', 'x', 'youtube', 'linkedin']

// Mapeo de nombre de plataforma en referencia_presencias → clave normalizada
const PLATFORM_MAP: Record<string, string> = {
  instagram: 'instagram',
  tiktok   : 'tiktok',
  x        : 'twitter_x',
  youtube  : 'youtube',
  linkedin : 'linkedin',
}

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()

  // Leer competidores editoriales con sus presencias
  const { data: refs, error } = await supabase
    .from('referencias_externas')
    .select(`
      id,
      nombre,
      referencia_presencias (
        plataforma,
        url,
        handle,
        activo
      )
    `)
    .eq('client_id', clientId)
    .eq('tipo', 'competidor_editorial')
    .eq('activo', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!refs) return NextResponse.json([])

  type Presencia = { plataforma: string; url: string | null; handle: string | null; activo: boolean }

  // Filtrar solo los que tengan al menos una presencia social
  const result = refs
    .map((ref) => {
      const presencias = (ref.referencia_presencias as Presencia[] ?? [])
        .filter((p) => SOCIAL_PLATFORMS.includes(p.plataforma) && (p.url || p.handle))

      return {
        id      : ref.id,
        name    : ref.nombre,
        networks: presencias.map((p) => ({
          platform: PLATFORM_MAP[p.plataforma] ?? p.plataforma,
          url     : p.url,
          handle  : p.handle,
        })),
      }
    })
    .filter((r) => r.networks.length > 0)

  return NextResponse.json(result)
}
