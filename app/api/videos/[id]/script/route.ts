/**
 * PATCH /api/videos/[id]/script
 * Body: { script?, scenes?: [{id, description, narration_text, duration_seconds?}], approve?: boolean }
 */
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface SceneEdit {
  id: string
  description?: string
  narration_text?: string
  duration_seconds?: number
}
interface Body {
  script?: string
  scenes?: SceneEdit[]
  approve?: boolean
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const id = ctx.params.id
    const body = (await req.json()) as Body
    const supabase = createAdminClient()

    if (typeof body.script === 'string' || body.approve) {
      const update: Record<string, unknown> = {}
      if (typeof body.script === 'string') update.script = body.script
      if (body.approve) update.status = 'script_approved'
      const { error } = await supabase.from('video_projects').update(update).eq('id', id)
      if (error) {
        console.error('[script PATCH] project error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (Array.isArray(body.scenes)) {
      for (const s of body.scenes) {
        if (!s?.id) continue
        const upd: Record<string, unknown> = {}
        if (typeof s.description === 'string') upd.description = s.description
        if (typeof s.narration_text === 'string') upd.narration_text = s.narration_text
        if (typeof s.duration_seconds === 'number') upd.duration_seconds = s.duration_seconds
        if (Object.keys(upd).length === 0) continue
        const { error } = await supabase.from('video_scenes').update(upd).eq('id', s.id)
        if (error) console.error('[script PATCH] scene error:', error)
      }
    }

    const { data: project } = await supabase.from('video_projects').select('*').eq('id', id).single()
    const { data: scenes } = await supabase
      .from('video_scenes')
      .select('*')
      .eq('video_project_id', id)
      .order('scene_index', { ascending: true })

    return NextResponse.json({ project, scenes: scenes ?? [] })
  } catch (err) {
    console.error('[videos/script PATCH] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}
