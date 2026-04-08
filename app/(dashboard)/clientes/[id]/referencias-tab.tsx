'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Loader2, ExternalLink, AlertCircle,
  ChevronDown, ChevronRight, Eye, EyeOff, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface Presencia {
  id: string; plataforma: string; url: string | null
  handle: string | null; id_publicitario: string | null; activo: boolean
}

interface Referencia {
  id: string; client_id: string; nombre: string; tipo: TipoRef
  categoria: string | null; notas: string | null; activo: boolean
  presencias: Presencia[]
}

type TipoRef = 'competidor_editorial' | 'competidor_publicitario' | 'referente'

// ─────────────────────────────────────────────────────────────
// Constantes UI
// ─────────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<TipoRef, { label: string; description: string; color: string }> = {
  competidor_editorial:    { label: 'Competencia editorial',    description: 'Competidores en contenido y SEO',                color: 'text-violet-700 bg-violet-50 border-violet-200' },
  referente:               { label: 'Referentes',               description: 'Marcas o creadores que inspiran la estrategia',  color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  competidor_publicitario: { label: 'Competencia publicitaria', description: 'Competidores monitorizados en el Modulo Visual', color: 'text-amber-700 bg-amber-50 border-amber-200' },
}

const CATEGORIAS_POR_TIPO: Record<TipoRef, Array<{ value: string; label: string }>> = {
  competidor_editorial: [
    { value: 'contenidos', label: 'Contenidos' },
    { value: 'seo', label: 'SEO' },
    { value: 'general', label: 'General' },
  ],
  referente: [
    { value: 'diseno_web', label: 'Diseno web' },
    { value: 'contenidos', label: 'Contenidos' },
    { value: 'redes_sociales', label: 'Redes sociales' },
    { value: 'general', label: 'General' },
  ],
  competidor_publicitario: [],
}

const CATEGORIA_LABELS: Record<string, string> = {
  contenidos: 'Contenidos', diseno_web: 'Diseno web', seo: 'SEO',
  redes_sociales: 'Redes sociales', general: 'General',
}

// Plataformas de contenido (editorial + referentes)
const PLAT_CONTENIDO: Record<string, { label: string; emoji: string }> = {
  web:       { label: 'Web',       emoji: '🌐' },
  instagram: { label: 'Instagram', emoji: '📸' },
  tiktok:    { label: 'TikTok',    emoji: '🎵' },
  x:         { label: 'X',         emoji: '𝕏' },
  youtube:   { label: 'YouTube',   emoji: '▶️' },
  linkedin:  { label: 'LinkedIn',  emoji: '💼' },
}

// Plataformas publicitarias
const PLAT_ADS: Record<string, { label: string; emoji: string }> = {
  meta_ads:   { label: 'Meta Ads',   emoji: '📘' },
  google_ads: { label: 'Google Ads', emoji: '🔵' },
  tiktok_ads: { label: 'TikTok Ads', emoji: '🎵' },
  web:        { label: 'Web',        emoji: '🌐' },
}

// Todas las plataformas para display
const ALL_PLAT: Record<string, { label: string; emoji: string }> = { ...PLAT_CONTENIDO, ...PLAT_ADS }

const TIPOS_ORDER: TipoRef[] = ['competidor_editorial', 'referente', 'competidor_publicitario']

/** Construye URL de biblioteca de ads a partir del ID */
function buildAdsUrl(plataforma: string, idPub: string | null): string | null {
  if (!idPub) return null
  if (plataforma === 'meta_ads') return `https://www.facebook.com/ads/library/?view_all_page_id=${idPub}`
  if (plataforma === 'google_ads') return `https://adstransparency.google.com/advertiser/${idPub}`
  if (plataforma === 'tiktok_ads') return 'https://www.tiktok.com/transparency/es-es/ads-library/'
  return null
}

