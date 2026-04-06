'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  Globe,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface Presencia {
  id:              string
  plataforma:      string
  url:             string | null
  handle:          string | null
  id_publicitario: string | null
  activo:          boolean
}

interface Referencia {
  id:         string
  client_id:  string
  nombre:     string
  tipo:       TipoRef
  categoria:  string | null
  notas:      string | null
  activo:     boolean
  presencias: Presencia[]
}

type TipoRef = 'competidor_editorial' | 'competidor_publicitario' | 'referente'

interface PresenciaInput {
  plataforma:       string
  url:              string
  handle:           string
  id_publicitario:  string
}

// ─────────────────────────────────────────────────────────────
// Constantes UI
// ─────────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<TipoRef, { label: string; description: string; color: string }> = {
  competidor_editorial:    { label: 'Competencia editorial',    description: 'Competidores en contenido y SEO',                    color: 'text-violet-700 bg-violet-50 border-violet-200' },
  referente:               { label: 'Referentes',               description: 'Marcas o creadores que inspiran la estrategia',      color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  competidor_publicitario: { label: 'Competencia publicitaria', description: 'Competidores monitorizados en el Modulo Visual',     color: 'text-amber-700 bg-amber-50 border-amber-200' },
}

const CATEGORIA_LABELS: Record<string, string> = {
  contenidos: 'Contenidos', diseno_web: 'Diseno web', seo: 'SEO', redes_sociales: 'Redes sociales', general: 'General',
}

const PLATAFORMA_CFG: Record<string, { label: string; emoji: string }> = {
  web:       { label: 'Web',       emoji: '🌐' },
  instagram: { label: 'Instagram', emoji: '📸' },
  tiktok:    { label: 'TikTok',    emoji: '🎵' },
  x:         { label: 'X',         emoji: '𝕏' },
  youtube:   { label: 'YouTube',   emoji: '▶️' },
  linkedin:  { label: 'LinkedIn',  emoji: '💼' },
}

const TIPOS_ORDER: TipoRef[] = ['competidor_editorial', 'referente', 'competidor_publicitario']

