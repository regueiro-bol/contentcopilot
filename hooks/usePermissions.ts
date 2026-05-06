'use client'

import { useEffect, useState, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { type Permission, roleHasPermission } from '@/lib/permissions'

interface UserPermissionsData {
  role       : string
  permissions: Record<string, boolean>   // overrides granulares
}

// ── Caché a nivel módulo para evitar re-fetches innecesarios ──────────────────
const cache = new Map<string, UserPermissionsData>()

export function usePermissions() {
  const { user, isLoaded } = useUser()
  const [data, setData]       = useState<UserPermissionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const fetchedRef            = useRef(false)

  useEffect(() => {
    if (!isLoaded) return
    if (!user) { setLoading(false); return }

    const userId = user.id

    // Usar caché si existe
    if (cache.has(userId)) {
      setData(cache.get(userId)!)
      setLoading(false)
      return
    }

    // Evitar doble-fetch en StrictMode
    if (fetchedRef.current) return
    fetchedRef.current = true

    fetch('/api/auth/my-permissions')
      .then((r) => r.json())
      .then((d: UserPermissionsData) => {
        cache.set(userId, d)
        setData(d)
      })
      .catch(() => {
        // fallback: rol redactor sin overrides
        const fallback: UserPermissionsData = { role: 'redactor', permissions: {} }
        setData(fallback)
      })
      .finally(() => setLoading(false))
  }, [isLoaded, user?.id])   // eslint-disable-line react-hooks/exhaustive-deps

  /** Verifica si el usuario tiene un permiso (override > rol base) */
  function can(permission: Permission): boolean {
    if (!data) return false
    if (permission in data.permissions) return data.permissions[permission]
    return roleHasPermission(data.role, permission)
  }

  /** Fuerza refetch invalidando la caché del usuario actual */
  function invalidate() {
    if (user?.id) {
      cache.delete(user.id)
      fetchedRef.current = false
      setLoading(true)
      setData(null)
    }
  }

  return { can, role: data?.role ?? null, loading, invalidate }
}
