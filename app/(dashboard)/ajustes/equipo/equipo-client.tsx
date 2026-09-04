'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  Users, UserPlus, X, Loader2, AlertCircle, CheckCircle2,
  Shield, ChevronRight, Pencil, Mail, Clock, Ban, UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ROL_COLORS, ROL_LABELS } from '@/lib/permissions'
import { usePermissions } from '@/hooks/usePermissions'
import { PermisosEditor } from '@/components/team/PermisosEditor'
import type { ClienteItem } from '@/components/team/PermisosEditor'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Miembro {
  user_id   : string
  role      : string
  activo    : boolean
  email     : string | null
  nombre    : string | null
  avatar_url: string | null
  created_at: string
}

interface Invitacion {
  id        : string
  email     : string
  role      : string
  created_at: string
  status    : string
}

interface PermOverride {
  permission: string
  granted   : boolean
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROLES = ['admin', 'seo', 'redactor', 'consultor'] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Avatar({ nombre, avatar_url }: { nombre: string | null; avatar_url: string | null }) {
  if (avatar_url) {
    return <img src={avatar_url} alt={nombre ?? ''} className="h-8 w-8 rounded-full object-cover" />
  }
  const initials = (nombre ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
      {initials}
    </div>
  )
}

function RolBadge({ role }: { role: string }) {
  return (
    <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5', ROL_COLORS[role] ?? 'bg-gray-100 text-gray-600')}>
      {ROL_LABELS[role] ?? role}
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function EquipoClient({ todosClientes }: { todosClientes: ClienteItem[] }) {
  const { invalidate } = usePermissions()
  const { user: currentUser } = useUser()

  // Datos
  const [miembros,     setMiembros]     = useState<Miembro[]>([])
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [cargando,     setCargando]     = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  // Modal invitar
  const [modalInvitar, setModalInvitar] = useState(false)
  const [invEmail,     setInvEmail]     = useState('')
  const [invRol,       setInvRol]       = useState<string>('redactor')
  const [invMensaje,   setInvMensaje]   = useState('')
  const [invOverrides, setInvOverrides] = useState<Record<string, boolean>>({})
  const [invClientIds, setInvClientIds] = useState<string[]>([])
  const [invitando,    setInvitando]    = useState(false)
  const [invError,     setInvError]     = useState<string | null>(null)
  const [invOk,        setInvOk]        = useState<string | null>(null)

  // Drawer editar permisos
  const [drawerMiembro,   setDrawerMiembro]   = useState<Miembro | null>(null)
  const [drawerOverrides, setDrawerOverrides] = useState<Record<string, boolean>>({})
  const [drawerRol,       setDrawerRol]       = useState('')
  const [guardandoDrawer, setGuardandoDrawer] = useState(false)
  const [drawerError,     setDrawerError]     = useState<string | null>(null)

  // Clientes asignados en el drawer
  const [drawerClientIds,  setDrawerClientIds]  = useState<string[]>([])
  const [cargandoClientes, setCargandoClientes] = useState(false)

  // Desactivación
  const [desactivando, setDesactivando] = useState<string | null>(null)

  // ── Cargar datos ────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [resMiembros, resInv] = await Promise.all([
        fetch('/api/team/members'),
        fetch('/api/team/invitations'),
      ])
      const dataMiembros     = await resMiembros.json()
      const dataInvitaciones = await resInv.json()
      if (!resMiembros.ok) throw new Error(dataMiembros.error ?? 'Error cargando miembros')
      setMiembros(dataMiembros.members ?? [])
      setInvitaciones(dataInvitaciones.invitations ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando datos')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // ── Invitar miembro ─────────────────────────────────────────────────────
  async function handleInvitar(e: React.FormEvent) {
    e.preventDefault()
    setInvitando(true)
    setInvError(null)
    setInvOk(null)
    try {
      const res  = await fetch('/api/team/invite', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          email             : invEmail,
          role              : invRol,
          message           : invMensaje,
          permissions_preset: invOverrides,
          client_ids_preset : invClientIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error enviando invitación')
      setInvOk(`Invitación enviada a ${invEmail}`)
      setInvEmail(''); setInvRol('redactor'); setInvMensaje('')
      setInvOverrides({}); setInvClientIds([])
      cargar()
    } catch (e) {
      setInvError(e instanceof Error ? e.message : 'Error')
    } finally {
      setInvitando(false)
    }
  }

  // ── Cancelar invitación ─────────────────────────────────────────────────
  async function cancelarInvitacion(id: string) {
    if (!confirm('¿Cancelar esta invitación?')) return
    await fetch(`/api/team/invitations?id=${id}`, { method: 'DELETE' })
    cargar()
  }

  // ── Abrir drawer de permisos ────────────────────────────────────────────
  async function abrirDrawer(miembro: Miembro) {
    setDrawerMiembro(miembro)
    setDrawerRol(miembro.role)
    setDrawerError(null)
    setDrawerClientIds([])
    setCargandoClientes(true)

    const [resPerms, resClientes] = await Promise.all([
      fetch(`/api/team/members?userId=${miembro.user_id}`),
      fetch(`/api/team/client-assignments?userId=${miembro.user_id}`),
    ])

    const dataPerms    = await resPerms.json()
    const dataClientes = await resClientes.json()

    const overrides: Record<string, boolean> = {}
    for (const p of (dataPerms.permissions ?? []) as PermOverride[]) {
      overrides[p.permission] = p.granted
    }
    setDrawerOverrides(overrides)
    setDrawerClientIds(dataClientes.clientIds ?? [])
    setCargandoClientes(false)
  }

  // ── Guardar cambios drawer ──────────────────────────────────────────────
  async function guardarDrawer() {
    if (!drawerMiembro) return
    setGuardandoDrawer(true)
    setDrawerError(null)
    try {
      const [resPerms, resClientes] = await Promise.all([
        fetch('/api/team/update-member', {
          method : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({
            userId     : drawerMiembro.user_id,
            role       : drawerRol,
            permissions: drawerOverrides,
          }),
        }),
        drawerRol !== 'admin'
          ? fetch('/api/team/client-assignments', {
              method : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body   : JSON.stringify({
                userId   : drawerMiembro.user_id,
                clientIds: drawerClientIds,
              }),
            })
          : Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
      ])

      if (!resPerms.ok) {
        const d = await resPerms.json()
        throw new Error(d.error ?? 'Error guardando permisos')
      }
      if (!resClientes.ok) {
        const d = await resClientes.json()
        throw new Error(d.error ?? 'Error guardando clientes')
      }

      setDrawerMiembro(null)
      invalidate()
      cargar()
    } catch (e) {
      setDrawerError(e instanceof Error ? e.message : 'Error')
    } finally {
      setGuardandoDrawer(false)
    }
  }

  // ── Desactivar / reactivar miembro ─────────────────────────────────────
  async function cambiarActivo(miembro: Miembro, activo: boolean) {
    setDesactivando(miembro.user_id)
    try {
      const res  = await fetch('/api/team/update-member', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ userId: miembro.user_id, role: miembro.role, permissions: {}, activo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setDrawerMiembro(null)
      cargar()
    } catch (e) {
      setDrawerError(e instanceof Error ? e.message : 'Error')
    } finally {
      setDesactivando(null)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-indigo-600 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Equipo</h1>
            <p className="text-sm text-gray-500">Gestiona los miembros y sus permisos</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => { setModalInvitar(true); setInvOk(null); setInvError(null) }}
          className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
        >
          <UserPlus className="h-4 w-4" />
          Invitar miembro
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Cargando */}
      {cargando ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando equipo…</span>
        </div>
      ) : (
        <>
          {/* ── Miembros (activos e inactivos) ─────────────────── */}
          {(() => {
            const activos   = miembros.filter(m => m.activo === true)
            const inactivos = miembros.filter(m => m.activo === false)

            const FilaMiembro = ({ m }: { m: Miembro }) => (
              <tr key={m.user_id} className="hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar nombre={m.nombre} avatar_url={m.avatar_url} />
                    <span className="text-xs font-medium text-gray-900">{m.nombre ?? m.email ?? m.user_id}</span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className="text-xs text-gray-500">{m.email ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <RolBadge role={m.role} />
                </td>
                <td className="px-4 py-3 text-center">
                  {m.activo === true
                    ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">Activo</span>
                    : <span className="text-[10px] font-bold bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Inactivo</span>
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  {m.activo === true ? (
                    <button
                      type="button"
                      onClick={() => abrirDrawer(m)}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      <Pencil className="h-3 w-3" />
                      Permisos
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => cambiarActivo(m, true)}
                      disabled={desactivando === m.user_id}
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium disabled:opacity-50"
                    >
                      {desactivando === m.user_id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <UserCheck className="h-3 w-3" />
                      }
                      Reactivar
                    </button>
                  )}
                </td>
              </tr>
            )

            const Cabecera = () => (
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Miembro</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">Email</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Rol</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Estado</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Acciones</th>
              </tr>
            )

            return (
              <>
                <div>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Miembros activos ({activos.length})
                  </h2>
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    {activos.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Sin miembros activos</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead><Cabecera /></thead>
                        <tbody className="divide-y divide-gray-50">
                          {activos.map(m => <FilaMiembro key={m.user_id} m={m} />)}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {inactivos.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      Miembros inactivos ({inactivos.length})
                    </h2>
                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><Cabecera /></thead>
                        <tbody className="divide-y divide-gray-50">
                          {inactivos.map(m => <FilaMiembro key={m.user_id} m={m} />)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* ── Invitaciones pendientes ────────────────────────── */}
          {invitaciones.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Invitaciones pendientes ({invitaciones.length})
              </h2>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Email</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Rol</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 hidden sm:table-cell">Enviada</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invitaciones.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-xs text-gray-700">{inv.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <RolBadge role={inv.role} />
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
                            <Clock className="h-3 w-3" />
                            {new Date(inv.created_at).toLocaleDateString('es-ES')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => cancelarInvitacion(inv.id)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                          >
                            <Ban className="h-3 w-3" />
                            Cancelar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal invitar ─────────────────────────────────────── */}
      {modalInvitar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setModalInvitar(false) }}
        >
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-indigo-600" />
                <h2 className="text-base font-bold text-gray-900">Invitar miembro</h2>
              </div>
              <button type="button" onClick={() => setModalInvitar(false)}>
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleInvitar} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 p-6 space-y-5">
                {invError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />{invError}
                  </div>
                )}
                {invOk && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />{invOk}
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email *</label>
                  <input
                    required
                    type="email"
                    placeholder="nombre@empresa.com"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  />
                </div>

                {/* Rol */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Rol</label>
                  <select
                    value={invRol}
                    onChange={(e) => {
                      const newRol = e.target.value
                      setInvRol(newRol)
                      setInvOverrides({})
                      if (newRol === 'admin') setInvClientIds([])
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>{ROL_LABELS[r]}</option>
                    ))}
                  </select>
                </div>

                {/* Permisos preconfigurados */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Permisos iniciales
                  </p>
                  <p className="text-[11px] text-gray-400 mb-4">
                    Parten del rol seleccionado. Ajusta antes de invitar — se aplicarán en cuanto la persona acepte.
                  </p>
                  <PermisosEditor
                    rol={invRol}
                    overrides={invOverrides}
                    clientIds={invClientIds}
                    todosClientes={todosClientes}
                    onOverridesChange={setInvOverrides}
                    onClientIdsChange={setInvClientIds}
                  />
                </div>

                {/* Mensaje opcional */}
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mensaje personalizado (opcional)</label>
                  <textarea
                    rows={2}
                    placeholder="Te invito a unirte a ContentCopilot…"
                    value={invMensaje}
                    onChange={(e) => setInvMensaje(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* Footer fijo */}
              <div className="shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setModalInvitar(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={invitando} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                  {invitando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Enviar invitación
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Drawer editar permisos ────────────────────────────── */}
      {drawerMiembro && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => { if (!guardandoDrawer) setDrawerMiembro(null) }}
          />
          <div className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Editar permisos</h3>
                  <p className="text-xs text-gray-400">{drawerMiembro.nombre ?? drawerMiembro.email}</p>
                </div>
              </div>
              <button type="button" onClick={() => setDrawerMiembro(null)}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* Rol base */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Rol base</p>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setDrawerRol(r)}
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm font-medium border transition-all text-left',
                        drawerRol === r
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >
                      <span className={cn('inline-block w-2 h-2 rounded-full mr-2', ROL_COLORS[r].split(' ')[0])} />
                      {ROL_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Módulos, acciones y clientes — componente compartido */}
              <PermisosEditor
                rol={drawerRol}
                overrides={drawerOverrides}
                clientIds={drawerClientIds}
                todosClientes={todosClientes}
                cargandoClientes={cargandoClientes}
                onOverridesChange={setDrawerOverrides}
                onClientIdsChange={setDrawerClientIds}
              />

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 space-y-2">
              {drawerError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />{drawerError}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setDrawerMiembro(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={guardarDrawer}
                  disabled={guardandoDrawer}
                  className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700"
                >
                  {guardandoDrawer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Guardar cambios
                </Button>
              </div>
              {/* Desactivar — solo si no es el propio usuario */}
              {drawerMiembro.user_id !== currentUser?.id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                  disabled={desactivando === drawerMiembro.user_id || guardandoDrawer}
                  onClick={() => {
                    if (!confirm(`¿Desactivar a ${drawerMiembro.nombre ?? drawerMiembro.email}? No podrá acceder a la plataforma hasta que se reactive.`)) return
                    cambiarActivo(drawerMiembro, false)
                  }}
                >
                  {desactivando === drawerMiembro.user_id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Ban className="h-3.5 w-3.5" />
                  }
                  Desactivar miembro
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
