import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId  = searchParams.get('clientId')
  const month     = searchParams.get('month') // YYYY-MM

  if (!clientId || !month) {
    return NextResponse.json({ error: 'clientId and month required' }, { status: 400 })
  }

  const [year, mon] = month.split('-').map(Number)
  const startDate   = new Date(year, mon - 1, 1).toISOString().split('T')[0]
  const endDate     = new Date(year, mon, 0).toISOString().split('T')[0]

  const supabase = createAdminClient()

  // Join calendario_editorial with contenidos to get full article data
  const { data, error } = await supabase
    .from('calendario_editorial')
    .select(`
      id,
      contenido_id,
      titulo,
      keyword,
      fecha_publicacion,
      status,
      contenidos!inner (
        id,
        titulo,
        status,
        url_publicado
      )
    `)
    .eq('client_id', clientId)
    .gte('fecha_publicacion', startDate)
    .lte('fecha_publicacion', endDate)
    .in('status', ['planificado', 'en_redaccion', 'revision', 'publicado'])
    .order('fecha_publicacion', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the response for convenience
  const articles = (data ?? []).map((row: any) => ({
    id              : row.contenido_id ?? row.id,
    calendarId      : row.id,
    titulo          : (row.contenidos as any)?.titulo ?? row.titulo,
    keyword         : row.keyword,
    fechaPublicacion: row.fecha_publicacion,
    status          : row.status,
    urlPublicado    : (row.contenidos as any)?.url_publicado ?? null,
  }))

  return NextResponse.json(articles)
}
