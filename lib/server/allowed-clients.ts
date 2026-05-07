/**
 * getAllowedClientIds()
 *
 * Utilidad de servidor (App Router) para obtener los IDs de clientes
 * a los que tiene acceso el usuario autenticado.
 *
 * - Admin:               devuelve null  (ve todos los clientes)
 * - SEO / Redactor:      devuelve string[] con los IDs asignados
 *   (puede ser [] si no tiene ninguno asignado)
 *
 * Uso en page.tsx:
 *   const allowed = await getAllowedClientIds()
 *   let q = supabase.from('clientes').select('id, nombre').eq('activo', true)
 *   if (allowed !== null) q = q.in('id', allowed)
 *   const { data: clientes } = await q.order('nombre')
 */

import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function getAllowedClientIds(): Promise<string[] | null> {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return []  // no autenticado → lista vacía

  const supabase = createAdminClient()

  // Leer rol del usuario
  const { data: rolRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  // Admin → null (sin restricción)
  if (!rolRow || rolRow.role === 'admin') return null

  // Resto de roles → IDs asignados
  const { data: assignments } = await supabase
    .from('client_assignments')
    .select('client_id')
    .eq('user_id', userId)

  return (assignments ?? []).map((a) => String(a.client_id))
}
