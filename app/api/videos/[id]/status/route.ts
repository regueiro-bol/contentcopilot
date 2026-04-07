/**
 * PATCH /api/videos/[id]/status — { status: 'approved' | 'rejected' }
 */
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { status } = (await req.json()) as { status: 'approved' | 'rejected' }
    if (status !== 'approved' && status !== 'rejected') {
      return NextResponse.json({ error: 'status inválido' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('video_projects')
      .update({ status })
      .eq('id', ctx.params.id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ project: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}
