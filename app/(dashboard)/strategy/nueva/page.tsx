import { createAdminClient } from '@/lib/supabase/admin'
import NuevaEstrategiaClient from './nueva-estrategia-client'

interface PageProps {
  searchParams: { cliente?: string; inspiracion?: string; modo?: string }
}

export default async function NuevaEstrategiaPage({ searchParams }: PageProps) {
  const supabase = createAdminClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  // Si hay sesion de inspiracion, cargar oportunidades marcadas como seeds sugeridos
  let inspiracionSeeds: string[] = []
  let inspiracionSessionId: string | null = searchParams.inspiracion ?? null

  if (inspiracionSessionId) {
    const { data: session } = await supabase
      .from('inspiracion_sessions')
      .select('resultado, oportunidades_marcadas')
      .eq('id', inspiracionSessionId)
      .single()

    if (session) {
      const marcadas = new Set((session.oportunidades_marcadas ?? []) as string[])
      const resultado = (session.resultado ?? {}) as { oportunidades?: Array<{ id: string; tema: string }> }
      inspiracionSeeds = (resultado.oportunidades ?? [])
        .filter((op) => marcadas.has(op.id))
        .map((op) => op.tema)
    }
  }

  // Si hay cliente reciente con inspiracion completada (ultimos 30 dias), avisar
  let inspiracionReciente: { id: string; created_at: string } | null = null
  const clienteId = searchParams.cliente ?? null
  if (clienteId && !inspiracionSessionId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('inspiracion_sessions')
      .select('id, created_at')
      .eq('client_id', clienteId)
      .eq('status', 'completed')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    inspiracionReciente = recent ? { id: String(recent.id), created_at: String(recent.created_at) } : null
  }

  return (
    <NuevaEstrategiaClient
      clientes={clientes ?? []}
      inspiracionSeeds={inspiracionSeeds}
      inspiracionSessionId={inspiracionSessionId}
      inspiracionReciente={inspiracionReciente}
      clienteIdInicial={clienteId}
    />
  )
}
