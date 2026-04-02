'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, CheckCircle2, XCircle, Clock, Image, LayoutGrid, BarChart2 } from 'lucide-react'
import type { GenerationStatus } from '@/types/brand-assets'

// ─────────────────────────────────────────────────────────────────────────────
// Badge inline de estado (pequeño, para la nav)
// ─────────────────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: GenerationStatus }) {
  if (status === 'ready') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
  }
  if (status === 'pending') {
    return <Clock className="h-3.5 w-3.5 text-amber-500" />
  }
  return <XCircle className="h-3.5 w-3.5 text-red-400" />
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-navegación del cliente
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string
  clientNombre: string
  generationStatus: GenerationStatus | null
}

export default function ClienteSubNav({ clientId, clientNombre, generationStatus }: Props) {
  const pathname = usePathname()
  const base = `/clientes/${clientId}`
  const isBrandAssets       = pathname.startsWith(`${base}/brand-assets`)
  const isAdCreatives       = pathname.startsWith(`${base}/ad-creatives`)
  const isCompetencia       = pathname.startsWith(`${base}/competitive-intelligence`)
  const isFicha             = !isBrandAssets && !isAdCreatives && !isCompetencia

  const navItems = [
    { label: 'Ficha',        href: base,                    active: isFicha,       icon: null },
    {
      label: 'Brand Assets',
      href:  `${base}/brand-assets`,
      active: isBrandAssets,
      icon: generationStatus ? <StatusDot status={generationStatus} /> : <Image className="h-3.5 w-3.5 text-gray-400" />,
    },
    {
      label: 'Ad Creatives',
      href:  `${base}/ad-creatives`,
      active: isAdCreatives,
      icon: <LayoutGrid className="h-3.5 w-3.5 text-gray-400" />,
    },
    {
      label: 'Competencia',
      href:  `${base}/competitive-intelligence`,
      active: isCompetencia,
      icon: <BarChart2 className="h-3.5 w-3.5 text-gray-400" />,
    },
  ]

  return (
    <div className="mb-6 space-y-3">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/clientes" className="hover:text-indigo-600 transition-colors">
          Clientes
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
        <span className="text-gray-900 font-medium truncate max-w-xs">{clientNombre}</span>
      </nav>

      {/* Sub-navegación */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
              ${
                item.active
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
