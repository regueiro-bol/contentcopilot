'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Image,
  FileType,
  Megaphone,
  Layout,
  BookOpen,
  ExternalLink,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Sparkles,
  Pencil,
  Save,
  Plus,
  Trash2,
  Palette,
} from 'lucide-react'
import type {
  AssetType,
  BrandAssetRow,
  BrandAssetsCoverage,
  BrandContextRow,
  GenerationStatus,
} from '@/types/brand-assets'
import { ASSET_TYPE_LABELS } from '@/types/brand-assets'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos locales
// ─────────────────────────────────────────────────────────────────────────────

interface StoredColor {
  name: string
  hex: string
  role?: string
  usage?: string
}

interface StoredFont {
  name?: string
  family?: string
  role?: string
  usage?: string
  weights?: string[]
}

interface Props {
  clientId: string
  clientNombre: string
  initialAssets: BrandAssetRow[]
  coverage: BrandAssetsCoverage
  hasContext: boolean
  initialContext: BrandContextRow | null
}

const ASSET_TYPE_ORDER: AssetType[] = [
  'logo',
  'brand_book',
  'product_image',
  'reference_ad',
  'template',
]

const DRIVE_FOLDER_NAME: Record<AssetType, string> = {
  logo:          'logos',
  brand_book:    'brand-book',
  product_image: 'imagenes-producto',
  reference_ad:  'ads-referencia',
  template:      'plantillas',
  font:          'fuentes',
  color:         'colores',
}

