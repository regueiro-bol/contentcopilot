'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FileText,
  Bot,
  Cpu,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ClipboardList,
  Calculator,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

// Elementos de navegación del sidebar
const navItems = [
  {
    titulo: 'Dashboard',
    href: '/dashboard',
    icono: LayoutDashboard,
    showBadge: true,  // muestra el badge de urgentes
  },
  {
    titulo: 'Clientes',
    href: '/clientes',
    icono: Users,
  },
  {
    titulo: 'Pedidos',
    href: '/pedidos',
    icono: ClipboardList,
    showPendientesBadge: true,
  },
  {
    titulo: 'Contenidos',
    href: '/proyectos',   // URL se mantiene para no romper rutas existentes
    icono: FileText,
  },
  {
    titulo: 'Copiloto',
    href: '/copiloto',
    icono: Sparkles,
  },
  {
    titulo: 'Agentes',
    href: '/agentes',
    icono: Cpu,
  },
  {
    titulo: 'Costes',
    href: '/costes',
    icono: Calculator,
  },
]

interface SidebarProps {
  colapsado: boolean
  onToggle: () => void
  urgentes?: number
  pedidosPendientes?: number
}

export function Sidebar({ colapsado, onToggle, urgentes = 0, pedidosPendientes = 0 }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-gray-200 bg-white transition-all duration-300',
        colapsado ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo y nombre de la app */}
      <div className="flex h-16 items-center justify-between px-4">
        <div className={cn('flex items-center gap-2 overflow-hidden', colapsado && 'hidden')}>
          <Bot className="h-7 w-7 shrink-0 text-indigo-600" />
          <span className="text-lg font-bold text-gray-900">ContentCopilot</span>
        </div>
        {colapsado && <Bot className="mx-auto h-7 w-7 text-indigo-600" />}

        {/* Botón para colapsar/expandir */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn('ml-auto h-8 w-8 shrink-0', colapsado && 'mx-auto')}
          aria-label={colapsado ? 'Expandir menú' : 'Colapsar menú'}
        >
          {colapsado ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator />

      {/* Navegación principal */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const estaActivo = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icono = item.icono
          const mostrarBadge = item.showBadge && urgentes > 0
          const mostrarPendientesBadge = item.showPendientesBadge && pedidosPendientes > 0
          const badgeCount = mostrarPendientesBadge ? pedidosPendientes : urgentes
          const mostrarAlgunBadge = mostrarBadge || mostrarPendientesBadge

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                estaActivo
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                colapsado && 'justify-center px-2'
              )}
              title={colapsado ? item.titulo : undefined}
            >
              <div className="relative shrink-0">
                <Icono
                  className={cn(
                    'h-5 w-5',
                    estaActivo ? 'text-indigo-600' : 'text-gray-400'
                  )}
                />
                {/* Badge (solo cuando colapsado) */}
                {mostrarAlgunBadge && colapsado && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </div>
              {!colapsado && (
                <span className="flex-1">{item.titulo}</span>
              )}
              {/* Badge (cuando expandido) */}
              {mostrarAlgunBadge && !colapsado && (
                <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <Separator />

      {/* Pie del sidebar */}
      <div className={cn('p-4 text-xs text-gray-400', colapsado && 'hidden')}>
        <p>ContentCopilot v1.0</p>
        <p>Potenciado por Claude AI</p>
      </div>
    </aside>
  )
}
