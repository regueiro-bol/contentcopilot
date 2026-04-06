import { createAdminClient } from '@/lib/supabase/admin'
import InspiracionLandingClient from './inspiracion-landing-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { cliente?: string }
}

export default async function InspiracionPage({ searchParams }: PageProps) {
  const supabase = createAdminClient()

  const [
    { data: clientes },
    { data: sesiones },
  ] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nombre, sector')
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('inspiracion_sessions')
      .select('id, client_id, status, created_at, config, clientes(nombre)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  return (
    <InspiracionLandingClient
      clientes={(clientes ?? []).map((c) => ({
        id: String(c.id), nombre: String(c.nombre), sector: (c.sector as string | null) ?? null,
      }))}
      sesiones={(sesiones ?? []).map((s) => ({
        id: String(s.id),
        client_id: String(s.client_id),
        client_nombre: ((s.clientes as unknown as { nombre: string } | null))?.nombre ?? '—',
        status: String(s.status),
        foco: ((s.config as Record<string, unknown>)?.foco as string) ?? 'contenidos',
        created_at: String(s.created_at),
      }))}
      clienteIdInicial={searchParams.cliente ?? null}
    />
  )
}
