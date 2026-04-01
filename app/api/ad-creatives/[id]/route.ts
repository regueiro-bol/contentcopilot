/**
 * PATCH /api/ad-creatives/[id]
 *
 * Actualiza el campo `copy` de un creative (headline, body, caption, tagline, cta).
 * Usado desde el drawer de edición de copy en la galería.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = params

  let body: { copy?: Record<string, string | undefined> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.copy || typeof body.copy !== 'object') {
    return NextResponse.json({ error: 'copy es requerido' }, { status: 400 })
  }

  // Solo permitir campos de copy válidos
  const allowedFields = ['headline', 'caption', 'tagline', 'body', 'cta']
  const sanitizedCopy: Record<string, string> = {}
  for (const [key, val] of Object.entries(body.copy)) {
    if (allowedFields.includes(key) && typeof val === 'string' && val.trim()) {
      sanitizedCopy[key] = val.trim()
    }
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('ad_creatives')
    .update({ copy: sanitizedCopy, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ creative: data })
}