const EMPTY_PRESENCIA: PresenciaInput = { plataforma: 'web', url: '', handle: '', id_publicitario: '' }

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export default function ReferenciasTab({ clienteId }: { clienteId: string }) {
  const [refs, setRefs]           = useState<Referencia[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<TipoRef>>(new Set())
  const [formTipo, setFormTipo]   = useState<TipoRef | null>(null)

  const fetchRefs = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/clientes/${clienteId}/referencias`)
    if (res.ok) {
      const data = await res.json() as { referencias: Referencia[] }
      setRefs(data.referencias)
    } else {
      setError('Error cargando referencias')
    }
    setLoading(false)
  }, [clienteId])

  useEffect(() => { fetchRefs() }, [fetchRefs])

  function toggleSection(tipo: TipoRef) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo); else next.add(tipo)
      return next
    })
  }

  async function handleToggleActivo(ref: Referencia) {
    const res = await fetch(`/api/clientes/${clienteId}/referencias/${ref.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !ref.activo }),
    })
    if (res.ok) {
      const data = await res.json() as { referencia: Referencia }
      setRefs((prev) => prev.map((r) => r.id === data.referencia.id ? data.referencia : r))
    }
  }

  async function handleDelete(refId: string) {
    const res = await fetch(`/api/clientes/${clienteId}/referencias/${refId}`, { method: 'DELETE' })
    if (res.ok) setRefs((prev) => prev.filter((r) => r.id !== refId))
  }

  function handleAdded(ref: Referencia) {
    setRefs((prev) => [...prev, ref])
    setFormTipo(null)
  }

  // Presencia added inline on a card
  function handlePresenciaAdded(refId: string, p: Presencia) {
    setRefs((prev) => prev.map((r) =>
      r.id === refId ? { ...r, presencias: [...r.presencias, p] } : r,
    ))
  }

  function handlePresenciaDeleted(refId: string, presId: string) {
    setRefs((prev) => prev.map((r) =>
      r.id === refId ? { ...r, presencias: r.presencias.filter((p) => p.id !== presId) } : r,
    ))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando referencias...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {TIPOS_ORDER.map((tipo) => {
        const cfg    = TIPO_CONFIG[tipo]
        const items  = refs.filter((r) => r.tipo === tipo)
        const isOpen = !collapsed.has(tipo)

        return (
          <div key={tipo} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection(tipo)}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>
                  {cfg.label}
                </span>
                <span className="text-xs text-gray-500">{items.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setFormTipo(tipo) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setFormTipo(tipo) } }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-2 py-1 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Anadir
                </span>
                {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
              </div>
            </button>

            {isOpen && (
              <div className="p-4 space-y-3">
                <p className="text-xs text-gray-400">{cfg.description}</p>

                {tipo === 'competidor_publicitario' && items.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Estos competidores se usan en el analisis de publicidad del Modulo Visual (Competitive Intelligence).
                  </div>
                )}

                {formTipo === tipo && (
                  <AddRefForm clienteId={clienteId} tipo={tipo} onAdded={handleAdded} onCancel={() => setFormTipo(null)} />
                )}

                {items.length === 0 && formTipo !== tipo && (
                  <p className="text-sm text-gray-400 text-center py-6">Sin referencias. Pulsa "Anadir" para agregar.</p>
                )}

                {items.map((ref) => (
                  <RefCard
                    key={ref.id}
                    ref_={ref}
                    clienteId={clienteId}
                    onToggleActivo={() => handleToggleActivo(ref)}
                    onDelete={() => handleDelete(ref.id)}
                    onUpdated={(updated) => setRefs((prev) => prev.map((r) => r.id === updated.id ? updated : r))}
                    onPresenciaAdded={(p) => handlePresenciaAdded(ref.id, p)}
                    onPresenciaDeleted={(pid) => handlePresenciaDeleted(ref.id, pid)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Card de referencia con presencias
// ─────────────────────────────────────────────────────────────

function RefCard({
  ref_, clienteId, onToggleActivo, onDelete, onUpdated, onPresenciaAdded, onPresenciaDeleted,
}: {
  ref_:                Referencia
  clienteId:           string
  onToggleActivo:      () => void
  onDelete:            () => void
  onUpdated:           (r: Referencia) => void
  onPresenciaAdded:    (p: Presencia) => void
  onPresenciaDeleted:  (presId: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingNotas, setEditingNotas]   = useState(false)
  const [notas, setNotas]                 = useState(ref_.notas ?? '')
  const [savingNotas, setSavingNotas]     = useState(false)
  const [showAddPres, setShowAddPres]     = useState(false)

  async function handleSaveNotas() {
    setSavingNotas(true)
    const res = await fetch(`/api/clientes/${clienteId}/referencias/${ref_.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas: notas.trim() || null }),
    })
    if (res.ok) {
      const data = await res.json() as { referencia: Referencia }
      onUpdated(data.referencia)
      setEditingNotas(false)
    }
    setSavingNotas(false)
  }

  async function handleDeletePresencia(presId: string) {
    const res = await fetch(`/api/clientes/${clienteId}/referencias/${ref_.id}/presencias?id=${presId}`, { method: 'DELETE' })
    if (res.ok) onPresenciaDeleted(presId)
  }

  return (
    <div className={`rounded-lg border p-4 transition-colors ${ref_.activo ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Nombre + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{ref_.nombre}</p>
            {ref_.categoria && (
              <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">
                {CATEGORIA_LABELS[ref_.categoria] ?? ref_.categoria}
              </span>
            )}
            {!ref_.activo && <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-200">Inactivo</Badge>}
          </div>

          {/* Presencias */}
          <div className="mt-2 space-y-1">
            {ref_.presencias.map((p) => (
              <PresenciaRow key={p.id} presencia={p} onDelete={() => handleDeletePresencia(p.id)} />
            ))}
          </div>

          {/* Boton anadir presencia */}
          {showAddPres ? (
            <AddPresenciaInline
              clienteId={clienteId}
              refId={ref_.id}
              onAdded={(p) => { onPresenciaAdded(p); setShowAddPres(false) }}
              onCancel={() => setShowAddPres(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddPres(true)}
              className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 mt-2 transition-colors"
            >
              <Plus className="h-3 w-3" /> Anadir presencia
            </button>
          )}

          {/* Notas */}
          <div className="mt-2">
            {editingNotas ? (
              <div className="space-y-1.5">
                <textarea
                  className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas..."
                />
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={handleSaveNotas} disabled={savingNotas} className="text-[10px] h-6 px-2">
                    {savingNotas ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingNotas(false); setNotas(ref_.notas ?? '') }} className="text-[10px] h-6 px-2">Cancelar</Button>
                </div>
              </div>
            ) : ref_.notas ? (
              <p className="text-xs text-gray-500 cursor-pointer hover:text-gray-700" onClick={() => setEditingNotas(true)} title="Click para editar">{ref_.notas}</p>
            ) : (
              <button type="button" onClick={() => setEditingNotas(true)} className="text-[10px] text-gray-400 hover:text-indigo-600 transition-colors">+ Anadir notas</button>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onToggleActivo} className="p-1 text-gray-400 hover:text-gray-600 transition-colors" title={ref_.activo ? 'Desactivar' : 'Activar'}>
            {ref_.activo ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="destructive" onClick={onDelete} className="text-[10px] h-6 px-2 gap-1"><Trash2 className="h-3 w-3" />Si</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} className="text-[10px] h-6 px-2">No</Button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Eliminar">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Fila de presencia
// ─────────────────────────────────────────────────────────────

function PresenciaRow({ presencia, onDelete }: { presencia: Presencia; onDelete: () => void }) {
  const cfg = PLATAFORMA_CFG[presencia.plataforma] ?? { label: presencia.plataforma, emoji: '🔗' }

  return (
    <div className="flex items-center gap-2 group">
      <span className="text-sm" title={cfg.label}>{cfg.emoji}</span>
      {presencia.url ? (
        <a href={presencia.url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors">
          {presencia.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ) : presencia.handle ? (
        <span className="text-xs text-gray-600">@{presencia.handle.replace(/^@/, '')}</span>
      ) : null}
      {presencia.id_publicitario && (
        <span className="text-[10px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 font-mono">
          📢 {presencia.id_publicitario}
        </span>
      )}
      <button type="button" onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all" title="Eliminar presencia">
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Formulario inline: anadir presencia a referencia existente
// ─────────────────────────────────────────────────────────────

function AddPresenciaInline({
  clienteId, refId, onAdded, onCancel,
}: {
  clienteId: string; refId: string; onAdded: (p: Presencia) => void; onCancel: () => void
}) {
  const [plataforma, setPlataforma] = useState('web')
  const [url, setUrl]               = useState('')
  const [handle, setHandle]         = useState('')
  const [idPub, setIdPub]           = useState('')
  const [saving, setSaving]         = useState(false)

  const isRRSS = plataforma !== 'web'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch(`/api/clientes/${clienteId}/referencias/${refId}/presencias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plataforma, url: url.trim() || null, handle: handle.trim() || null, id_publicitario: idPub.trim() || null }),
    })
    if (res.ok) {
      const data = await res.json() as { presencia: Presencia }
      onAdded(data.presencia)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
      <div className="w-28">
        <label className="block text-[10px] text-gray-500 mb-0.5">Plataforma</label>
        <select className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white" value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>
          {Object.entries(PLATAFORMA_CFG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
      </div>
      {isRRSS ? (
        <div className="flex-1">
          <label className="block text-[10px] text-gray-500 mb-0.5">Handle</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="@usuario" value={handle} onChange={(e) => setHandle(e.target.value)} />
        </div>
      ) : (
        <div className="flex-1">
          <label className="block text-[10px] text-gray-500 mb-0.5">URL</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      )}
      <div className="w-32">
        <label className="block text-[10px] text-gray-500 mb-0.5">ID Ads (opc.)</label>
        <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Meta/Google ID" value={idPub} onChange={(e) => setIdPub(e.target.value)} />
      </div>
      <Button type="submit" size="sm" disabled={saving} className="text-[10px] h-7 px-2">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onCancel} className="text-[10px] h-7 px-2">
        <X className="h-3 w-3" />
      </Button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────
// Formulario: nueva referencia con presencias
// ─────────────────────────────────────────────────────────────

function AddRefForm({
  clienteId, tipo, onAdded, onCancel,
}: {
  clienteId: string; tipo: TipoRef; onAdded: (r: Referencia) => void; onCancel: () => void
}) {
  const [nombre, setNombre]             = useState('')
  const [categoria, setCategoria]       = useState('')
  const [notas, setNotas]               = useState('')
  const [presencias, setPresencias]     = useState<PresenciaInput[]>([{ ...EMPTY_PRESENCIA }])
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)

  function updatePresencia(idx: number, field: keyof PresenciaInput, value: string) {
    setPresencias((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  function removePresencia(idx: number) {
    setPresencias((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setError(null)

    try {
      const validPresencias = presencias
        .filter((p) => p.url.trim() || p.handle.trim() || p.id_publicitario.trim())
        .map((p) => ({
          plataforma:      p.plataforma,
          url:             p.url.trim() || null,
          handle:          p.handle.trim() || null,
          id_publicitario: p.id_publicitario.trim() || null,
        }))

      const res = await fetch(`/api/clientes/${clienteId}/referencias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(), tipo, categoria: categoria || null,
          notas: notas.trim() || null, presencias: validPresencias,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Error')
      onAdded(data.referencia as Referencia)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-700">Nueva referencia — {TIPO_CONFIG[tipo].label}</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Nombre *</label>
          <input className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Ej: MasterD" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Categoria</label>
          <select className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Sin categoria</option>
            {Object.entries(CATEGORIA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Presencias */}
      <div className="space-y-2">
        <p className="text-[11px] text-gray-500 font-medium">Presencias por plataforma</p>
        {presencias.map((p, idx) => {
          const isRRSS = p.plataforma !== 'web'
          return (
            <div key={idx} className="flex items-end gap-2 p-2 bg-white rounded border border-gray-200">
              <div className="w-28">
                <select className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white"
                  value={p.plataforma} onChange={(e) => updatePresencia(idx, 'plataforma', e.target.value)}>
                  {Object.entries(PLATAFORMA_CFG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                </select>
              </div>
              {isRRSS ? (
                <div className="flex-1">
                  <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="@usuario"
                    value={p.handle} onChange={(e) => updatePresencia(idx, 'handle', e.target.value)} />
                </div>
              ) : (
                <div className="flex-1">
                  <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="https://..."
                    value={p.url} onChange={(e) => updatePresencia(idx, 'url', e.target.value)} />
                </div>
              )}
              <div className="w-32">
                <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="ID Ads (opc.)"
                  value={p.id_publicitario} onChange={(e) => updatePresencia(idx, 'id_publicitario', e.target.value)} />
              </div>
              {presencias.length > 1 && (
                <button type="button" onClick={() => removePresencia(idx)} className="p-1 text-gray-300 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        })}
        <button type="button" onClick={() => setPresencias((prev) => [...prev, { ...EMPTY_PRESENCIA }])}
          className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 transition-colors">
          <Plus className="h-3 w-3" /> Anadir otra plataforma
        </button>
      </div>

      <div>
        <label className="block text-[11px] text-gray-500 mb-1">Notas</label>
        <textarea className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          rows={2} placeholder="Notas opcionales..." value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          <AlertCircle className="h-3 w-3 shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving} className="text-xs gap-1">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Guardar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} className="text-xs">Cancelar</Button>
      </div>
    </form>
  )
}
