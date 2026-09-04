'use client'

import { Building2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PERMISSIONS, roleHasPermission, type Permission } from '@/lib/permissions'

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export interface ClienteItem {
  id    : string
  nombre: string
}

export interface PermisosEditorProps {
  rol              : string
  overrides        : Record<string, boolean>
  clientIds        : string[]
  todosClientes    : ClienteItem[]
  cargandoClientes?: boolean
  onOverridesChange: (v: Record<string, boolean>) => void
  onClientIdsChange: (v: string[]) => void
}

// ─── Constantes ───────────────────────────────────────────────────────────────

export const PERMISO_LABELS: Record<string, string> = {
  'module:dashboard'           : 'Dashboard',
  'module:clientes'            : 'Clientes',
  'module:inspiracion'         : 'Inspiración',
  'module:estrategia'          : 'Estrategia',
  'module:banco_contenidos'    : 'Banco de Contenidos',
  'module:calendario'          : 'Calendario',
  'module:contenidos'          : 'Contenidos',
  'module:copiloto'            : 'Copiloto',
  'module:georadar'            : 'GEORadar',
  'module:social_media'        : 'Social Media',
  'module:panel_diseno'        : 'Panel de Diseño',
  'module:pedidos'             : 'Pedidos',
  'module:costes'              : 'Costes',
  'module:agentes'             : 'Agentes',
  'module:ajustes'             : 'Ajustes',
  'action:ver_coste_articulo'  : 'Ver coste por artículo',
  'action:aprobar_contenidos'  : 'Aprobar contenidos',
  'action:asignar_articulos'   : 'Asignar artículos',
  'action:crear_clientes'      : 'Crear clientes',
  'action:ver_todos_clientes'  : 'Ver todos los clientes',
  'action:invitar_usuarios'    : 'Invitar usuarios',
  'action:gestionar_equipo'    : 'Gestionar equipo',
  'action:ver_todos_pedidos'   : 'Ver todos los pedidos',
  'action:ver_todos_contenidos': 'Ver todos los contenidos',
}

const MODULOS_PERMS  = Object.keys(PERMISSIONS).filter(k => k.startsWith('module:'))
const ACCIONES_PERMS = Object.keys(PERMISSIONS).filter(k => k.startsWith('action:'))

// ─── Componente principal ─────────────────────────────────────────────────────

export function PermisosEditor({
  rol,
  overrides,
  clientIds,
  todosClientes,
  cargandoClientes,
  onOverridesChange,
  onClientIdsChange,
}: PermisosEditorProps) {

  function togglePermiso(perm: string) {
    const rolBase    = roleHasPermission(rol, perm as Permission)
    const current    = perm in overrides ? overrides[perm] : rolBase
    const nuevoValor = !current
    if (nuevoValor === rolBase) {
      const n = { ...overrides }
      delete n[perm]
      onOverridesChange(n)
    } else {
      onOverridesChange({ ...overrides, [perm]: nuevoValor })
    }
  }

  return (
    <div className="space-y-6">

      {/* Módulos */}
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Módulos</p>
        <div className="space-y-1">
          {MODULOS_PERMS.map(perm => {
            const rolBase    = roleHasPermission(rol, perm as Permission)
            const hasOverride = perm in overrides
            const efectivo    = hasOverride ? overrides[perm] : rolBase
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
            const rolBase    = roleHasPermission(rol, perm as Permission)
            const hasOverride = perm in overrides
            const efectivo    = hasOverride ? overrides[perm] : rolBase
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

      {/* Clientes asignados */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-3.5 w-3.5 text-gray-400" />
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Clientes asignados
          </p>
        </div>

        {rol === 'admin' ? (
          <p className="text-xs text-gray-400 italic px-2">
            Los administradores ven todos los clientes sin restricción.
          </p>
        ) : cargandoClientes ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 px-2 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando clientes…
          </div>
        ) : todosClientes.length === 0 ? (
          <p className="text-xs text-gray-400 italic px-2">No hay clientes activos.</p>
        ) : (
          <div className="space-y-0.5 max-h-52 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
            <label className="flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer hover:bg-white select-none">
              <input
                type="checkbox"
                checked={clientIds.length === 0}
                onChange={() => onClientIdsChange([])}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              <span className="text-xs font-semibold text-indigo-700">Todos los clientes</span>
            </label>
            <div className="border-t border-gray-200 my-1" />
            {todosClientes.map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer hover:bg-white select-none">
                <input
                  type="checkbox"
                  checked={clientIds.includes(c.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onClientIdsChange([...clientIds, c.id])
                    } else {
                      onClientIdsChange(clientIds.filter(id => id !== c.id))
                    }
                  }}
                  className="h-3.5 w-3.5 accent-indigo-600"
                />
                <span className="text-xs text-gray-700">{c.nombre}</span>
              </label>
            ))}
          </div>
        )}

        {rol !== 'admin' && clientIds.length === 0 && !cargandoClientes && (
          <p className="text-[10px] text-emerald-600 mt-1.5 px-2">
            Sin restricción — verá todos los clientes
          </p>
        )}
        {rol !== 'admin' && clientIds.length > 0 && (
          <p className="text-[10px] text-amber-600 mt-1.5 px-2">
            Restringido a {clientIds.length} cliente{clientIds.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

    </div>
  )
}

// ─── PermisoRow ───────────────────────────────────────────────────────────────

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
        <span className={cn('text-[10px] text-gray-400', rolBase ? 'text-emerald-500' : '')}>
          {rolBase ? '✓ rol' : ''}
        </span>
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
