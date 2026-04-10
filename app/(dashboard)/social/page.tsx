/**
 * /social — Bloque B: Ejecución Social Media
 * Vista global con selector de cliente y estado de estrategia.
 */

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import SocialPageClient from './social-page-client'

export const dynamic = 'force-dynamic'

export default async function SocialPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const supabase = createAdminClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre, sector')
    .eq('activo', true)
    .order('nombre')

  return <SocialPageClient clientes={clientes ?? []} />
}
