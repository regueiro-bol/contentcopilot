import { createAdminClient } from '@/lib/supabase/admin'
import { DashboardShell } from './dashboard-shell'

/**
 * Layout principal del dashboard — Server Component
 * Calcula el número de urgentes para el badge del sidebar.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createAdminClient()

  // Contar contenidos urgentes: entrega <= hoy+2 o estado 'devuelto', sin publicar/aprobar
  const hoy = new Date()
  hoy.setHours(23, 59, 59, 999)
  const en2Dias = new Date(hoy)
  en2Dias.setDate(en2Dias.getDate() + 2)

  const { count } = await supabase
    .from('contenidos')
    .select('id', { count: 'exact', head: true })
    .not('estado', 'in', '("aprobado","publicado")')
    .or(`estado.eq.devuelto,fecha_entrega.lte.${en2Dias.toISOString().split('T')[0]}`)

  const { count: pedidosPendientes } = await supabase
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'procesando')

  return (
    <DashboardShell urgentes={count ?? 0} pedidosPendientes={pedidosPendientes ?? 0}>
      {children}
    </DashboardShell>
  )
}
