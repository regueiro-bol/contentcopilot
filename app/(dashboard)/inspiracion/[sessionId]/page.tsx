import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import InspiracionClient from './inspiracion-client'

export const dynamic = 'force-dynamic'

export default async function InspiracionPage({ params }: { params: { sessionId: string } }) {
  const supabase = createAdminClient()

  const { data: session } = await supabase
    .from('inspiracion_sessions')
    .select('*, clientes(nombre, sector)')
    .eq('id', params.sessionId)
    .single()

  if (!session) notFound()

  const clienteInfo = session.clientes as { nombre: string; sector: string | null } | null

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/inspiracion" className="hover:text-gray-700 transition-colors">Inspiracion</Link>
        <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
        <span className="text-gray-900 font-medium">Informe</span>
      </div>

      <InspiracionClient
        sessionId={String(session.id)}
        clientId={String(session.client_id)}
        clienteNombre={clienteInfo?.nombre ?? 'Cliente'}
        clienteSector={clienteInfo?.sector ?? null}
        status={String(session.status)}
        resultado={(session.resultado ?? {}) as Record<string, unknown>}
        oportunidadesMarcadas={(session.oportunidades_marcadas ?? []) as string[]}
        createdAt={String(session.created_at)}
      />
    </div>
  )
}
