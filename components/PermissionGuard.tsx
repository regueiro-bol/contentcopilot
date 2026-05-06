'use client'

import { Lock, Loader2 } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { type Permission } from '@/lib/permissions'

interface Props {
  permission: Permission
  children  : React.ReactNode
  fallback  ?: React.ReactNode
}

/**
 * Muestra `children` solo si el usuario tiene el permiso indicado.
 * Mientras se carga, muestra un spinner centrado.
 * Si no tiene permiso, muestra un bloque bloqueado (o el `fallback` opcional).
 */
export function PermissionGuard({ permission, children, fallback }: Props) {
  const { can, loading } = usePermissions()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
      </div>
    )
  }

  if (!can(permission)) {
    return (
      <>
        {fallback ?? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Lock className="w-12 h-12 text-gray-200" />
            <p className="text-gray-400 text-sm font-medium">
              No tienes acceso a esta sección
            </p>
          </div>
        )}
      </>
    )
  }

  return <>{children}</>
}
