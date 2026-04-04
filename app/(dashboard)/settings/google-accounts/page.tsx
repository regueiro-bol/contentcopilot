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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface GoogleAccount {
  id                : string
  email             : string
  display_name      : string | null
  scopes            : string[] | null
  created_at        : string
  updated_at        : string
  active_connections: number
}

const MAX_ACCOUNTS = 3

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────

export default function GoogleAccountsPage() {
  return (
    <Suspense fallback={null}>
      <GoogleAccountsContent />
    </Suspense>
  )
}

function GoogleAccountsContent() {
  const searchParams = useSearchParams()

  const [accounts, setAccounts]   = useState<GoogleAccount[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [deleting, setDeleting]   = useState<string | null>(null)

  const connected   = searchParams.get('connected') === 'true'
  const errorParam  = searchParams.get('error')

  // ── Cargar cuentas ─────────────────────────────────────────
  useEffect(() => {
    loadAccounts()
  }, [])

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

  // ── Desconectar cuenta ─────────────────────────────────────
  async function handleDisconnect(accountId: string) {
    if (!confirm('¿Desconectar esta cuenta Google? Se eliminarán todas las conexiones de clientes asociadas.')) {
      return
    }

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

  // ── Conectar nueva cuenta ──────────────────────────────────
  function handleConnect() {
    window.location.href = '/api/auth/google'
  }

  // ── Formatear fecha ────────────────────────────────────────
  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-ES', {
      day  : 'numeric',
      month: 'short',
      year : 'numeric',
    })
  }

  // ── Mensajes de error de OAuth ─────────────────────────────
  const errorMessages: Record<string, string> = {
    cancelled   : 'Conexión cancelada por el usuario.',
    no_code     : 'No se recibió el código de autorización.',
    no_email    : 'No se pudo obtener el email de la cuenta Google.',
    max_accounts: `Ya tienes ${MAX_ACCOUNTS} cuentas conectadas. Desconecta una para añadir otra.`,
    db_error    : 'Error guardando la cuenta. Inténtalo de nuevo.',
    unexpected  : 'Error inesperado. Inténtalo de nuevo.',
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Cuentas Google de agencia</h1>
        <p className="text-sm text-gray-500 mt-1">
          Conecta hasta {MAX_ACCOUNTS} cuentas Google para acceder a Search Console y Analytics de tus clientes.
        </p>
      </div>

      {/* Banner éxito */}
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
        <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando cuentas...
        </div>
      )}

      {/* Lista de cuentas */}
      {!loading && accounts.length > 0 && (
        <div className="space-y-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 shrink-0">
                      <Mail className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {account.email}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
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
              </CardContent>
            </Card>
          ))}
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
          Has alcanzado el máximo de {MAX_ACCOUNTS} cuentas. Desconecta una para añadir otra.
        </p>
      )}
    </div>
  )
}
