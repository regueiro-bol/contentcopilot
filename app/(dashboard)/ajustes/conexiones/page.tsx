'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Link2,
  MapPin,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PermissionGuard } from '@/components/PermissionGuard'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface GoogleAccount {
  id                : string
  email             : string
  display_name      : string | null
  scopes            : string[] | null
  created_at        : string
  updated_at        : string
  active_connections: number
}

interface GmbLocation {
  locationId  : string
  title       : string
  address     : string | null
  accountName : string
  name        : string
}

const MAX_ACCOUNTS = 3

// ─── Wrapper con Suspense (useSearchParams necesita Suspense boundary) ────────

export default function ConexionesPage() {
  return (
    <PermissionGuard permission="module:ajustes">
      <Suspense fallback={null}>
        <ConexionesContent />
      </Suspense>
    </PermissionGuard>
  )
}

// ─── Selector GMB por cuenta ──────────────────────────────────────────────────

function GmbSelector({ accountId }: { accountId: string }) {
  const [locations, setLocations] = useState<GmbLocation[] | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [open,      setOpen]      = useState(false)

  async function loadLocations() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/google/gmb/accounts?accountId=${accountId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setLocations(data.locations ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  function handleOpen() {
    setOpen(true)
    if (!locations) loadLocations()
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="text-xs gap-1" onClick={handleOpen}>
        <MapPin className="h-3 w-3" /> Seleccionar negocio GMB
      </Button>
    )
  }

  return (
    <div className="space-y-2">
      {loading && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando negocios…
        </div>
      )}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
      {locations && locations.length === 0 && (
        <p className="text-xs text-gray-400">Sin negocios GMB disponibles para esta cuenta.</p>
      )}
      {locations && locations.length > 0 && (
        <div className="space-y-1">
          {locations.map((loc) => (
            <div key={loc.locationId} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg text-xs">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 truncate">{loc.title}</p>
                {loc.address && <p className="text-gray-400 truncate">{loc.address}</p>}
                <p className="text-gray-400">{loc.accountName}</p>
              </div>
              <span className="text-gray-400 text-[10px] shrink-0">ID: {loc.locationId.slice(0, 8)}…</span>
            </div>
          ))}
          <p className="text-xs text-gray-400 pt-1">
            Para asignar un negocio a un cliente específico, ve a la ficha del cliente → Conexiones.
          </p>
        </div>
      )}
      <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => setOpen(false)}>
        Cerrar
      </Button>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

function ConexionesContent() {
  const searchParams = useSearchParams()

  const [accounts, setAccounts] = useState<GoogleAccount[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const connected  = searchParams.get('connected') === 'true'
  const errorParam = searchParams.get('error')

  // ── Cargar cuentas ───────────────────────────────────────
  useEffect(() => { loadAccounts() }, [])

  async function loadAccounts() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/google/accounts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error cargando cuentas')
      setAccounts(data.accounts ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  // ── Desconectar cuenta ────────────────────────────────────
  async function handleDisconnect(accountId: string) {
    if (!confirm('¿Desconectar esta cuenta Google? Se eliminarán todas las conexiones de clientes asociadas.')) return

    setDeleting(accountId)
    try {
      const res = await fetch('/api/google/accounts', {
        method : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ account_id: accountId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error desconectando')
      }
      setAccounts((prev) => prev.filter((a) => a.id !== accountId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setDeleting(null)
    }
  }

  // ── Conectar nueva cuenta ────────────────────────────────
  function handleConnect() { window.location.href = '/api/auth/google' }

  // ── Formatear fecha ───────────────────────────────────────
  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const errorMessages: Record<string, string> = {
    cancelled   : 'Conexión cancelada por el usuario.',
    no_code     : 'No se recibió el código de autorización.',
    no_email    : 'No se pudo obtener el email de la cuenta Google.',
    max_accounts: `Ya tienes ${MAX_ACCOUNTS} cuentas conectadas. Desconecta una para añadir otra.`,
    db_error    : 'Error guardando la cuenta. Inténtalo de nuevo.',
    unexpected  : 'Error inesperado. Inténtalo de nuevo.',
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">Cuentas Google de agencia</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Conecta hasta {MAX_ACCOUNTS} cuentas Google para acceder a Search Console y Analytics de tus clientes.
        </p>
      </div>

      {/* Banner éxito OAuth */}
      {connected && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Cuenta Google conectada correctamente.
        </div>
      )}

      {/* Banner error OAuth */}
      {errorParam && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessages[errorParam] ?? 'Error desconocido al conectar la cuenta.'}
        </div>
      )}

      {/* Error de carga */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando cuentas...
        </div>
      )}

      {/* Lista de cuentas */}
      {!loading && accounts.length > 0 && (
        <div className="space-y-3">
          {accounts.map((account) => {
            const hasGmbScope = account.scopes?.includes('business.manage')
            return (
              <Card key={account.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Fila principal: email + acciones */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 shrink-0">
                        <Mail className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{account.email}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {account.display_name && (
                            <span className="text-xs text-gray-500">{account.display_name}</span>
                          )}
                          <span className="text-xs text-gray-400">
                            Conectada el {formatDate(account.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {account.active_connections > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <Link2 className="h-3 w-3" />
                          {account.active_connections} cliente{account.active_connections !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(account.id)}
                        disabled={deleting === account.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        {deleting === account.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />
                        }
                      </Button>
                    </div>
                  </div>

                  {/* Sección GMB */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs font-semibold text-gray-600">Google My Business</span>
                    </div>
                    {hasGmbScope
                      ? <GmbSelector accountId={account.id} />
                      : (
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-gray-400">
                            Esta cuenta no tiene acceso a Google My Business.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1 shrink-0"
                            onClick={handleConnect}
                          >
                            <RefreshCw className="h-3 w-3" />
                            Reconectar con GMB
                          </Button>
                        </div>
                      )
                    }
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && accounts.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Mail className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">Sin cuentas conectadas</p>
            <p className="text-xs text-gray-400 mt-1">
              Conecta una cuenta Google para acceder a GSC y Analytics
            </p>
          </CardContent>
        </Card>
      )}

      {/* Botón conectar */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleConnect}
          disabled={accounts.length >= MAX_ACCOUNTS}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Conectar cuenta Google
        </Button>
        {accounts.length >= MAX_ACCOUNTS && (
          <p className="text-xs text-gray-400">
            Máximo de {MAX_ACCOUNTS} cuentas alcanzado. Desconecta una para añadir otra.
          </p>
        )}
      </div>

    </div>
  )
}
