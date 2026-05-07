'use client'

import { useRef, useEffect, useState } from 'react'
import { MoreHorizontal, Archive, RotateCcw, Trash2, Loader2, AlertTriangle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// ArchiveMenu — dropdown ⋯ para archivar / restaurar / eliminar
// ─────────────────────────────────────────────────────────────────────────────

interface ArchiveMenuProps {
  /** Estado actual del elemento */
  archived      : boolean
  /** Callback al archivar o restaurar */
  onArchive     : () => void
  /** Callback al eliminar definitivamente. Si no se pasa no aparece la opción. */
  onDelete?     : () => void
  /** Si es true muestra la opción de eliminar aunque no esté archivado */
  canDelete?    : boolean
  /** Texto para archivar (default: "Archivar") */
  archiveLabel? : string
  /** Texto para restaurar (default: "Restaurar") */
  restoreLabel? : string
  /** Texto para eliminar (default: "Eliminar definitivamente") */
  deleteLabel?  : string
  /** Muestra spinner en el botón ⋯ */
  loading?      : boolean
}

export function ArchiveMenu({
  archived,
  onArchive,
  onDelete,
  canDelete    = false,
  archiveLabel = 'Archivar',
  restoreLabel = 'Restaurar',
  deleteLabel  = 'Eliminar definitivamente',
  loading      = false,
}: ArchiveMenuProps) {
  const [open,    setOpen]    = useState(false)
  const [confirm, setConfirm] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Cierre al hacer clic fuera
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirm(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const showDelete = (archived || canDelete) && !!onDelete

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setConfirm(false) }}
        disabled={loading}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Opciones"
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <MoreHorizontal className="h-4 w-4" />
        }
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-54 min-w-[200px] rounded-xl border border-gray-200 bg-white shadow-lg py-1">
          {/* Archivar / Restaurar */}
          <button
            type="button"
            onClick={() => { onArchive(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
          >
            {archived
              ? <RotateCcw className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              : <Archive   className="h-3.5 w-3.5 text-gray-500 shrink-0" />
            }
            {archived ? restoreLabel : archiveLabel}
          </button>

          {/* Eliminar definitivamente */}
          {showDelete && (
            <>
              <div className="my-1 border-t border-gray-100" />
              {confirm ? (
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-600 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                    Esta acción es irreversible
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirm(false)}
                      className="flex-1 text-xs text-gray-500 border border-gray-200 rounded-md py-1.5 hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => { onDelete!(); setOpen(false); setConfirm(false) }}
                      className="flex-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-md py-1.5 transition-colors font-medium"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  {deleteLabel}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
