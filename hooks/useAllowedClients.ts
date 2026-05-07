'use client'

import { useEffect, useState, useRef } from 'react'
import { useUser } from '@clerk/nextjs'

interface AllowedClientsData {
  clientIds           : string[] | null  // null = admin, ve todos
  restrictedToClients : boolean
}

// ── Caché a nivel módulo ──────────────────────────────────────────────────────
const cache = new Map<string, AllowedClientsData>()

export function useAllowedClients() {
  const { user, isLoaded }    = useUser()
  const [data, setData]       = useState<AllowedClientsData>({ clientIds: null, restrictedToClients: false })
  const [loading, setLoading] = useState(true)
  const fetchedRef            = useRef(false)

  useEffect(() => {
    if (!isLoaded) return
    if (!user) { setLoading(false); return }

    const userId = user.id

    if (cache.has(userId)) {
      setData(cache.get(userId)!)
      setLoading(false)
      return
    }

    if (fetchedRef.current) return
    fetchedRef.current = true

    fetch('/api/auth/my-clients')
      .then((r) => r.json())
      .then((d: AllowedClientsData) => {
        cache.set(userId, d)
        setData(d)
      })
      .catch(() => {
        // Fallback seguro: sin restricción (el servidor filtra de todas formas)
        const fallback: AllowedClientsData = { clientIds: null, restrictedToClients: false }
        setData(fallback)
      })
      .finally(() => setLoading(false))
  }, [isLoaded, user?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  /** Indica si el usuario puede ver un cliente concreto */
  function canAccessClient(clientId: string): boolean {
    if (!data.restrictedToClients) return true
    return data.clientIds?.includes(clientId) ?? false
  }

  /** Invalida la caché (llamar tras guardar asignaciones) */
  function invalidate() {
    if (user?.id) {
      cache.delete(user.id)
      fetchedRef.current = false
      setLoading(true)
      setData({ clientIds: null, restrictedToClients: false })
    }
  }

  return {
    clientIds           : data.clientIds,
    restrictedToClients : data.restrictedToClients,
    canAccessClient,
    loading,
    invalidate,
  }
}
