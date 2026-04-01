'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

const titulosPagina: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/clientes': 'Clientes',
  '/pedidos': 'Pedidos de contenido',
  '/proyectos': 'Contenidos',
  '/copiloto': 'Copiloto de contenido',
  '/agentes': 'Agentes de IA',
}

export function DashboardShell({
  children,
  urgentes = 0,
  pedidosPendientes = 0,
}: {
  children: React.ReactNode
  urgentes?: number
  pedidosPendientes?: number
}) {
  const [sidebarColapsado, setSidebarColapsado] = useState(false)
  const pathname = usePathname()

  const tituloPagina =
    Object.entries(titulosPagina).find(
      ([ruta]) => pathname === ruta || pathname.startsWith(`${ruta}/`)
    )?.[1] ?? 'ContentCopilot'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        colapsado={sidebarColapsado}
        onToggle={() => setSidebarColapsado(!sidebarColapsado)}
        urgentes={urgentes}
        pedidosPendientes={pedidosPendientes}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header titulo={tituloPagina} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
