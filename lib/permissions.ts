/**
 * Permisos base por rol.
 * Son el punto de partida — se pueden sobrescribir por usuario via user_permissions.
 */

export const PERMISSIONS = {
  // ── Módulos ────────────────────────────────────────────
  'module:dashboard'       : ['admin', 'seo', 'redactor', 'consultor'],
  'module:clientes'        : ['admin', 'seo', 'redactor', 'consultor'],
  'module:inspiracion'     : ['admin', 'seo', 'consultor'],
  'module:estrategia'      : ['admin', 'seo', 'consultor'],
  'module:banco_contenidos': ['admin', 'seo', 'redactor'],
  'module:calendario'      : ['admin', 'seo', 'redactor'],
  'module:contenidos'      : ['admin', 'seo', 'redactor'],
  'module:copiloto'        : ['admin', 'seo', 'redactor'],
  'module:georadar'        : ['admin', 'seo'],
  'module:social_media'    : ['admin'],
  'module:panel_diseno'    : ['admin'],
  'module:pedidos'         : ['admin', 'seo', 'redactor'],
  'module:costes'          : ['admin'],
  'module:agentes'         : ['admin'],
  'module:ajustes'         : ['admin'],

  // ── Acciones ───────────────────────────────────────────
  'action:ver_coste_articulo'  : ['admin', 'seo', 'redactor'],
  'action:aprobar_contenidos'  : ['admin', 'seo', 'redactor'],
  'action:asignar_articulos'   : ['admin', 'seo'],
  'action:crear_clientes'      : ['admin'],
  'action:ver_todos_clientes'  : ['admin', 'seo'],
  'action:invitar_usuarios'    : ['admin'],
  'action:gestionar_equipo'    : ['admin'],
  'action:ver_todos_pedidos'   : ['admin', 'seo'],
  'action:ver_todos_contenidos': ['admin', 'seo'],
} as const

export type Permission = keyof typeof PERMISSIONS

/** Etiquetas legibles de cada rol */
export const ROL_LABELS: Record<string, string> = {
  admin    : 'Admin',
  seo      : 'SEO',
  redactor : 'Redactor',
  consultor: 'Consultor',
}

/** Colores badge por rol */
export const ROL_COLORS: Record<string, string> = {
  admin    : 'bg-red-100 text-red-700',
  seo      : 'bg-indigo-100 text-indigo-700',
  redactor : 'bg-emerald-100 text-emerald-700',
  consultor: 'bg-amber-100 text-amber-700',
}

/** Verifica si un rol tiene un permiso por defecto */
export function roleHasPermission(role: string, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role)
}
