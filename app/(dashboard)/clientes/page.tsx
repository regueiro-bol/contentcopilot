import { createAdminClient } from '@/lib/supabase/admin'
import ClientesPageClient from './clientes-client'
import type { Cliente } from '@/types'

export default async function ClientesPage() {
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('Service role key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('clientes')
    .select('*, proyectos(count)')
    .order('nombre')

  console.log('Supabase response:', JSON.stringify(data))
  console.log('Supabase error:', JSON.stringify(error))

  type Row = Omit<Cliente, 'restricciones_globales'> & {
    restricciones_globales: unknown
    proyectos: { count: number }[]
  }

  const clientes = ((data ?? []) as Row[]).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    slug: c.slug,
    sector: c.sector,
    url_web: c.url_web,
    logo_url: c.logo_url,
    activo: c.activo,
    created_at: c.created_at,
    descripcion: c.descripcion,
    identidad_corporativa: c.identidad_corporativa,
    restricciones_globales: (c.restricciones_globales ?? []) as string[],
    account_manager_id: c.account_manager_id,
    num_proyectos: c.proyectos?.[0]?.count ?? 0,
  }))

  return <ClientesPageClient clientes={clientes} />
}