function adsButtonLabel(plat: string): string {
  if (plat === 'meta_ads') return 'Ver biblioteca'
  if (plat === 'google_ads') return 'Ver transparencia'
  if (plat === 'tiktok_ads') return 'Ver TikTok Ads'
  return 'Ver'
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export default function ReferenciasTab({
  clienteId,
  hidePublicitaria = false,
}: {
  clienteId: string
  hidePublicitaria?: boolean
}) {
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
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
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

  function handlePresenciaAdded(refId: string, p: Presencia) {
    setRefs((prev) => prev.map((r) => r.id === refId ? { ...r, presencias: [...r.presencias, p] } : r))
  }

  function handlePresenciaDeleted(refId: string, pid: string) {
    setRefs((prev) => prev.map((r) => r.id === refId ? { ...r, presencias: r.presencias.filter((p) => p.id !== pid) } : r))
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mr-2" />Cargando referencias...</div>
  }

  return (
    <div className="space-y-4">
      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4" /> {error}</div>}

      {TIPOS_ORDER.filter((t) => !(hidePublicitaria && t === 'competidor_publicitario')).map((tipo) => {
        const cfg = TIPO_CONFIG[tipo], items = refs.filter((r) => r.tipo === tipo), isOpen = !collapsed.has(tipo)
        return (
          <div key={tipo} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button type="button" onClick={() => toggleSection(tipo)}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                <span className="text-xs text-gray-500">{items.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setFormTipo(tipo) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setFormTipo(tipo) } }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-2 py-1 transition-colors">
                  <Plus className="h-3 w-3" /> Anadir
                </span>
                {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
              </div>
            </button>

            {isOpen && (
              <div className="p-4 space-y-3">
                <p className="text-xs text-gray-400">{cfg.description}</p>
                {tipo === 'competidor_publicitario' && (
                  <>
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Estos competidores se usan en el analisis de publicidad del Modulo Visual (Competitive Intelligence).
                    </div>
                    <div className="text-xs text-blue-700 bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2.5 space-y-1.5">
                      <p className="font-medium">Como obtener el ID del anunciante?</p>
                      <div className="flex flex-col gap-1">
                        <a href="https://adstransparency.google.com/" target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors">
                          <span>🔵</span> <span className="font-medium">Google Ads Transparency</span>
                          <span className="text-blue-400">— Busca el anunciante y copia el ID de la URL</span>
                        </a>
                        <a href="https://www.facebook.com/ads/library/" target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors">
                          <span>📘</span> <span className="font-medium">Meta Ads Library</span>
                          <span className="text-blue-400">— Busca la pagina y copia el ID del parametro view_all_page_id</span>
                        </a>
                      </div>
                    </div>
                  </>
                )}
                {formTipo === tipo && (
                  <AddRefForm clienteId={clienteId} tipo={tipo}
                    onAdded={(r) => { setRefs((prev) => [...prev, r]); setFormTipo(null) }}
                    onCancel={() => setFormTipo(null)} />
                )}
                {items.length === 0 && formTipo !== tipo && (
                  <p className="text-sm text-gray-400 text-center py-6">Sin referencias. Pulsa &quot;Anadir&quot; para agregar.</p>
                )}
                {items.map((ref) => (
                  <RefCard key={ref.id} ref_={ref} clienteId={clienteId}
                    onToggleActivo={() => handleToggleActivo(ref)}
                    onDelete={() => handleDelete(ref.id)}
                    onUpdated={(u) => setRefs((prev) => prev.map((r) => r.id === u.id ? u : r))}
                    onPresenciaAdded={(p) => handlePresenciaAdded(ref.id, p)}
                    onPresenciaDeleted={(pid) => handlePresenciaDeleted(ref.id, pid)} />
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
// Card de referencia
// ─────────────────────────────────────────────────────────────

function RefCard({
  ref_, clienteId, onToggleActivo, onDelete, onUpdated, onPresenciaAdded, onPresenciaDeleted,
}: {
  ref_: Referencia; clienteId: string; onToggleActivo: () => void; onDelete: () => void
  onUpdated: (r: Referencia) => void; onPresenciaAdded: (p: Presencia) => void; onPresenciaDeleted: (pid: string) => void
}) {
  const [confirmDel, setConfirmDel]   = useState(false)
  const [editNotas, setEditNotas]     = useState(false)
  const [notas, setNotas]             = useState(ref_.notas ?? '')
  const [savingNotas, setSavingNotas] = useState(false)
  const [showAddPres, setShowAddPres] = useState(false)
  const isPub = ref_.tipo === 'competidor_publicitario'
  const isRef = ref_.tipo === 'referente'

  async function handleSaveNotas() {
    setSavingNotas(true)
    const res = await fetch(`/api/clientes/${clienteId}/referencias/${ref_.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas: notas.trim() || null }),
    })
    if (res.ok) { const d = await res.json() as { referencia: Referencia }; onUpdated(d.referencia); setEditNotas(false) }
    setSavingNotas(false)
  }

  async function handleDelPres(pid: string) {
    const res = await fetch(`/api/clientes/${clienteId}/referencias/${ref_.id}/presencias?id=${pid}`, { method: 'DELETE' })
    if (res.ok) onPresenciaDeleted(pid)
  }

  const notasLabel = isRef ? 'Por que inspira' : 'Notas'

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
          <div className="mt-2 space-y-1.5">
            {ref_.presencias.map((p) => (
              isPub
                ? <PresenciaAdRow key={p.id} presencia={p} onDelete={() => handleDelPres(p.id)} />
                : <PresenciaContentRow key={p.id} presencia={p} onDelete={() => handleDelPres(p.id)} />
            ))}
          </div>

          {/* Boton anadir presencia */}
          {showAddPres ? (
            <AddPresenciaInline clienteId={clienteId} refId={ref_.id} isPub={isPub}
              onAdded={(p) => { onPresenciaAdded(p); setShowAddPres(false) }}
              onCancel={() => setShowAddPres(false)} />
          ) : (
            <button type="button" onClick={() => setShowAddPres(true)}
              className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 mt-2 transition-colors">
              <Plus className="h-3 w-3" /> Anadir presencia
            </button>
          )}

          {/* Notas / Por que inspira */}
          <div className="mt-2">
            {editNotas ? (
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-500 font-medium">{notasLabel}</label>
                <textarea className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={2} value={notas} onChange={(e) => setNotas(e.target.value)}
                  placeholder={isRef ? 'Que tiene esta marca que te inspira...' : 'Notas...'} />
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={handleSaveNotas} disabled={savingNotas} className="text-[10px] h-6 px-2">
                    {savingNotas ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditNotas(false); setNotas(ref_.notas ?? '') }} className="text-[10px] h-6 px-2">Cancelar</Button>
                </div>
              </div>
            ) : ref_.notas ? (
              <div className="cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 py-0.5" onClick={() => setEditNotas(true)} title="Click para editar">
                {isRef && <p className="text-[10px] text-emerald-600 font-medium mb-0.5">Por que inspira:</p>}
                <p className="text-xs text-gray-500">{ref_.notas}</p>
              </div>
            ) : (
              <button type="button" onClick={() => setEditNotas(true)}
                className="text-[10px] text-gray-400 hover:text-indigo-600 transition-colors">
                + {isRef ? 'Por que inspira' : 'Anadir notas'}
              </button>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onToggleActivo} className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title={ref_.activo ? 'Desactivar' : 'Activar'}>
            {ref_.activo ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          {confirmDel ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="destructive" onClick={onDelete} className="text-[10px] h-6 px-2 gap-1"><Trash2 className="h-3 w-3" />Si</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDel(false)} className="text-[10px] h-6 px-2">No</Button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDel(true)} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Eliminar">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Fila de presencia — contenido (editorial + referentes)
// ─────────────────────────────────────────────────────────────

function PresenciaContentRow({ presencia: p, onDelete }: { presencia: Presencia; onDelete: () => void }) {
  const cfg = PLAT_CONTENIDO[p.plataforma] ?? ALL_PLAT[p.plataforma] ?? { label: p.plataforma, emoji: '🔗' }
  return (
    <div className="flex items-center gap-2 group">
      <span className="text-sm" title={cfg.label}>{cfg.emoji}</span>
      {p.url ? (
        <a href={p.url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors">
          {p.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').substring(0, 40)}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ) : p.handle ? (
        <span className="text-xs text-gray-600">@{p.handle.replace(/^@/, '')}</span>
      ) : null}
      <button type="button" onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all" title="Eliminar">
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Fila de presencia — publicitaria (Meta/Google/TikTok Ads)
// ─────────────────────────────────────────────────────────────

function PresenciaAdRow({ presencia: p, onDelete }: { presencia: Presencia; onDelete: () => void }) {
  const cfg = PLAT_ADS[p.plataforma] ?? ALL_PLAT[p.plataforma] ?? { label: p.plataforma, emoji: '🔗' }
  const isAdsPlatform = ['meta_ads', 'google_ads', 'tiktok_ads'].includes(p.plataforma)
  const adsUrl = buildAdsUrl(p.plataforma, p.id_publicitario)

  // Para plataformas web normales dentro de comp. publicitaria, usar row de contenido
  if (!isAdsPlatform) {
    return <PresenciaContentRow presencia={p} onDelete={onDelete} />
  }

  return (
    <div className="flex items-center gap-2 group">
      <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
        p.plataforma === 'meta_ads' ? 'text-blue-700 bg-blue-50' :
        p.plataforma === 'google_ads' ? 'text-blue-600 bg-sky-50' :
        'text-gray-700 bg-gray-100'
      }`}>
        {cfg.emoji} {cfg.label}
      </span>
      {p.handle && <span className="text-xs text-gray-600">{p.handle}</span>}
      {p.id_publicitario && <span className="text-[10px] text-gray-400 font-mono">ID: {p.id_publicitario}</span>}
      {adsUrl && (
        <a href={adsUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
          {adsButtonLabel(p.plataforma)} <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
      <button type="button" onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all" title="Eliminar">
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Formulario inline: anadir presencia a card existente
// ─────────────────────────────────────────────────────────────

function AddPresenciaInline({
  clienteId, refId, isPub, onAdded, onCancel,
}: {
  clienteId: string; refId: string; isPub: boolean
  onAdded: (p: Presencia) => void; onCancel: () => void
}) {
  const platOptions = isPub ? PLAT_ADS : PLAT_CONTENIDO
  const defaultPlat = isPub ? 'meta_ads' : 'web'

  const [plat, setPlat]       = useState(defaultPlat)
  const [url, setUrl]         = useState('')
  const [handle, setHandle]   = useState('')
  const [idPub, setIdPub]     = useState('')
  const [saving, setSaving]   = useState(false)

  const isAds  = ['meta_ads', 'google_ads', 'tiktok_ads'].includes(plat)
  const isRRSS = !isAds && plat !== 'web'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    // Auto-construir URL para plataformas ads
    let finalUrl = url.trim() || null
    if (isAds && idPub.trim()) {
      finalUrl = buildAdsUrl(plat, idPub.trim())
    }

    const res = await fetch(`/api/clientes/${clienteId}/referencias/${refId}/presencias`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plataforma: plat,
        url: finalUrl,
        handle: handle.trim() || null,
        id_publicitario: idPub.trim() || null,
      }),
    })
    if (res.ok) { const d = await res.json() as { presencia: Presencia }; onAdded(d.presencia) }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 mt-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
      <div className="w-32">
        <label className="block text-[10px] text-gray-500 mb-0.5">Plataforma</label>
        <select className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white" value={plat}
          onChange={(e) => { setPlat(e.target.value); setUrl(''); setHandle(''); setIdPub('') }}>
          {Object.entries(platOptions).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
      </div>

      {isAds ? (
        <>
          <div className="flex-1">
            <label className="block text-[10px] text-gray-500 mb-0.5">
              {plat === 'meta_ads' ? 'Nombre en Meta' : plat === 'google_ads' ? 'Nombre en Google' : 'Handle TikTok'}
            </label>
            <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
              placeholder={plat === 'tiktok_ads' ? '@usuario' : 'Nombre del anunciante'}
              value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div className="w-40">
            <label className="block text-[10px] text-gray-500 mb-0.5">
              {plat === 'meta_ads' ? 'ID pagina Meta' : plat === 'google_ads' ? 'ID anunciante' : 'ID (opc.)'}
            </label>
            <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono"
              placeholder={plat === 'meta_ads' ? '1470045239962805' : plat === 'google_ads' ? 'AR17828...' : ''}
              value={idPub} onChange={(e) => setIdPub(e.target.value)} />
          </div>
        </>
      ) : isRRSS ? (
        <>
          <div className="flex-1">
            <label className="block text-[10px] text-gray-500 mb-0.5">Handle</label>
            <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="@usuario"
              value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] text-gray-500 mb-0.5">URL (opc.)</label>
            <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="https://..."
              value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
        </>
      ) : (
        <div className="flex-1">
          <label className="block text-[10px] text-gray-500 mb-0.5">URL</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="https://..."
            value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      )}

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

interface PresInput { plataforma: string; url: string; handle: string; id_publicitario: string }

function AddRefForm({
  clienteId, tipo, onAdded, onCancel,
}: {
  clienteId: string; tipo: TipoRef; onAdded: (r: Referencia) => void; onCancel: () => void
}) {
  const isPub      = tipo === 'competidor_publicitario'
  const isRef      = tipo === 'referente'
  const platOpts   = isPub ? PLAT_ADS : PLAT_CONTENIDO
  const defaultP   = isPub ? 'meta_ads' : 'web'
  const catOpts    = CATEGORIAS_POR_TIPO[tipo]

  const [nombre, setNombre]       = useState('')
  const [categoria, setCategoria] = useState('')
  const [notas, setNotas]         = useState('')
  const [pres, setPres]           = useState<PresInput[]>([{ plataforma: defaultP, url: '', handle: '', id_publicitario: '' }])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  function updateP(i: number, f: keyof PresInput, v: string) { setPres((p) => p.map((x, j) => j === i ? { ...x, [f]: v } : x)) }
  function removeP(i: number) { setPres((p) => p.filter((_, j) => j !== i)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true); setError(null)
    try {
      const validPres = pres
        .filter((p) => p.url.trim() || p.handle.trim() || p.id_publicitario.trim())
        .map((p) => {
          const isAds = ['meta_ads', 'google_ads', 'tiktok_ads'].includes(p.plataforma)
          let finalUrl = p.url.trim() || null
          if (isAds && p.id_publicitario.trim()) {
            finalUrl = buildAdsUrl(p.plataforma, p.id_publicitario.trim())
          }
          return {
            plataforma: p.plataforma,
            url: finalUrl,
            handle: p.handle.trim() || null,
            id_publicitario: p.id_publicitario.trim() || null,
          }
        })

      const res = await fetch(`/api/clientes/${clienteId}/referencias`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(), tipo,
          categoria: categoria || null,
          notas: notas.trim() || null,
          presencias: validPres,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Error')
      onAdded(data.referencia as Referencia)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-700">Nueva referencia — {TIPO_CONFIG[tipo].label}</p>

      <div className={`grid gap-3 ${catOpts.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Nombre *</label>
          <input className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Ej: MasterD" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        {catOpts.length > 0 && (
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Categoria</label>
            <select className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Sin categoria</option>
              {catOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Presencias */}
      <div className="space-y-2">
        <p className="text-[11px] text-gray-500 font-medium">Presencias por plataforma</p>
        {pres.map((p, idx) => {
          const isAds  = ['meta_ads', 'google_ads', 'tiktok_ads'].includes(p.plataforma)
          const isRRSS = !isAds && p.plataforma !== 'web'

          return (
            <div key={idx} className="flex items-end gap-2 p-2 bg-white rounded border border-gray-200">
              <div className="w-32">
                <select className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white"
                  value={p.plataforma} onChange={(e) => updateP(idx, 'plataforma', e.target.value)}>
                  {Object.entries(platOpts).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                </select>
              </div>

              {isAds ? (
                <>
                  <div className="flex-1">
                    <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      placeholder={p.plataforma === 'tiktok_ads' ? '@usuario' : 'Nombre del anunciante'}
                      value={p.handle} onChange={(e) => updateP(idx, 'handle', e.target.value)} />
                  </div>
                  <div className="w-40">
                    <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono"
                      placeholder={p.plataforma === 'meta_ads' ? 'ID pagina Meta' : p.plataforma === 'google_ads' ? 'ID anunciante' : 'ID'}
                      value={p.id_publicitario} onChange={(e) => updateP(idx, 'id_publicitario', e.target.value)} />
                  </div>
                </>
              ) : isRRSS ? (
                <>
                  <div className="flex-1">
                    <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="@usuario"
                      value={p.handle} onChange={(e) => updateP(idx, 'handle', e.target.value)} />
                  </div>
                  <div className="flex-1">
                    <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="URL (opc.)"
                      value={p.url} onChange={(e) => updateP(idx, 'url', e.target.value)} />
                  </div>
                </>
              ) : (
                <div className="flex-1">
                  <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="https://..."
                    value={p.url} onChange={(e) => updateP(idx, 'url', e.target.value)} />
                </div>
              )}

              {pres.length > 1 && (
                <button type="button" onClick={() => removeP(idx)} className="p-1 text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
              )}
            </div>
          )
        })}
        <button type="button" onClick={() => setPres((p) => [...p, { plataforma: defaultP, url: '', handle: '', id_publicitario: '' }])}
          className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 transition-colors">
          <Plus className="h-3 w-3" /> Anadir otra plataforma
        </button>
      </div>

      <div>
        <label className="block text-[11px] text-gray-500 mb-1">{isRef ? 'Por que inspira' : 'Notas'}</label>
        <textarea className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          rows={2} placeholder={isRef ? 'Que tiene esta marca que te inspira...' : 'Notas opcionales...'}
          value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      {error && <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5"><AlertCircle className="h-3 w-3 shrink-0" /> {error}</div>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving} className="text-xs gap-1">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Guardar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} className="text-xs">Cancelar</Button>
      </div>
    </form>
  )
}
