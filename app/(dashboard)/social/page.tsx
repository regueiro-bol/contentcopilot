/**
 * /social — Bloque B: Ejecución Social Media
 * Vista global con selector de cliente y estado de estrategia.
 */

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedClientIds } from '@/lib/server/allowed-clients'
import { PermissionGuard } from '@/components/PermissionGuard'
import SocialPageClient from './social-page-client'

export const dynamic = 'force-dynamic'

export default async function SocialPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const supabase = createAdminClient()
  const allowed  = await getAllowedClientIds()

  let q = supabase
    .from('clientes')
    .select('id, nombre, sector')
    .eq('activo', true)
  if (allowed !== null) q = q.in('id', allowed.length > 0 ? allowed : ['__none__'])

  const { data: clientes } = await q.order('nombre')

  return (
    <PermissionGuard permission="module:social_media">
      <SocialPageClient clientes={clientes ?? []} />
    </PermissionGuard>
  )
}
