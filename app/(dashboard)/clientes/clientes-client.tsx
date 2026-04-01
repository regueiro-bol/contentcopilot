'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Building2, Users } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Cliente, ClienteFormData } from '@/types'
import { crearCliente } from './actions'

type ClienteConCount = Cliente & { num_proyectos: number }

const SECTORES = [
  'Tecnología', 'Tecnología SaaS', 'Moda y Retail', 'Salud', 'Educación', 'Turismo',
  'Alimentación', 'Finanzas', 'Banca y Finanzas', 'Inmobiliaria', 'Energía',
  'Healthtech / IA', 'Moda / Lifestyle', 'Otro',
]

// ---------------------------------------------------------------------------
// Tarjeta de cliente
// ---------------------------------------------------------------------------
function ClienteCard({ cliente }: { cliente: ClienteConCount }) {
  const iniciales = cliente.nombre.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  return (
    <Link href={`/clientes/${cliente.id}`} className="block group">
      <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all space-y-4 h-full">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
              {iniciales}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate group-hover:text-indigo-700 transition-colors">
                {cliente.nombre}
              </p>
              <p className="text-xs text-gray-500 truncate">{cliente.sector}</p>
            </div>
          </div>
          <Badge variant={cliente.activo ? 'success' : 'secondary'} className="shrink-0">
            {cliente.activo ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>

        {cliente.descripcion && (
          <p className="text-xs text-gray-500 line-clamp-2">{cliente.descripcion}</p>
        )}

        <div className="border-t border-gray-100 pt-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>AM: {cliente.account_manager_id || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              {cliente.num_proyectos > 0
                ? `${cliente.num_proyectos} proyecto${cliente.num_proyectos > 1 ? 's' : ''}`
                : 'Sin proyectos'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Modal: Nuevo cliente
// ---------------------------------------------------------------------------
function NuevoClienteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState<Partial<ClienteFormData>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(field: keyof ClienteFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre?.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.sector?.trim()) { setError('El sector es obligatorio'); return }
    if (!form.url_web?.trim()) { setError('La URL web es obligatoria'); return }
    if (!form.descripcion?.trim()) { setError('La descripción es obligatoria'); return }

    setGuardando(true)
    setError(null)
    try {
      await crearCliente({
        nombre: form.nombre,
        sector: form.sector,
        url_web: form.url_web,
        descripcion: form.descripcion,
        identidad_corporativa: form.identidad_corporativa ?? '',
      })
      router.refresh()
      setForm({})
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el cliente')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Rellena los datos básicos. Podrás completar el perfil desde la ficha del cliente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="nc-nombre">Nombre <span className="text-red-500">*</span></Label>
            <Input
              id="nc-nombre"
              placeholder="Ej: Banco Santander"
              value={form.nombre ?? ''}
              onChange={(e) => handleChange('nombre', e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-sector">Sector <span className="text-red-500">*</span></Label>
            <select
              id="nc-sector"
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.sector ?? ''}
              onChange={(e) => handleChange('sector', e.target.value)}
              required
            >
              <option value="" disabled>Selecciona un sector</option>
              {SECTORES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-url">URL web <span className="text-red-500">*</span></Label>
            <Input
              id="nc-url"
              type="url"
              placeholder="https://ejemplo.com"
              value={form.url_web ?? ''}
              onChange={(e) => handleChange('url_web', e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-desc">Descripción <span className="text-red-500">*</span></Label>
            <Textarea
              id="nc-desc"
              placeholder="Breve descripción corporativa del cliente..."
              rows={3}
              value={form.descripcion ?? ''}
              onChange={(e) => handleChange('descripcion', e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-identidad">Identidad corporativa</Label>
            <Textarea
              id="nc-identidad"
              placeholder="Tono y valores de marca a nivel global..."
              rows={2}
              value={form.identidad_corporativa ?? ''}
              onChange={(e) => handleChange('identidad_corporativa', e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Creando...' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function ClientesPageClient({ clientes }: { clientes: ClienteConCount[] }) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos')

  const clientesFiltrados = clientes.filter((c) => {
    const coincide =
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.sector.toLowerCase().includes(busqueda.toLowerCase())
    const estado =
      filtroEstado === 'todos' ||
      (filtroEstado === 'activos' && c.activo) ||
      (filtroEstado === 'inactivos' && !c.activo)
    return coincide && estado
  })

  const totalActivos = clientes.filter((c) => c.activo).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Clientes</h2>
          <p className="text-gray-500 text-sm mt-1">
            {totalActivos} clientes activos de {clientes.length} totales
          </p>
        </div>
        <Button className="gap-2" onClick={() => setModalAbierto(true)}>
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o sector..."
            className="pl-8"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(['todos', 'activos', 'inactivos'] as const).map((e) => (
            <Button
              key={e}
              variant={filtroEstado === e ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroEstado(e)}
            >
              {e === 'todos' ? 'Todos' : e === 'activos' ? 'Activos' : 'Inactivos'}
            </Button>
          ))}
        </div>
      </div>

      {clientesFiltrados.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {clientesFiltrados.map((c) => <ClienteCard key={c.id} cliente={c} />)}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-gray-500">
            {busqueda
              ? `Sin resultados para "${busqueda}".`
              : clientes.length === 0
                ? 'No hay clientes todavía.'
                : 'Ningún cliente coincide con el filtro.'}
          </p>
          {clientes.length === 0 && (
            <Button className="mt-4 gap-2" onClick={() => setModalAbierto(true)}>
              <Plus className="h-4 w-4" />
              Añadir primer cliente
            </Button>
          )}
        </div>
      )}

      <NuevoClienteModal open={modalAbierto} onClose={() => setModalAbierto(false)} />
    </div>
  )
}
