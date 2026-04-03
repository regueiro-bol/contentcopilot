import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PATCH /api/strategy/keywords/batch
 *
 * Actualiza el campo `incluida` de múltiples keywords en una sola llamada.
 *
 * Body: {
 *   cambios: { id: string; incluida: boolean }[]
 * }
 */
export async function PATCH(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { cambios } = await request.json() as {
      cambios: { id: string; incluida: boolean }[]
    }

    if (!Array.isArray(cambios) || cambios.length === 0) {
      return NextResponse.json({ error: 'Ningún cambio proporcionado' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const errores: string[] = []

    // Ejecutar actualizaciones individuales (Supabase no soporta bulk update con valores distintos)
    // Para evitar N+1 se agrupan por valor de `incluida`
    const incluir  = cambios.filter((c) => c.incluida).map((c) => c.id)
    const excluir  = cambios.filter((c) => !c.incluida).map((c) => c.id)

    if (incluir.length > 0) {
      const { error } = await supabase
        .from('keywords')
        .update({ incluida: true })
        .in('id', incluir)
      if (error) errores.push(`incluir: ${error.message}`)
    }

    if (excluir.length > 0) {
      const { error } = await supabase
        .from('keywords')
        .update({ incluida: false })
        .in('id', excluir)
      if (error) errores.push(`excluir: ${error.message}`)
    }

    if (errores.length > 0) {
      return NextResponse.json({ error: errores.join('; ') }, { status: 500 })
    }

    return NextResponse.json({ ok: true, actualizadas: cambios.length })

  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
