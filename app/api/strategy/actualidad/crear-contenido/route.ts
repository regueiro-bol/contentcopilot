/**
 * POST /api/strategy/actualidad/crear-contenido
 *
 * Crea un contenido (pedido) desde una oportunidad de actualidad.
 * Body: { client_id, titulo, keyword, contexto, urgencia }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80)
}

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON invalido' }, { status: 400 })
  }

  const { client_id, titulo, keyword, contexto, urgencia } = body as {
    client_id: string; titulo: string; keyword?: string; contexto?: string; urgencia?: string
  }

  if (!client_id || !titulo) {
    return NextResponse.json({ error: 'client_id y titulo son obligatorios' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Buscar o crear proyecto "Actualidad"
  const PROJECT_NAME = 'Actualidad'
  let { data: proyecto } = await supabase
    .from('proyectos')
    .select('id')
    .eq('cliente_id', client_id)
    .eq('nombre', PROJECT_NAME)
    .eq('activo', true)
    .maybeSingle()

  if (!proyecto) {
    const { data: newProj, error: projErr } = await supabase
      .from('proyectos')
      .insert({
        cliente_id: client_id,
        nombre: PROJECT_NAME,
        slug: 'actualidad',
        descripcion: 'Contenidos de actualidad y tendencias',
        activo: true,
      })
      .select('id')
      .single()

    if (projErr || !newProj) {
      return NextResponse.json({ error: `Error creando proyecto: ${projErr?.message}` }, { status: 500 })
    }
    proyecto = newProj
  }

  // Verificar duplicado
  const slug = toSlug(titulo)
  const { data: existente } = await supabase
    .from('contenidos')
    .select('id')
    .eq('proyecto_id', proyecto.id)
    .eq('slug', slug)
    .maybeSingle()

  if (existente) {
    return NextResponse.json({ ok: true, contenido_id: existente.id, already_exists: true })
  }

  // Crear contenido
  const { data: contenido, error: contErr } = await supabase
    .from('contenidos')
    .insert({
      titulo: urgencia === '24h' ? `[URGENTE] ${titulo}` : titulo,
      slug,
      proyecto_id: proyecto.id,
      cliente_id: client_id,
      estado: 'pendiente',
      keyword_principal: keyword || null,
      brief: contexto ? { contexto_actualidad: contexto, urgencia } : null,
    })
    .select('id')
    .single()

  if (contErr || !contenido) {
    return NextResponse.json({ error: contErr?.message ?? 'Error creando contenido' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, contenido_id: contenido.id }, { status: 201 })
}
