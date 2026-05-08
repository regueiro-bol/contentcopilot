'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

function proximoLunesHabil(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 1 : day === 6 ? 2 : 8 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

export interface DatePickerPopoverProps {
  currentDate?  : string
  saving?       : boolean
  position      : { top: number; left: number }
  confirmLabel? : string
  onConfirm     : (date: string) => void
  onClose       : () => void
}

export function DatePickerPopover({
  currentDate,
  saving = false,
  position,
  confirmLabel = 'Añadir al calendario',
  onConfirm,
  onClose,
}: DatePickerPopoverProps) {
  const [fecha, setFecha] = useState(currentDate ?? proximoLunesHabil())
  const ref = useRef<HTMLDivElement>(null)

  // Sync if parent changes currentDate (e.g. reopening with existing date)
  useEffect(() => {
    setFecha(currentDate ?? proximoLunesHabil())
  }, [currentDate])

  // Click-outside to close
  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: position.top, left: position.left, width: 284, zIndex: 9999 }}
      className="bg-white rounded-lg shadow-xl border border-gray-200 p-4"
    >
      <p className="text-xs font-semibold text-gray-700 mb-2">Fecha de publicación</p>
      <input
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 mb-3 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <button
        onClick={() => fecha && onConfirm(fecha)}
        disabled={saving || !fecha}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded px-3 py-1.5 disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        {saving
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Añadiendo…</>
          : confirmLabel}
      </button>
    </div>
  )
}
