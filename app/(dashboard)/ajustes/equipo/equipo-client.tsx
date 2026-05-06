'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users, UserPlus, X, Loader2, AlertCircle, CheckCircle2,
  Shield, ChevronRight, Pencil, Mail, Clock, Ban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PERMISSIONS, ROL_COLORS, ROL_LABELS, roleHasPermission, type Permission } from '@/lib/permissions'
import { usePermissions } from '@/hooks/usePermissions'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Miembro {
  user_id   : string
  role      : string
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

const PERMISO_LABELS: Record<string, string> = {
  'module:dashboard'         : 'Dashboard',
  'module:clientes'          : 'Clientes',
  'module:inspiracion'       : 'Inspiración',
  'module:estrategia'        : 'Estrategia',
  'module:banco_contenidos'  : 'Banco de Contenidos',
  'module:calendario'        : 'Calendario',
  'module:contenidos'        : 'Contenidos',
  'module:copiloto'          : 'Copiloto',
  'module:georadar'          : 'GEORadar',
  'module:social_media'      : 'Social Media',
  'module:panel_diseno'      : 'Panel de Diseño',
  'module:pedidos'           : 'Pedidos',
  'module:costes'            : 'Costes',
  'module:agentes'           : 'Agentes',
  'module:ajustes'           : 'Ajustes',
  'action:ver_coste_articulo': 'Ver coste por artículo',
  'action:aprobar_contenidos': 'Aprobar contenidos',
  'action:asignar_articulos' : 'Asignar artículos',
  'action:crear_clientes'    : 'Crear clientes',
  'action:ver_todos_clientes': 'Ver todos los clientes',
  'action:invitar_usuarios'  : 'Invitar usuarios',
  'action:gestionar_equipo'  : 'Gestionar equipo',
  'action:ver_todos_pedidos' : 'Ver todos los pedidos',
  'action:ver_todos_contenidos': 'Ver todos los contenidos',
}

const MODULOS_PERMS  = Object.keys(PERMISSIONS).filter(k => k.startsWith('module:'))
const ACCIONES_PERMS = Object.keys(PERMISSIONS).filter(k => k.startsWith('action:'))

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

export default function EquipoClient() {
  const { invalidate } = usePermissions()

  // Datos
  const [miembros,    setMiembros]    = useState<Miembro[]>([])
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [cargando,    setCargando]    = useState(true)
  const [error,       setError]       = useState<string | null>(null)

  // Modal invitar
  const [modalInvitar, setModalInvitar] = useState(false)
  const [invEmail,     setInvEmail]     = useState('')
  const [invRol,       setInvRol]       = useState<string>('redactor')
  const [invMensaje,   setInvMensaje]   = useState('')
  const [invitando,    setInvitando]    = useState(false)
  const [invError,     setInvError]     = useState<string | null>(null)
  const [invOk,        setInvOk]        = useState<string | null>(null)

  // Drawer editar permisos
  const [drawerMiembro, setDrawerMiembro] = useState<Miembro | null>(null)
  const [drawerOverrides, setDrawerOverrides] = useState<Record<string, boolean>>({})
  const [drawerRol,      setDrawerRol]        = useState('')
  const [guardandoDrawer, setGuardandoDrawer] = useState(false)
  const [drawerError,    setDrawerError]      = useState<string | null>(null)

  // ── Cargar datos ────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [resMiembros, resInv] = await Promise.all([
        fetch('/api/team/members'),
        fetch('/api/team/invitations'),
      ])
      const dataMiembros    = await resMiembros.json()
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
        body   : JSON.stringify({ email: invEmail, role: invRol, message: invMensaje }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error enviando invitación')
      setInvOk(`Invitación enviada a ${invEmail}`)
      setInvEmail(''); setInvRol('redactor'); setInvMensaje('')
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

    // Cargar overrides actuales
    const res  = await fetch(`/api/team/members?userId=${miembro.user_id}`)
    const data = await res.json()
    const overrides: Record<string, boolean> = {}
    for (const p of (data.permissions ?? []) as PermOverride[]) {
      overrides[p.permission] = p.granted
    }
    setDrawerOverrides(overrides)
  }

  // ── Guardar cambios drawer ──────────────────────────────────────────────
  async function guardarDrawer() {
    if (!drawerMiembro) return
    setGuardandoDrawer(true)
    setDrawerError(null)
    try {
      const res  = await fetch('/api/team/update-member', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          userId     : drawerMiembro.user_id,
          role       : drawerRol,
          permissions: drawerOverrides,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error guardando')
      setDrawerMiembro(null)
      invalidate()
      cargar()
    } catch (e) {
      setDrawerError(e instanceof Error ? e.message : 'Error')
    } finally {
      setGuardandoDrawer(false)
    }
  }

  // ── Toggle permiso en drawer ────────────────────────────────────────────
  function togglePermiso(perm: string) {
    const rolBase    = roleHasPermission(drawerRol, perm as Permission)
    const current    = perm in drawerOverrides ? drawerOverrides[perm] : rolBase
    const nuevoValor = !current

    if (nuevoValor === rolBase) {
      // Coincide con rol base → eliminar override
      setDrawerOverrides(prev => { const n = { ...prev }; delete n[perm]; return n })
    } else {
      setDrawerOverrides(prev => ({ ...prev, [perm]: nuevoValor }))
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
          {/* ── Miembros activos ───────────────────────────────── */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Miembros activos ({miembros.length})
            </h2>
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {miembros.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Sin miembros registrados</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Miembro</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">Email</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Rol</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Estado</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {miembros.map((m) => (
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
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">Activo</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => abrirDrawer(m)}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            <Pencil className="h-3 w-3" />
                            Permisos
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

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
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-indigo-600" />
                <h2 className="text-base font-bold text-gray-900">Invitar miembro</h2>
              </div>
              <button type="button" onClick={() => setModalInvitar(false)}>
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleInvitar} className="p-6 space-y-4">
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

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Rol</label>
                <select
                  value={invRol}
                  onChange={(e) => setInvRol(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{ROL_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mensaje personalizado (opcional)</label>
                <textarea
                  rows={3}
                  placeholder="Te invito a unirte a ContentCopilot…"
                  value={invMensaje}
                  onChange={(e) => setInvMensaje(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:border-indigo-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
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

              {/* Módulos */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Módulos</p>
                <div className="space-y-1">
                  {MODULOS_PERMS.map(perm => {
                    const rolBase    = roleHasPermission(drawerRol, perm as Permission)
                    const hasOverride = perm in drawerOverrides
                    const efectivo    = hasOverride ? drawerOverrides[perm] : rolBase
                    return (
                      <PermisoRow
                        key={perm}
                        label={PERMISO_LABELS[perm] ?? perm}
                        rolBase={rolBase}
                        hasOverride={hasOverride}
                        efectivo={efectivo}
                        onToggle={() => togglePermiso(perm)}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Acciones */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Permisos adicionales</p>
                <div className="space-y-1">
                  {ACCIONES_PERMS.map(perm => {
                    const rolBase    = roleHasPermission(drawerRol, perm as Permission)
                    const hasOverride = perm in drawerOverrides
                    const efectivo    = hasOverride ? drawerOverrides[perm] : rolBase
                    return (
                      <PermisoRow
                        key={perm}
                        label={PERMISO_LABELS[perm] ?? perm}
                        rolBase={rolBase}
                        hasOverride={hasOverride}
                        efectivo={efectivo}
                        onToggle={() => togglePermiso(perm)}
                      />
                    )
                  })}
                </div>
              </div>

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
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Fila de permiso con toggle ───────────────────────────────────────────────

function PermisoRow({
  label, rolBase, hasOverride, efectivo, onToggle,
}: {
  label      : string
  rolBase    : boolean
  hasOverride: boolean
  efectivo   : boolean
  onToggle   : () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-50">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-700">{label}</span>
        {hasOverride && (
          <span className="text-[9px] font-bold bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0">
            Personalizado
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Estado heredado del rol */}
        <span className={cn('text-[10px] text-gray-400', rolBase ? 'text-emerald-500' : '')}>
          {rolBase ? '✓ rol' : ''}
        </span>
        {/* Toggle */}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
            efectivo ? 'bg-indigo-500' : 'bg-gray-200',
          )}
          aria-checked={efectivo}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
              efectivo ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>
    </div>
  )
}
