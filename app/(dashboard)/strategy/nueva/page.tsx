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

  // Si hay sesion de inspiracion, cargar datos para pre-rellenar el briefing
  let inspiracionSeeds: string[] = []
  let inspiracionObjetivos = ''
  let inspiracionCompetidores: string[] = []
  const inspiracionSessionId: string | null = searchParams.inspiracion ?? null

  if (inspiracionSessionId) {
    const { data: session } = await supabase
      .from('inspiracion_sessions')
      .select('client_id, resultado, oportunidades_marcadas')
      .eq('id', inspiracionSessionId)
      .single()

    if (session) {
      const marcadas = new Set((session.oportunidades_marcadas ?? []) as string[])
      const resultado = (session.resultado ?? {}) as {
        oportunidades?: Array<{ id: string; tema: string; urgencia?: string }>
        resumen_ejecutivo?: { recomendacion_posicionamiento?: string }
      }

      // Seeds: oportunidades marcadas, o top 3 de urgencia alta si no hay marcadas
      const ops = resultado.oportunidades ?? []
      if (marcadas.size > 0) {
        inspiracionSeeds = ops.filter((op) => marcadas.has(op.id)).map((op) => op.tema)
      } else {
        inspiracionSeeds = ops.filter((op) => op.urgencia === 'alta').slice(0, 3).map((op) => op.tema)
      }

      // Objetivos: recomendacion de posicionamiento
      inspiracionObjetivos = resultado.resumen_ejecutivo?.recomendacion_posicionamiento ?? ''

      // Competidores: cargar competidores editoriales con URL web del cliente
      const { data: refs } = await supabase
        .from('referencias_externas')
        .select('nombre, referencia_presencias(plataforma, url)')
        .eq('client_id', session.client_id)
        .eq('tipo', 'competidor_editorial')
        .eq('activo', true)

      if (refs) {
        inspiracionCompetidores = refs
          .filter((r) => {
            const pres = (r.referencia_presencias ?? []) as Array<{ plataforma: string; url: string | null }>
            return pres.some((p) => p.plataforma === 'web' && p.url)
          })
          .map((r) => r.nombre)
      }
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
      inspiracionObjetivos={inspiracionObjetivos}
      inspiracionCompetidores={inspiracionCompetidores}
      inspiracionSessionId={inspiracionSessionId}
      inspiracionReciente={inspiracionReciente}
      clienteIdInicial={clienteId}
    />
  )
}
