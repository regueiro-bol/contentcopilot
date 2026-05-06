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
  TrendingUp,
  Radio,
  Lightbulb,
  Settings,
  Archive,
  CalendarDays,
  Share2,
  Palette,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { usePermissions } from '@/hooks/usePermissions'
import { type Permission } from '@/lib/permissions'

// ── Definición de entradas del sidebar con permiso requerido ──────────────────

interface NavItem {
  titulo     : string
  href       : string
  icono      : React.ElementType
  permission : Permission
  showBadge             ?: boolean
  showPendientesBadge   ?: boolean
}

const navItems: NavItem[] = [
  { titulo: 'Dashboard',          href: '/dashboard',                 icono: LayoutDashboard, permission: 'module:dashboard'        },
  { titulo: 'Clientes',           href: '/clientes',                  icono: Users,           permission: 'module:clientes'         },
  { titulo: 'Inspiracion',        href: '/inspiracion',               icono: Lightbulb,       permission: 'module:inspiracion'      },
  { titulo: 'Estrategia',         href: '/strategy',                  icono: TrendingUp,      permission: 'module:estrategia'       },
  { titulo: 'Banco de Contenidos',href: '/strategy/almacen',          icono: Archive,         permission: 'module:banco_contenidos' },
  { titulo: 'Calendario',         href: '/strategy/calendario',       icono: CalendarDays,    permission: 'module:calendario'       },
  { titulo: 'Social Media',       href: '/social',                    icono: Share2,          permission: 'module:social_media'     },
  { titulo: 'Panel de Diseño',    href: '/design',                    icono: Palette,         permission: 'module:panel_diseno'     },
  { titulo: 'Pedidos',            href: '/pedidos',                   icono: ClipboardList,   permission: 'module:pedidos',         showPendientesBadge: true },
  { titulo: 'Contenidos',         href: '/contenidos',                icono: FileText,        permission: 'module:contenidos'       },
  { titulo: 'GEORadar',           href: '/georadar',                  icono: Radio,           permission: 'module:georadar'         },
  { titulo: 'Copiloto',           href: '/copiloto',                  icono: Sparkles,        permission: 'module:copiloto'         },
  { titulo: 'Costes',             href: '/costes',                    icono: Calculator,      permission: 'module:costes'           },
  { titulo: 'Agentes',            href: '/agentes',                   icono: Cpu,             permission: 'module:agentes'          },
  { titulo: 'Ajustes',            href: '/ajustes/equipo',            icono: Settings,        permission: 'module:ajustes'          },
]

// ── Skeleton de carga ─────────────────────────────────────────────────────────

function NavSkeleton({ colapsado }: { colapsado: boolean }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-lg bg-gray-100 animate-pulse',
            colapsado ? 'h-9 w-9 mx-auto' : 'h-9 w-full',
          )}
        />
      ))}
    </div>
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  colapsado          : boolean
  onToggle           : () => void
  urgentes           ?: number
  pedidosPendientes  ?: number
}

export function Sidebar({ colapsado, onToggle, urgentes = 0, pedidosPendientes = 0 }: SidebarProps) {
  const pathname = usePathname()
  const { can, loading } = usePermissions()

  // Filtrar items según permisos
  const itemsVisibles = loading ? [] : navItems.filter((item) => can(item.permission))

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-gray-200 bg-white transition-all duration-300',
        colapsado ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4">
        <div className={cn('flex items-center gap-2 overflow-hidden', colapsado && 'hidden')}>
          <Bot className="h-7 w-7 shrink-0 text-indigo-600" />
          <span className="text-lg font-bold text-gray-900">ContentCopilot</span>
        </div>
        {colapsado && <Bot className="mx-auto h-7 w-7 text-indigo-600" />}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn('ml-auto h-8 w-8 shrink-0', colapsado && 'mx-auto')}
          aria-label={colapsado ? 'Expandir menú' : 'Colapsar menú'}
        >
          {colapsado ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <Separator />

      {/* Navegación */}
      <nav className="flex-1 space-y-1 p-3">
        {loading ? (
          <NavSkeleton colapsado={colapsado} />
        ) : (
          itemsVisibles.map((item) => {
            const estaActivo          = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icono               = item.icono
            const mostrarBadge        = item.showBadge && urgentes > 0
            const mostrarPendientes   = item.showPendientesBadge && pedidosPendientes > 0
            const badgeCount          = mostrarPendientes ? pedidosPendientes : urgentes
            const mostrarAlgunBadge   = mostrarBadge || mostrarPendientes

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  estaActivo
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  colapsado && 'justify-center px-2',
                )}
                title={colapsado ? item.titulo : undefined}
              >
                <div className="relative shrink-0">
                  <Icono className={cn('h-5 w-5', estaActivo ? 'text-indigo-600' : 'text-gray-400')} />
                  {mostrarAlgunBadge && colapsado && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  )}
                </div>
                {!colapsado && <span className="flex-1">{item.titulo}</span>}
                {mostrarAlgunBadge && !colapsado && (
                  <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            )
          })
        )}
      </nav>

      <Separator />

      <div className={cn('p-4 text-xs text-gray-400', colapsado && 'hidden')}>
        <p>ContentCopilot v1.0</p>
        <p>Potenciado por Claude AI</p>
      </div>
    </aside>
  )
}