const ASSET_TYPE_ICON: Record<AssetType, React.ReactNode> = {
  logo:          <Image className="h-4 w-4" />,
  brand_book:    <BookOpen className="h-4 w-4" />,
  product_image: <FileType className="h-4 w-4" />,
  reference_ad:  <Megaphone className="h-4 w-4" />,
  template:      <Layout className="h-4 w-4" />,
  font:          <Layout className="h-4 w-4" />,
  color:         <Layout className="h-4 w-4" />,
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isPreviewableImage(mimeType: string | null): boolean {
  if (!mimeType) return false
  return ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(mimeType)
}

function colorRole(c: StoredColor): string {
  return c.role ?? c.usage ?? ''
}

function fontName(f: StoredFont): string {
  return f.name ?? f.family ?? ''
}

function fontRole(f: StoredFont): string {
  return f.role ?? f.usage ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge de estado de generación
// ─────────────────────────────────────────────────────────────────────────────

function GenerationStatusBadge({ status }: { status: GenerationStatus }) {
  if (status === 'ready') {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Listo para generar
      </Badge>
    )
  }
  if (status === 'pending') {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
        <Clock className="h-3.5 w-3.5" />
        Marca incompleta
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">
      <XCircle className="h-3.5 w-3.5" />
      Bloqueado
    </Badge>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AssetCard
// ─────────────────────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onToggleApproved,
  toggling,
  patchError,
}: {
  asset: BrandAssetRow
  onToggleApproved: (id: string, current: boolean) => void
  toggling: boolean
  patchError: string | null
}) {
  const [imgError, setImgError] = useState(false)
  const ext = asset.file_name?.split('.').pop()?.toUpperCase() ?? ''
  const shortName = asset.file_name ?? asset.drive_file_id
  const showImage = isPreviewableImage(asset.mime_type) && !imgError
  const previewUrl = `/api/brand-assets/${asset.id}/preview`

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      {showImage ? (
        <div className="bg-gray-50 border-b flex items-center justify-center" style={{ minHeight: 140 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={shortName}
            className="max-h-48 max-w-full object-contain p-3"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="bg-gray-50 border-b flex items-center justify-center" style={{ height: 72 }}>
          <span className="font-mono text-sm text-gray-400 uppercase tracking-widest">
            {ext || '?'}
          </span>
        </div>
      )}

      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate" title={shortName}>
            {shortName}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{asset.mime_type ?? 'tipo desconocido'}</p>
          {patchError && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <XCircle className="h-3 w-3 flex-shrink-0" />
              {patchError}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {asset.approved ? (
            <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Aprobado</Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Pendiente</Badge>
          )}

          <Button
            size="sm"
            variant="outline"
            className={`h-7 px-2 text-xs gap-1 ${
              asset.approved
                ? 'text-red-600 hover:bg-red-50 border-red-200'
                : 'text-green-700 hover:bg-green-50 border-green-200'
            }`}
            onClick={() => onToggleApproved(asset.id, asset.approved)}
            disabled={toggling}
          >
            {toggling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : asset.approved ? (
              <><X className="h-3 w-3" /> Rechazar</>
            ) : (
              <><Check className="h-3 w-3" /> Aprobar</>
            )}
          </Button>

          {asset.drive_url && (
            <a
              href={asset.drive_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Ver en Drive"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BrandBookSection
// ─────────────────────────────────────────────────────────────────────────────

function BrandBookSection({
  assets,
  hasContext,
  clientId,
  onToggleApproved,
  togglingIds,
  patchErrors,
}: {
  assets: BrandAssetRow[]
  hasContext: boolean
  clientId: string
  onToggleApproved: (id: string, current: boolean) => void
  togglingIds: Set<string>
  patchErrors: Map<string, string>
}) {
  const router = useRouter()
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)
  const [processSuccess, setProcessSuccess] = useState<{ colors: number; typography: number } | null>(null)
  const isEmpty = assets.length === 0
  const approvedCount = assets.filter((a) => a.approved).length

  async function handleProcess() {
    setProcessing(true)
    setProcessError(null)
    setProcessSuccess(null)
    try {
      const res = await fetch('/api/brand-assets/process-brandbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      })

      let json: Record<string, unknown> = {}
      try {
        json = await res.json()
      } catch {
        setProcessError(`Error del servidor (${res.status})`)
        return
      }

      if (!res.ok) {
        setProcessError((json?.error as string) ?? `Error ${res.status}`)
        return
      }

      const stats = json.stats as { colors: number; typography: number } | undefined
      setProcessSuccess({
        colors:     stats?.colors     ?? 0,
        typography: stats?.typography ?? 0,
      })
      router.refresh()
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Error de red')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Brand Book
          </CardTitle>
          <div className="flex items-center gap-2">
            {!isEmpty && (
              <span className="text-xs text-gray-500">
                {approvedCount}/{assets.length} aprobados
              </span>
            )}
            {hasContext ? (
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Contexto extraído
              </Badge>
            ) : (
              <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs gap-1">
                <Clock className="h-3 w-3" />
                Sin procesar
              </Badge>
            )}
            <Badge variant="outline" className="text-xs font-mono text-gray-500">
              brand-book/
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {isEmpty ? (
          <div className="flex items-center gap-2 py-4 px-3 rounded-lg border border-dashed border-gray-200 bg-gray-50">
            <AlertTriangle className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <p className="text-sm text-gray-500">
              Sin brand book. Añade el PDF a la carpeta{' '}
              <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">brand-book/</span>{' '}
              en Drive y sincroniza.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onToggleApproved={onToggleApproved}
                toggling={togglingIds.has(asset.id)}
                patchError={patchErrors.get(asset.id) ?? null}
              />
            ))}
          </div>
        )}

        {!isEmpty && (
          <div className="pt-1">
            <button
              onClick={handleProcess}
              disabled={processing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {processing
                ? 'Procesando brand book…'
                : hasContext
                ? 'Re-procesar brand book con IA'
                : 'Procesar brand book con IA'}
            </button>
            {processError && (
              <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                <XCircle className="h-3 w-3 flex-shrink-0" />
                {processError}
              </p>
            )}
            {processSuccess && (
              <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                Contexto extraído: {processSuccess.colors} colores · {processSuccess.typography} tipografías
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AssetSection (tipos genéricos)
// ─────────────────────────────────────────────────────────────────────────────

function AssetSection({
  assetType,
  assets,
  onToggleApproved,
  togglingIds,
  patchErrors,
}: {
  assetType: AssetType
  assets: BrandAssetRow[]
  onToggleApproved: (id: string, current: boolean) => void
  togglingIds: Set<string>
  patchErrors: Map<string, string>
}) {
  const isEmpty = assets.length === 0
  const approvedCount = assets.filter((a) => a.approved).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            {ASSET_TYPE_ICON[assetType]}
            {ASSET_TYPE_LABELS[assetType]}
          </CardTitle>
          <div className="flex items-center gap-2">
            {!isEmpty && (
              <span className="text-xs text-gray-500">
                {approvedCount}/{assets.length} aprobados
              </span>
            )}
            <Badge variant="outline" className="text-xs font-mono text-gray-500">
              {DRIVE_FOLDER_NAME[assetType]}/
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isEmpty ? (
          <div className="flex items-center gap-2 py-4 px-3 rounded-lg border border-dashed border-gray-200 bg-gray-50">
            <AlertTriangle className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <p className="text-sm text-gray-500">
              Sin activos. Añade archivos a{' '}
              <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
                {DRIVE_FOLDER_NAME[assetType]}/
              </span>{' '}
              en Drive y sincroniza.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onToggleApproved={onToggleApproved}
                toggling={togglingIds.has(asset.id)}
                patchError={patchErrors.get(asset.id) ?? null}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BrandContextPanel — visualización y edición del contexto extraído
// ─────────────────────────────────────────────────────────────────────────────

function BrandContextPanel({
  clientId,
  context,
  onContextSaved,
}: {
  clientId: string
  context: BrandContextRow
  onContextSaved: (updated: BrandContextRow) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Estado de edición — se inicializa cuando el usuario abre el modo edición
  const [editColors, setEditColors] = useState<StoredColor[]>([])
  const [editFonts, setEditFonts] = useState<StoredFont[]>([])
  const [editTone, setEditTone] = useState('')
  const [editKeywords, setEditKeywords] = useState('')
  const [editRestrictions, setEditRestrictions] = useState('')
  const [editSummary, setEditSummary] = useState('')

  const colors = (context.colors as unknown as StoredColor[]) ?? []
  const fonts = (context.typography as unknown as StoredFont[]) ?? []

  function openEdit() {
    setEditColors(colors.map((c) => ({ ...c })))
    setEditFonts(fonts.map((f) => ({ ...f })))
    setEditTone(context.tone_of_voice ?? '')
    setEditKeywords((context.style_keywords ?? []).join(', '))
    setEditRestrictions(context.restrictions ?? '')
    setEditSummary(context.raw_summary ?? '')
    setSaveError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setSaveError(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const body = {
        colors:         editColors,
        typography:     editFonts,
        tone_of_voice:  editTone,
        style_keywords: editKeywords.split(',').map((k) => k.trim()).filter(Boolean),
        restrictions:   editRestrictions,
        raw_summary:    editSummary,
      }

      const res = await fetch(`/api/brand-context/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      let json: Record<string, unknown> = {}
      try { json = await res.json() } catch { /* noop */ }

      if (!res.ok) {
        setSaveError((json?.error as string) ?? `Error ${res.status}`)
        return
      }

      onContextSaved(json.context as BrandContextRow)
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error de red')
    } finally {
      setSaving(false)
    }
  }

  // ── Subcomponentes del editor ────────────────────────────────────────────

  function ColorEditor() {
    return (
      <div className="space-y-2">
        {editColors.map((color, i) => (
          <div key={i} className="flex items-center gap-2">
            {/* Swatch / color picker */}
            <label className="relative cursor-pointer">
              <span
                className="block w-8 h-8 rounded-full border-2 border-white shadow ring-1 ring-gray-200"
                style={{ backgroundColor: color.hex }}
              />
              <input
                type="color"
                value={color.hex}
                onChange={(e) => {
                  const next = [...editColors]
                  next[i] = { ...next[i], hex: e.target.value }
                  setEditColors(next)
                }}
                className="sr-only"
              />
            </label>
            {/* Hex */}
            <input
              type="text"
              value={color.hex}
              onChange={(e) => {
                const next = [...editColors]
                next[i] = { ...next[i], hex: e.target.value }
                setEditColors(next)
              }}
              className="w-24 text-xs border rounded px-2 py-1 font-mono"
              placeholder="#000000"
            />
            {/* Nombre */}
            <input
              type="text"
              value={color.name}
              onChange={(e) => {
                const next = [...editColors]
                next[i] = { ...next[i], name: e.target.value }
                setEditColors(next)
              }}
              className="flex-1 text-xs border rounded px-2 py-1"
              placeholder="Nombre del color"
            />
            {/* Rol */}
            <select
              value={colorRole(color)}
              onChange={(e) => {
                const next = [...editColors]
                next[i] = { ...next[i], role: e.target.value, usage: e.target.value }
                setEditColors(next)
              }}
              className="text-xs border rounded px-2 py-1 text-gray-600"
            >
              <option value="">— rol —</option>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="accent">Accent</option>
              <option value="neutral">Neutral</option>
              <option value="background">Background</option>
              <option value="text">Text</option>
            </select>
            {/* Eliminar */}
            <button
              onClick={() => setEditColors(editColors.filter((_, j) => j !== i))}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setEditColors([...editColors, { name: '', hex: '#000000', role: '' }])}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
        >
          <Plus className="h-3.5 w-3.5" /> Añadir color
        </button>
      </div>
    )
  }

  function FontEditor() {
    return (
      <div className="space-y-2">
        {editFonts.map((font, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={fontName(font)}
              onChange={(e) => {
                const next = [...editFonts]
                next[i] = { ...next[i], name: e.target.value, family: e.target.value }
                setEditFonts(next)
              }}
              className="flex-1 text-xs border rounded px-2 py-1"
              placeholder="Familia tipográfica"
            />
            <select
              value={fontRole(font)}
              onChange={(e) => {
                const next = [...editFonts]
                next[i] = { ...next[i], role: e.target.value, usage: e.target.value }
                setEditFonts(next)
              }}
              className="text-xs border rounded px-2 py-1 text-gray-600"
            >
              <option value="">— uso —</option>
              <option value="headings">Headings</option>
              <option value="body">Body</option>
              <option value="accent">Accent</option>
              <option value="display">Display</option>
            </select>
            <button
              onClick={() => setEditFonts(editFonts.filter((_, j) => j !== i))}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setEditFonts([...editFonts, { name: '', family: '', role: '' }])}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
        >
          <Plus className="h-3.5 w-3.5" /> Añadir tipografía
        </button>
      </div>
    )
  }

  // ── Vista lectura ────────────────────────────────────────────────────────

  if (!editing) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Contexto de marca extraído
            </CardTitle>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={openEdit}>
              <Pencil className="h-3 w-3" /> Editar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-5">
          {/* Colores */}
          {colors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Paleta de colores
              </p>
              <div className="flex flex-wrap gap-3">
                {colors.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full border border-gray-200 shadow-sm flex-shrink-0"
                      style={{ backgroundColor: c.hex }}
                      title={c.hex}
                    />
                    <div>
                      <p className="text-xs font-medium text-gray-800 leading-tight">{c.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{c.hex}</p>
                      {colorRole(c) && (
                        <p className="text-xs text-gray-400 capitalize">{colorRole(c)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tipografías */}
          {fonts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Tipografías
              </p>
              <div className="flex flex-wrap gap-2">
                {fonts.map((f, i) => (
                  <div key={i} className="rounded-lg border bg-gray-50 px-3 py-2">
                    <p className="text-sm font-semibold text-gray-800">{fontName(f)}</p>
                    {fontRole(f) && (
                      <p className="text-xs text-gray-400 capitalize mt-0.5">{fontRole(f)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tono de voz */}
          {context.tone_of_voice && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Tono de voz
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{context.tone_of_voice}</p>
            </div>
          )}

          {/* Keywords */}
          {context.style_keywords && context.style_keywords.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Palabras clave
              </p>
              <div className="flex flex-wrap gap-1.5">
                {context.style_keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="text-xs">
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Restricciones */}
          {context.restrictions && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Restricciones
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{context.restrictions}</p>
            </div>
          )}

          {/* Resumen */}
          {context.raw_summary && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Resumen de marca
              </p>
              <p className="text-sm text-gray-600 leading-relaxed italic">{context.raw_summary}</p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ── Vista edición ────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Editar contexto de marca
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={cancelEdit} disabled={saving}>
              <X className="h-3 w-3" /> Cancelar
            </Button>
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-5">
        {/* Colores */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Paleta de colores
          </p>
          <ColorEditor />
        </div>

        <Separator />

        {/* Tipografías */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Tipografías
          </p>
          <FontEditor />
        </div>

        <Separator />

        {/* Tono de voz */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
            Tono de voz
          </label>
          <textarea
            value={editTone}
            onChange={(e) => setEditTone(e.target.value)}
            rows={3}
            className="w-full text-sm border rounded-md px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            placeholder="Describe el tono de voz de la marca…"
          />
        </div>

        {/* Keywords */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
            Palabras clave{' '}
            <span className="font-normal text-gray-400 normal-case">(separadas por comas)</span>
          </label>
          <input
            type="text"
            value={editKeywords}
            onChange={(e) => setEditKeywords(e.target.value)}
            className="w-full text-sm border rounded-md px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="innovador, cercano, profesional, …"
          />
        </div>

        {/* Restricciones */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
            Restricciones
          </label>
          <textarea
            value={editRestrictions}
            onChange={(e) => setEditRestrictions(e.target.value)}
            rows={3}
            className="w-full text-sm border rounded-md px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            placeholder="Qué NO se debe hacer…"
          />
        </div>

        {/* Resumen */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
            Resumen de marca
          </label>
          <textarea
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            rows={4}
            className="w-full text-sm border rounded-md px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            placeholder="Descripción general de la marca…"
          />
        </div>

        {saveError && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <XCircle className="h-3 w-3 flex-shrink-0" />
            {saveError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CoveragePanel
// ─────────────────────────────────────────────────────────────────────────────

function CoveragePanel({ coverage }: { coverage: BrandAssetsCoverage }) {
  const checks: { label: string; ok: boolean; required?: boolean }[] = [
    { label: 'Logo aprobado',        ok: coverage.has_logo,           required: true  },
    { label: 'Brand book aprobado',  ok: coverage.has_brand_book,     required: true  },
    { label: 'Contexto extraído',    ok: coverage.has_context,        required: true  },
    { label: 'Imágenes de producto', ok: coverage.has_product_images, required: false },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700">Cobertura de marca</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {checks.map(({ label, ok, required }) => (
          <div key={label} className="flex items-center gap-2">
            {ok ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : (
              <XCircle className={`h-4 w-4 flex-shrink-0 ${required ? 'text-red-400' : 'text-gray-300'}`} />
            )}
            <span className={`text-sm ${ok ? 'text-gray-700' : required ? 'text-gray-500' : 'text-gray-400'}`}>
              {label}
              {required && !ok && <span className="ml-1 text-xs text-red-500">*requerido</span>}
            </span>
          </div>
        ))}

        <Separator />

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total activos</span>
            <span className="font-medium">{coverage.total_assets}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Pendientes de revisión</span>
            <span className={`font-medium ${coverage.pending_review > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
              {coverage.pending_review}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SyncPanel
// ─────────────────────────────────────────────────────────────────────────────

function SyncPanel({ clientId, clientNombre }: { clientId: string; clientNombre: string }) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [result, setResult] = useState<{
    synced: number; new: number; updated: number; errors: string[]
  } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setResult(null)
    setSyncError(null)

    try {
      const res = await fetch('/api/brand-assets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          ...(folderName.trim() ? { folder_name: folderName.trim() } : {}),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setSyncError(json.error ?? 'Error desconocido al sincronizar')
      } else {
        setResult(json)
        router.refresh()
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Error de red')
    } finally {
      setSyncing(false)
    }
  }, [clientId, folderName, router])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Sincronizar con Drive
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-xs text-gray-500">
          Lee la carpeta{' '}
          <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-xs">_brand-assets/</span>{' '}
          del cliente en Drive e importa los archivos que falten.
        </p>

        <div className="space-y-1">
          <label className="text-xs text-gray-500 block">
            Nombre de carpeta en Drive
            <span className="ml-1 text-gray-400">(si difiere del nombre del cliente)</span>
          </label>
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder={clientNombre}
            className="w-full text-sm border rounded-md px-3 py-1.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <Button className="w-full gap-2" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando…' : 'Sincronizar assets'}
        </Button>

        {result && (
          <div className="rounded-lg border bg-green-50 border-green-200 p-3 space-y-1">
            <p className="text-sm font-medium text-green-800">✓ {result.synced} activos procesados</p>
            <p className="text-xs text-green-700">{result.new} nuevos · {result.updated} actualizados</p>
            {result.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-amber-700 flex gap-1">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    {e}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {syncError && (
          <div className="rounded-lg border bg-red-50 border-red-200 p-3">
            <p className="text-sm text-red-700 flex gap-1.5">
              <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {syncError}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function BrandAssetsClient({
  clientId,
  clientNombre,
  initialAssets,
  coverage,
  hasContext: initialHasContext,
  initialContext,
}: Props) {
  const router = useRouter()

  const [assets, setAssets] = useState<BrandAssetRow[]>(initialAssets)
  const [coverageState, setCoverageState] = useState<BrandAssetsCoverage>(coverage)
  const [hasContext, setHasContext] = useState(initialHasContext)
  const [context, setContext] = useState<BrandContextRow | null>(initialContext)

  // togglingIds: Set de IDs con PATCH en curso — permite múltiples concurrentes
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  // Map<assetId, errorMessage> — errores de PATCH por activo
  const [patchErrors, setPatchErrors] = useState<Map<string, string>>(new Map())

  // Ref para saber si hay operaciones pendientes antes de aplicar sync del servidor
  const pendingRef = useRef(0)

  // Sincronizar estado local cuando el Server Component re-renderiza.
  // Solo se aplica si no hay operaciones en curso (evita race condition).
  useEffect(() => {
    if (pendingRef.current === 0) setAssets(initialAssets)
  }, [initialAssets])

  useEffect(() => {
    if (pendingRef.current === 0) {
      setCoverageState(coverage)
      setHasContext(coverage.has_context)
    }
  }, [coverage])

  useEffect(() => {
    setContext(initialContext)
  }, [initialContext])

  // Agrupa activos por tipo
  const byType: Record<AssetType, BrandAssetRow[]> = {
    logo: [], brand_book: [], product_image: [], reference_ad: [], template: [], font: [], color: [],
  }
  for (const asset of assets) {
    byType[asset.asset_type as AssetType]?.push(asset)
  }

  const handleToggleApproved = useCallback(async (id: string, currentApproved: boolean) => {
    // Marca el ID como en progreso
    pendingRef.current += 1
    setTogglingIds((prev) => new Set(prev).add(id))
    setPatchErrors((prev) => { const m = new Map(prev); m.delete(id); return m })

    try {
      const res = await fetch(`/api/brand-assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: !currentApproved }),
      })

      let json: Record<string, unknown> = {}
      try {
        json = await res.json()
      } catch {
        setPatchErrors((prev) => new Map(prev).set(id, `Error del servidor (${res.status})`))
        return
      }

      if (!res.ok) {
        const msg = (json?.error as string) ?? `Error ${res.status}`
        setPatchErrors((prev) => new Map(prev).set(id, msg))
        return
      }

      const updatedAsset = json.asset as BrandAssetRow

      setAssets((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, approved: updatedAsset.approved } : a))

        const approvedByType = (type: AssetType) =>
          next.some((a) => a.asset_type === type && a.approved)

        const hasLogo          = approvedByType('logo')
        const hasBrandBook     = approvedByType('brand_book')
        const hasProductImages = approvedByType('product_image')
        const pendingReview    = next.filter((a) => !a.approved).length

        let generation_status: GenerationStatus = 'blocked'
        if (hasLogo && hasContext) generation_status = 'ready'
        else if (hasLogo)          generation_status = 'pending'

        setCoverageState((prev) => ({
          ...prev,
          has_logo:           hasLogo,
          has_brand_book:     hasBrandBook,
          has_product_images: hasProductImages,
          total_assets:       next.length,
          pending_review:     pendingReview,
          generation_status,
        }))

        return next
      })
    } finally {
      pendingRef.current = Math.max(0, pendingRef.current - 1)
      setTogglingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
    // No llamamos a router.refresh() aquí: el estado de aprobación ya se
    // actualiza de forma optimista con setAssets + setCoverageState.
    // Llamar a refresh causaba que el useEffect([initialAssets]) sobreescribiera
    // el estado local con datos del servidor potencialmente desactualizados,
    // revirtiendo visualmente la aprobación aunque el PATCH hubiera tenido éxito.
  }, [hasContext])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Biblioteca de activos de marca</h2>
          <p className="text-sm text-gray-500 mt-0.5">{clientNombre}</p>
        </div>
        <GenerationStatusBadge status={coverageState.generation_status} />
      </div>

      <Separator />

      {/* Layout: grid principal + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-4">
          {ASSET_TYPE_ORDER.map((assetType) =>
            assetType === 'brand_book' ? (
              <BrandBookSection
                key="brand_book"
                assets={byType['brand_book']}
                hasContext={hasContext}
                clientId={clientId}
                onToggleApproved={handleToggleApproved}
                togglingIds={togglingIds}
                patchErrors={patchErrors}
              />
            ) : (
              <AssetSection
                key={assetType}
                assetType={assetType}
                assets={byType[assetType]}
                onToggleApproved={handleToggleApproved}
                togglingIds={togglingIds}
                patchErrors={patchErrors}
              />
            ),
          )}

          {/* Panel de contexto — aparece si hay datos extraídos */}
          {context && (
            <BrandContextPanel
              clientId={clientId}
              context={context}
              onContextSaved={(updated) => setContext(updated)}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <CoveragePanel coverage={coverageState} />
          <SyncPanel clientId={clientId} clientNombre={clientNombre} />
        </div>
      </div>
    </div>
  )
}
