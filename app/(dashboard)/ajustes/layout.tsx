'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Link2, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/ajustes/equipo',      label: 'Equipo',      icon: Users  },
  { href: '/ajustes/conexiones',  label: 'Conexiones',  icon: Link2  },
]

export default function AjustesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-5 max-w-4xl">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-indigo-600 shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ajustes</h1>
          <p className="text-sm text-gray-500">Equipo y conexiones externas</p>
        </div>
      </div>

      {/* ── Subnav tabs ───────────────────────────────────── */}
      <nav className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ href, label, icon: Icon }) => {
          const activo = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                activo
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* ── Contenido de la pestaña ───────────────────────── */}
      <div>{children}</div>

    </div>
  )
}
