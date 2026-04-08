import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export default async function ClienteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const supabase = createAdminClient()

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('id', params.id)
    .single()

  if (error || !cliente) notFound()

  return (
    <div className="max-w-5xl space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/clientes" className="hover:text-indigo-600 transition-colors">
          Clientes
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-gray-900 font-medium">{cliente.nombre}</span>
      </div>
      {children}
    </div>
  )
}
