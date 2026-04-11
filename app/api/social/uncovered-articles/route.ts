import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const month    = searchParams.get('month') // YYYY-MM

  if (!clientId || !month) {
    return NextResponse.json({ error: 'clientId and month required' }, { status: 400 })
  }

  const [year, mon] = month.split('-').map(Number)
  const startDate   = new Date(year, mon - 1, 1).toISOString().split('T')[0]
  const endDate     = new Date(year, mon, 0).toISOString().split('T')[0]

  const supabase = createAdminClient()

  // Step 1: get all blog articles for the month
  const { data: articles, error: artErr } = await supabase
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
        status
      )
    `)
    .eq('client_id', clientId)
    .gte('fecha_publicacion', startDate)
    .lte('fecha_publicacion', endDate)
    .in('status', ['planificado', 'en_redaccion', 'revision', 'publicado'])
    .order('fecha_publicacion', { ascending: true })

  if (artErr) return NextResponse.json({ error: artErr.message }, { status: 500 })
  if (!articles || articles.length === 0) return NextResponse.json([])

  // Step 2: get all social_calendar entries for this client that reference any contenido
  const contenidoIds = articles
    .map((a: any) => a.contenido_id)
    .filter(Boolean) as string[]

  const { data: covered, error: covErr } = await supabase
    .from('social_calendar')
    .select('blog_contenido_id')
    .eq('client_id', clientId)
    .in('blog_contenido_id', contenidoIds)

  if (covErr) return NextResponse.json({ error: covErr.message }, { status: 500 })

  const coveredIds = new Set((covered ?? []).map((c: any) => c.blog_contenido_id))

  // Step 3: filter articles not covered
  const uncovered = (articles as any[])
    .filter((a) => !coveredIds.has(a.contenido_id))
    .map((a) => ({
      id              : a.contenido_id ?? a.id,
      calendarId      : a.id,
      titulo          : (a.contenidos as any)?.titulo ?? a.titulo,
      keyword         : a.keyword,
      fechaPublicacion: a.fecha_publicacion,
      status          : a.status,
    }))

  return NextResponse.json(uncovered)
}
