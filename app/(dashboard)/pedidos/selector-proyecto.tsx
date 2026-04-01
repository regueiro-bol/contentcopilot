'use client'

import { useState, useRef } from 'react'

interface Proyecto {
  id: string
  nombre: string
}

export function SelectorProyecto({
  clienteId,
  valor,
  onChange,
  disabled,
}: {
  clienteId: string
  valor: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [cargando, setCargando] = useState(false)
  const clienteAnterior = useRef('')

  if (clienteId && clienteId !== clienteAnterior.current) {
    clienteAnterior.current = clienteId
    setCargando(true)
    onChange('')
    fetch(`/api/pedidos/proyectos?cliente_id=${clienteId}`)
      .then((r) => r.json())
      .then((d) => setProyectos(d.proyectos ?? []))
      .catch(() => setProyectos([]))
      .finally(() => setCargando(false))
  }

  return (
    <select
      className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || cargando || !clienteId}
    >
      <option value="">
        {cargando
          ? 'Cargando proyectos...'
          : !clienteId
            ? 'Primero selecciona un cliente'
            : 'Selecciona un proyecto'}
      </option>
      {proyectos.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </select>
  )
}
