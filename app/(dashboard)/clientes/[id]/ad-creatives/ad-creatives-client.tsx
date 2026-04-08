'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus,
  Download,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  Megaphone,
  BookOpen,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PublicationIntent = 'organic_informative' | 'organic_brand' | 'paid_campaign'
type AdFormat          = '1x1' | '9x16' | '1.91x1'
type CreativeStatus    = 'draft' | 'approved' | 'rejected'

export interface AdCreative {
  id:                 string
  client_id:          string
  brief:              string
  publication_intent: PublicationIntent
  copy:               {
    headline?: string
    caption?:  string
    tagline?:  string
    body?:     string
    cta?:      string
  }
  image_url:          string | null
  format:             AdFormat
  model_used:         string | null
  variation_index:    number
  status:             CreativeStatus
  batch_id:           string
  campaign_name:      string | null
  created_at:         string
}

interface CampaignGroup {
  batch_id:           string
  campaign_name:      string | null
  brief:              string
  publication_intent: PublicationIntent
  creatives:          AdCreative[]
  created_at:         string
}

/** Parámetros que el modal pasa al padre para iniciar la generación */
interface GenerationParams {
  id:              string          // ID temporal del cliente para la UI
  campaignName:    string          // Nombre de la campaña para mostrar en UI
  brief:           string
  intent:          PublicationIntent
  formats:         AdFormat[]
  campaignNameRaw?: string         // Nombre real para la BD
  sourceContent?:  string
}

/** Campaña en curso de generación (muestra skeletons) */
interface PendingCampaign {
  id:            string
  campaignName:  string
  intent:        PublicationIntent
  formats:       AdFormat[]
  skeletonCount: number
}

/** Toast de estado de generación */
interface GenerationToast {
  id:           string
  campaignName: string
  type:         'loading' | 'success' | 'error'
  count?:       number
  message?:     string
}

interface Props {
  clientId:              string
  clientNombre:          string
  initialCreatives:      AdCreative[]
  openModalOnMount?:     boolean
  prefillSourceContent?: string
  prefillIntent?:        PublicationIntent
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const INTENT_LABELS: Record<PublicationIntent, string> = {
  organic_informative: 'Orgánico informativo',
  organic_brand:       'Orgánico de marca',
  paid_campaign:       'Campaña de pago',
}

const INTENT_COLORS: Record<PublicationIntent, string> = {
  organic_informative: 'bg-blue-100 text-blue-700 border-blue-200',
  organic_brand:       'bg-violet-100 text-violet-700 border-violet-200',
  paid_campaign:       'bg-amber-100 text-amber-700 border-amber-200',
}

const INTENT_ICONS: Record<PublicationIntent, React.ReactNode> = {
  organic_informative: <BookOpen className="h-3.5 w-3.5" />,
  organic_brand:       <Sparkles className="h-3.5 w-3.5" />,
  paid_campaign:       <Megaphone className="h-3.5 w-3.5" />,
}

const STATUS_LABELS: Record<CreativeStatus, string> = {
  draft:    'Borrador',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

const STATUS_COLORS: Record<CreativeStatus, string> = {
  draft:    'bg-gray-100 text-gray-600 border-gray-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-600 border-red-200',
}

const FORMAT_LABELS: Record<AdFormat, string> = {
  '1x1':    '1:1 Feed',
  '9x16':   '9:16 Story',
  '1.91x1': '1.91:1 Display',
}

const ALL_FORMATS: AdFormat[] = ['1x1', '9x16', '1.91x1']

/** Número de variaciones por intent (espejo del servidor, para calcular skeletons) */
const VARIATION_COUNT_CLIENT: Record<PublicationIntent, number> = {
  organic_informative: 3,
  organic_brand:       3,
  paid_campaign:       5,
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function groupByBatch(creatives: AdCreative[]): CampaignGroup[] {
  const map = new Map<string, CampaignGroup>()
  for (const c of creatives) {
    if (!map.has(c.batch_id)) {
      map.set(c.batch_id, {
        batch_id:           c.batch_id,
        campaign_name:      c.campaign_name,
        brief:              c.brief,
        publication_intent: c.publication_intent,
        creatives:          [],
        created_at:         c.created_at,
      })
    }
    map.get(c.batch_id)!.creatives.push(c)
  }
  return Array.from(map.values())
}

function buildSkeletonFormats(intent: PublicationIntent, formats: AdFormat[]): AdFormat[] {
  const count = VARIATION_COUNT_CLIENT[intent]
  const result: AdFormat[] = []
  for (let v = 0; v < count; v++) {
    for (const f of formats) result.push(f)
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// SkeletonCard — animated placeholder while generating
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard({ format }: { format: AdFormat }) {
  const aspectClass =
    format === '9x16'   ? 'aspect-[9/16]'   :
    format === '1.91x1' ? 'aspect-[1.91/1]' : 'aspect-square'

  return (
    <Card className="overflow-hidden">
      <div className={`${aspectClass} bg-gradient-to-br from-gray-200 to-gray-100 animate-pulse`} />
      <CardContent className="p-3 space-y-2">
        <div className="h-3.5 bg-gray-200 rounded-full animate-pulse w-5/6" />
        <div className="h-3 bg-gray-100 rounded-full animate-pulse w-4/6" />
        <div className="h-3 bg-gray-100 rounded-full animate-pulse w-3/6" />
        <div className="flex gap-1 pt-1">
          <div className="flex-1 h-7 bg-gray-100 rounded-md animate-pulse" />
          <div className="flex-1 h-7 bg-gray-100 rounded-md animate-pulse" />
          <div className="h-7 w-8 bg-gray-100 rounded-md animate-pulse" />
          <div className="h-7 w-8 bg-gray-100 rounded-md animate-pulse" />
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PendingCampaignSection — skeleton section shown during generation
// ─────────────────────────────────────────────────────────────────────────────

function PendingCampaignSection({ pending }: { pending: PendingCampaign }) {
  const skeletonFormats = buildSkeletonFormats(pending.intent, pending.formats)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className={`gap-1 text-xs ${INTENT_COLORS[pending.intent]}`}>
          {INTENT_ICONS[pending.intent]}
          {INTENT_LABELS[pending.intent]}
        </Badge>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500 flex-shrink-0" />
          <span className="font-medium text-gray-700 truncate max-w-xs">
            {pending.campaignName}
          </span>
          <span className="text-gray-400">— generando copy e imágenes con IA…</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {skeletonFormats.map((format, i) => (
          <SkeletonCard key={i} format={format} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GenerationToastBanner — status bar above the gallery
// ─────────────────────────────────────────────────────────────────────────────

function GenerationToastBanner({ toast }: { toast: GenerationToast }) {
  if (toast.type === 'loading') {
    return (
      <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
        <Loader2 className="h-4 w-4 text-indigo-500 animate-spin flex-shrink-0" />
        <p className="text-sm text-indigo-700">
          Generando campaña <span className="font-semibold">"{toast.campaignName}"</span>…
          Esto puede tardar 30-60 segundos.
        </p>
      </div>
    )
  }
  if (toast.type === 'success') {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
        <p className="text-sm text-green-700">
          Campaña <span className="font-semibold">"{toast.campaignName}"</span> lista
          — {toast.count} creativos generados
        </p>
      </div>
    )
  }
  if (toast.type === 'error') {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        <p className="text-sm text-red-700">
          Error generando <span className="font-semibold">"{toast.campaignName}"</span>: {toast.message}
        </p>
      </div>
    )
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// CreativeLightbox
// ─────────────────────────────────────────────────────────────────────────────

function CreativeLightbox({
  creatives,
  initialIdx,
  onClose,
  onStatusChange,
  onEdit,
}: {
  creatives:      AdCreative[]
  initialIdx:     number
  onClose:        () => void
  onStatusChange: (id: string, status: CreativeStatus) => void
  onEdit:         (creative: AdCreative) => void
}) {
  const [idx, setIdx]                     = useState(initialIdx)
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null)
  const [imgError, setImgError]           = useState(false)

  const creative = creatives[idx]
  const hasPrev  = idx > 0
  const hasNext  = idx < creatives.length - 1

  useEffect(() => { setImgError(false) }, [idx])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')                    { onClose(); return }
      if (e.key === 'ArrowLeft'  && hasPrev)  setIdx((i) => i - 1)
      if (e.key === 'ArrowRight' && hasNext)  setIdx((i) => i + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasPrev, hasNext, onClose])

  async function handleStatus(status: CreativeStatus) {
    setActionLoading(status === 'approved' ? 'approve' : 'reject')
    try {
      const res = await fetch(`/api/ad-creatives/${creative.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ status }),
      })
      if (res.ok) onStatusChange(creative.id, status)
    } finally {
      setActionLoading(null)
    }
  }

  const { copy } = creative

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-white rounded-xl overflow-hidden flex flex-col md:flex-row max-h-[92vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/75 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Image */}
        <div className="relative flex-1 bg-gray-950 flex items-center justify-center min-h-[240px] overflow-hidden">
          {creative.image_url && !imgError ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={creative.image_url}
              alt={copy.headline ?? ''}
              className="max-h-[92vh] max-w-full object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-600">
              <ImageIcon className="h-12 w-12" />
              <span className="text-sm">Sin imagen</span>
            </div>
          )}

          {hasPrev && (
            <button
              onClick={() => setIdx((i) => i - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/75 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={() => setIdx((i) => i + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/75 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full">
            {idx + 1} / {creatives.length}
          </div>
        </div>

        {/* Info */}
        <div className="w-full md:w-72 flex flex-col overflow-y-auto border-t md:border-t-0 md:border-l border-gray-100">
          <div className="flex-1 p-5 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge className={`text-xs gap-1 ${INTENT_COLORS[creative.publication_intent]}`}>
                {INTENT_ICONS[creative.publication_intent]}
                {INTENT_LABELS[creative.publication_intent]}
              </Badge>
              <Badge className="text-xs bg-gray-100 text-gray-600 border-gray-200">
                {FORMAT_LABELS[creative.format]}
              </Badge>
            </div>

            <Badge className={`text-xs w-fit ${STATUS_COLORS[creative.status]}`}>
              {STATUS_LABELS[creative.status]}
            </Badge>

            <div className="space-y-3">
              {copy.headline && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Headline</p>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{copy.headline}</p>
                </div>
              )}
              {(copy.body || copy.caption) && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">
                    {copy.caption !== undefined ? 'Caption' : 'Cuerpo'}
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed">{copy.body ?? copy.caption}</p>
                </div>
              )}
              {copy.tagline && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Tagline</p>
                  <p className="text-sm text-gray-600 italic">{copy.tagline}</p>
                </div>
              )}
              {copy.cta && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">CTA</p>
                  <span className="inline-block text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md">
                    {copy.cta}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-gray-100 space-y-2">
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline"
                className="flex-1 h-8 gap-1 text-green-700 border-green-200 hover:bg-green-50 disabled:opacity-50"
                onClick={() => handleStatus('approved')}
                disabled={actionLoading !== null || creative.status === 'approved'}
              >
                {actionLoading === 'approve'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                Aprobar
              </Button>
              <Button
                size="sm" variant="outline"
                className="flex-1 h-8 gap-1 text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                onClick={() => handleStatus('rejected')}
                disabled={actionLoading !== null || creative.status === 'rejected'}
              >
                {actionLoading === 'reject'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <XCircle className="h-3.5 w-3.5" />}
                Rechazar
              </Button>
            </div>
            <Button
              size="sm" variant="outline"
              className="w-full h-8 gap-1.5 text-gray-600"
              onClick={() => { onClose(); onEdit(creative) }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar copy
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EditCreativeDrawer
// ─────────────────────────────────────────────────────────────────────────────

function EditCreativeDrawer({
  creative,
  onClose,
  onCopyUpdated,
  onStartRegenerate,
  onStartVariants,
}: {
  creative:           AdCreative
  onClose:            () => void
  onCopyUpdated:      (id: string, copy: AdCreative['copy']) => void
  /** Guardar copy (ya hecho en el drawer) + lanzar regeneración de imagen en background */
  onStartRegenerate:  (creative: AdCreative, savedCopy: AdCreative['copy']) => void
  /** Lanzar generación de 3 variantes en background */
  onStartVariants:    (creative: AdCreative) => void
}) {
  const isCaption = creative.publication_intent === 'organic_informative'
  const isBrand   = creative.publication_intent === 'organic_brand'

  const [headline,       setHeadline]       = useState(creative.copy.headline ?? '')
  const [bodyText,       setBodyText]       = useState(creative.copy.body ?? creative.copy.caption ?? '')
  const [tagline,        setTagline]        = useState(creative.copy.tagline ?? '')
  const [cta,            setCta]            = useState(creative.copy.cta ?? '')
  const [saving,  setSaving]  = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  /** Construye el objeto copy a partir de los campos del formulario */
  function buildCurrentCopy(): Record<string, string> {
    const copy: Record<string, string> = {}
    if (headline.trim())  copy.headline = headline.trim()
    if (bodyText.trim())  isCaption ? (copy.caption = bodyText.trim()) : (copy.body = bodyText.trim())
    if (tagline.trim())   copy.tagline  = tagline.trim()
    if (cta.trim())       copy.cta      = cta.trim()
    return copy
  }

  async function handleSave() {
    setSaving(true); setError(null); setSavedOk(false)
    try {
      const copy = buildCurrentCopy()

      const res = await fetch(`/api/ad-creatives/${creative.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ copy }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError((json as { error?: string }).error ?? 'Error al guardar')
        return
      }
      onCopyUpdated(creative.id, copy as AdCreative['copy'])
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } finally { setSaving(false) }
  }

  /** Guarda el copy en Supabase (bloqueante, rápido) y luego lanza la regeneración en background */
  async function handleRegenerate() {
    setSaving(true); setError(null)
    const copy = buildCurrentCopy()
    try {
      const res = await fetch(`/api/ad-creatives/${creative.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ copy }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError((json as { error?: string }).error ?? 'Error al guardar')
        return
      }
      onCopyUpdated(creative.id, copy as AdCreative['copy'])
    } catch {
      setError('Error de red al guardar')
      return
    } finally { setSaving(false) }

    // Copy guardado — lanzar regeneración en background y cerrar
    onStartRegenerate(creative, copy as AdCreative['copy'])
    onClose()
  }

  /** Lanza la generación de variantes en background (no bloqueante) y cierra */
  function handleGenerateVariants() {
    onStartVariants(creative)
    onClose()
  }

  const busy = saving

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose() }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-indigo-600" />
            Editar creative
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex gap-2 flex-wrap">
            <Badge className={`text-xs gap-1 ${INTENT_COLORS[creative.publication_intent]}`}>
              {INTENT_ICONS[creative.publication_intent]}
              {INTENT_LABELS[creative.publication_intent]}
            </Badge>
            <Badge className="text-xs bg-gray-100 text-gray-600 border-gray-200">
              {FORMAT_LABELS[creative.format]}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Headline</label>
            <input
              type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} disabled={busy}
              className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              placeholder="Titular principal…"
            />
          </div>

          {(!isBrand || creative.copy.body !== undefined || creative.copy.caption !== undefined) && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {isCaption ? 'Caption' : 'Cuerpo del anuncio'}
              </label>
              <textarea
                value={bodyText} onChange={(e) => setBodyText(e.target.value)} disabled={busy} rows={3}
                className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 resize-none"
                placeholder="Texto principal…"
              />
            </div>
          )}

          {(isBrand || creative.copy.tagline !== undefined) && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Tagline</label>
              <input
                type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} disabled={busy}
                className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                placeholder="Frase de marca corta…"
              />
            </div>
          )}

          {creative.copy.cta !== undefined && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Call to Action</label>
              <input
                type="text" value={cta} onChange={(e) => setCta(e.target.value)} disabled={busy}
                className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                placeholder="Ej: Empieza ahora…"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}
            </p>
          )}

          <Separator />

          <div className="space-y-2">
            <Button className="w-full gap-2" onClick={handleSave} disabled={busy}>
              {saving   ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando…</>
              : savedOk ? <><CheckCircle2 className="h-4 w-4" />Copy guardado</>
              :           <>Guardar copy</>}
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={handleRegenerate} disabled={busy}>
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando…</>
                : <><RefreshCw className="h-4 w-4" />Regenerar imagen</>}
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={handleGenerateVariants} disabled={busy}>
              <Sparkles className="h-4 w-4" />Generar 3 variantes
            </Button>
          </div>
          <p className="text-xs text-center text-gray-400">
            Regenerar y Generar variantes ocurren en segundo plano. El drawer se cerrará inmediatamente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CreativeCard
// ─────────────────────────────────────────────────────────────────────────────

function CreativeCard({
  creative,
  onStatusChange,
  onRegenerate,
  onOpenLightbox,
  onEdit,
}: {
  creative:       AdCreative
  onStatusChange: (id: string, status: CreativeStatus) => void
  onRegenerate:   (id: string) => void
  onOpenLightbox: () => void
  onEdit:         () => void
}) {
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | 'regen' | null>(null)
  const [imgError, setImgError]           = useState(false)
  const [expanded, setExpanded]           = useState(false)

  async function handleStatus(status: CreativeStatus) {
    setActionLoading(status === 'approved' ? 'approve' : 'reject')
    try {
      const res = await fetch(`/api/ad-creatives/${creative.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ status }),
      })
      if (res.ok) onStatusChange(creative.id, status)
    } finally { setActionLoading(null) }
  }

  async function handleRegenerate() {
    setActionLoading('regen')
    try {
      const res = await fetch(`/api/ad-creatives/${creative.id}/regenerate`, { method: 'POST' })
      if (res.ok) {
        const { creative: updated } = await res.json()
        onRegenerate(updated.id)
      }
    } finally { setActionLoading(null) }
  }

  const { copy } = creative
  const primaryText   = copy.headline ?? ''
  const secondaryText = copy.caption ?? copy.tagline ?? copy.body ?? ''
  const cta           = copy.cta

  const aspectClass =
    creative.format === '9x16'   ? 'aspect-[9/16]'   :
    creative.format === '1.91x1' ? 'aspect-[1.91/1]' : 'aspect-square'

  const hasLongCopy = primaryText.length > 60 || secondaryText.length > 80

  return (
    <Card className="overflow-hidden group hover:shadow-md transition-shadow">
      <div
        className={`relative bg-gray-100 ${aspectClass} overflow-hidden cursor-pointer`}
        onClick={onOpenLightbox}
      >
        {creative.image_url && !imgError ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={creative.image_url}
            alt={primaryText}
            className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-400">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs">{creative.image_url ? 'Error cargando imagen' : 'Sin imagen'}</span>
          </div>
        )}

        <div className="absolute top-2 left-2">
          <span className="text-xs bg-black/60 text-white px-2 py-0.5 rounded-full font-medium">
            {FORMAT_LABELS[creative.format]}
          </span>
        </div>
        <div className="absolute top-2 right-2">
          <Badge className={`text-xs ${STATUS_COLORS[creative.status]}`}>
            {STATUS_LABELS[creative.status]}
          </Badge>
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="text-white text-xs bg-black/50 px-2 py-1 rounded-full">Ver a tamaño completo</span>
        </div>
      </div>

      <CardContent className="p-3 space-y-2">
        {primaryText && (
          <p className={`text-sm font-semibold text-gray-900 leading-snug ${expanded ? '' : 'line-clamp-2'}`}>
            {primaryText}
          </p>
        )}
        {secondaryText && (
          <p className={`text-xs text-gray-500 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
            {secondaryText}
          </p>
        )}
        {cta && (
          <span className="inline-block text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
            {cta}
          </span>
        )}
        {hasLongCopy && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            {expanded ? 'Ver menos' : 'Ver más'}
          </button>
        )}

        <div className="flex gap-1 pt-1">
          <Button
            size="sm" variant="outline"
            className="flex-1 h-7 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50 disabled:opacity-50"
            onClick={() => handleStatus('approved')}
            disabled={actionLoading !== null || creative.status === 'approved'}
          >
            {actionLoading === 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Aprobar
          </Button>
          <Button
            size="sm" variant="outline"
            className="flex-1 h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
            onClick={() => handleStatus('rejected')}
            disabled={actionLoading !== null || creative.status === 'rejected'}
          >
            {actionLoading === 'reject' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            Rechazar
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-7 px-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            onClick={handleRegenerate} disabled={actionLoading !== null} title="Regenerar imagen"
          >
            {actionLoading === 'regen' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-7 px-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            onClick={onEdit} disabled={actionLoading !== null} title="Editar copy"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CampaignSection
// ─────────────────────────────────────────────────────────────────────────────

function CampaignSection({
  group,
  onStatusChange,
  onRegenerate,
  onOpenLightbox,
  onEdit,
}: {
  group:          CampaignGroup
  onStatusChange: (id: string, status: CreativeStatus) => void
  onRegenerate:   (id: string) => void
  onOpenLightbox: (creatives: AdCreative[], idx: number) => void
  onEdit:         (creative: AdCreative) => void
}) {
  const date = new Date(group.created_at).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`gap-1 text-xs ${INTENT_COLORS[group.publication_intent]}`}>
              {INTENT_ICONS[group.publication_intent]}
              {INTENT_LABELS[group.publication_intent]}
            </Badge>
            <span className="text-xs text-gray-400">{date}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">{group.creatives.length} creativos</span>
          </div>
          <h3 className="mt-1 text-sm font-medium text-gray-700 line-clamp-2">
            {group.campaign_name ?? group.brief}
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {group.creatives.map((creative, idx) => (
          <CreativeCard
            key={creative.id}
            creative={creative}
            onStatusChange={onStatusChange}
            onRegenerate={onRegenerate}
            onOpenLightbox={() => onOpenLightbox(group.creatives, idx)}
            onEdit={() => onEdit(creative)}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NewCampaignModal — solo validación y formulario, delega la llamada al padre
// ─────────────────────────────────────────────────────────────────────────────

function NewCampaignModal({
  open,
  onClose,
  onStartGeneration,
  prefillSourceContent,
  prefillIntent,
}: {
  open:                 boolean
  onClose:              () => void
  onStartGeneration:    (params: GenerationParams) => void
  prefillSourceContent?: string
  prefillIntent?:        PublicationIntent
}) {
  const [brief,         setBrief]         = useState('')
  const [intent,        setIntent]        = useState<PublicationIntent>(prefillIntent ?? 'paid_campaign')
  const [formats,       setFormats]       = useState<AdFormat[]>(['1x1', '9x16'])
  const [campaignName,  setCampaignName]  = useState('')
  const [sourceContent, setSourceContent] = useState(prefillSourceContent ?? '')
  const [error,         setError]         = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      if (prefillSourceContent) setSourceContent(prefillSourceContent)
      if (prefillIntent)        setIntent(prefillIntent)
    }
  }, [open, prefillSourceContent, prefillIntent])

  function toggleFormat(f: AdFormat) {
    setFormats((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f])
  }

  function handleGenerate() {
    if (!brief.trim())      { setError('El brief es obligatorio'); return }
    if (!formats.length)    { setError('Selecciona al menos un formato'); return }

    const name = campaignName.trim() || brief.trim().slice(0, 50)

    onStartGeneration({
      id:              crypto.randomUUID(),
      campaignName:    name,
      brief:           brief.trim(),
      intent,
      formats,
      campaignNameRaw: campaignName.trim() || undefined,
      sourceContent:   intent === 'organic_informative' && sourceContent.trim()
        ? sourceContent.trim()
        : undefined,
    })

    // Reset + cerrar inmediatamente
    setBrief(''); setCampaignName(''); setSourceContent('')
    setFormats(['1x1', '9x16']); setIntent('paid_campaign'); setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            Nueva campaña de creativos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Campaign name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Nombre de campaña <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ej: Oposiciones Policía Nacional — Primavera 2026"
              className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Brief */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Brief <span className="text-red-500">*</span>
            </label>
            <textarea
              value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
              placeholder="Describe el objetivo de la pieza: producto, público, mensaje clave, oferta…"
              className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Intent */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Tipo de publicación</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(INTENT_LABELS) as [PublicationIntent, string][]).map(([value, label]) => (
                <button
                  key={value} type="button" onClick={() => setIntent(value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-center text-xs font-medium transition-all ${
                    intent === value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">{INTENT_ICONS[value]}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Formats */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Formatos <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              {ALL_FORMATS.map((f) => (
                <button
                  key={f} type="button" onClick={() => toggleFormat(f)}
                  className={`flex-1 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                    formats.includes(f)
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">Se generará una imagen por cada variación × formato</p>
          </div>

          {/* Source content */}
          {intent === 'organic_informative' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Texto fuente <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <textarea
                value={sourceContent} onChange={(e) => setSourceContent(e.target.value)} rows={4}
                placeholder="Pega aquí el texto del post del que quieres hacer la creatividad…"
                className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <XCircle className="h-4 w-4 flex-shrink-0" />{error}
            </p>
          )}

          <Button className="w-full gap-2" onClick={handleGenerate}>
            <Sparkles className="h-4 w-4" />
            Generar creativos
          </Button>

          <p className="text-xs text-center text-gray-400">
            La generación ocurre en segundo plano. El modal se cerrará inmediatamente
            y verás el progreso en la galería.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DownloadBar
// ─────────────────────────────────────────────────────────────────────────────

function DownloadBar({ clientId, approvedCount }: { clientId: string; approvedCount: number }) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/ad-creatives/download?client_id=${clientId}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ?? 'creatives.zip'
      a.click()
      URL.revokeObjectURL(url)
    } finally { setDownloading(false) }
  }

  return (
    <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
      <span className="text-sm font-medium text-gray-700">
        {approvedCount} creativo{approvedCount !== 1 ? 's' : ''} aprobado{approvedCount !== 1 ? 's' : ''}
      </span>
      <Button
        size="sm" className="h-8 gap-1.5 ml-auto bg-green-600 hover:bg-green-700"
        onClick={handleDownload} disabled={downloading}
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Descargar ZIP
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AdCreativesClient — componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function AdCreativesClient({
  clientId,
  clientNombre,
  initialCreatives,
  openModalOnMount,
  prefillSourceContent,
  prefillIntent,
}: Props) {
  const router     = useRouter()
  const mountedRef = useRef(false)

  const [creatives,        setCreatives]        = useState<AdCreative[]>(initialCreatives)
  const [modalOpen,        setModalOpen]        = useState(false)
  const [lightbox,         setLightbox]         = useState<{ batchId: string; idx: number } | null>(null)
  const [editingCreative,  setEditingCreative]  = useState<AdCreative | null>(null)
  const [pendingCampaigns, setPendingCampaigns] = useState<PendingCampaign[]>([])
  const [toasts,           setToasts]           = useState<GenerationToast[]>([])

  useEffect(() => { setCreatives(initialCreatives) }, [initialCreatives])

  useEffect(() => {
    if (!mountedRef.current && openModalOnMount) setModalOpen(true)
    mountedRef.current = true
  }, [openModalOnMount])

  const campaigns     = groupByBatch(creatives)
  const approvedCount = creatives.filter((c) => c.status === 'approved').length

  const lightboxCreatives = lightbox
    ? campaigns.find((g) => g.batch_id === lightbox.batchId)?.creatives ?? []
    : []

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStatusChange = useCallback((id: string, status: CreativeStatus) => {
    setCreatives((prev) => prev.map((c) => c.id === id ? { ...c, status } : c))
  }, [])

  const handleRegenerate = useCallback((_id: string) => {
    router.refresh()
  }, [router])

  const handleCopyUpdated = useCallback((id: string, copy: AdCreative['copy']) => {
    setCreatives((prev) => prev.map((c) => c.id === id ? { ...c, copy } : c))
    setEditingCreative((prev) => prev?.id === id ? { ...prev, copy } : prev)
  }, [])

  /**
   * Actualiza el copy en estado de forma optimista (ya guardado en Supabase por el drawer),
   * luego regenera la imagen en background con un toast de progreso.
   */
  const handleStartRegenerate = useCallback((creative: AdCreative, savedCopy: AdCreative['copy']) => {
    // Actualizar copy en estado inmediatamente
    setCreatives((prev) => prev.map((c) =>
      c.id === creative.id ? { ...c, copy: savedCopy } : c
    ))

    const toastId  = crypto.randomUUID()
    const label    = creative.campaign_name ?? creative.brief.slice(0, 40)
    setToasts((prev) => [{ id: toastId, campaignName: `Imagen: ${label}`, type: 'loading' }, ...prev])

    void (async () => {
      try {
        const res = await fetch(`/api/ad-creatives/${creative.id}/regenerate`, { method: 'POST' })
        if (!res.ok) {
          const json = await res.json().catch(() => ({})) as Record<string, unknown>
          setToasts((prev) => prev.map((t) =>
            t.id === toastId
              ? { ...t, type: 'error', message: (json.error as string) ?? 'Error al regenerar' }
              : t
          ))
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 6000)
          return
        }
        const { creative: updated } = await res.json() as { creative: AdCreative }
        setCreatives((prev) => prev.map((c) =>
          c.id === updated.id ? { ...c, image_url: updated.image_url } : c
        ))
        setToasts((prev) => prev.map((t) =>
          t.id === toastId ? { ...t, type: 'success', count: 1 } : t
        ))
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 4000)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error de red'
        setToasts((prev) => prev.map((t) =>
          t.id === toastId ? { ...t, type: 'error', message: msg } : t
        ))
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 6000)
      }
    })()
  }, [])

  /**
   * Genera 3 variantes del creative en background, igual que handleStartGeneration
   * pero con variation_count:3 y source_creative_id para trazabilidad.
   */
  const handleStartVariants = useCallback((creative: AdCreative) => {
    const id           = crypto.randomUUID()
    const campaignName = creative.campaign_name ?? creative.brief.slice(0, 40)

    setPendingCampaigns((prev) => [
      { id, campaignName, intent: creative.publication_intent, formats: [creative.format], skeletonCount: 3 },
      ...prev,
    ])
    setToasts((prev) => [{ id, campaignName, type: 'loading' }, ...prev])

    void (async () => {
      try {
        const res = await fetch('/api/ad-creatives/generate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:          clientId,
            brief:              creative.brief,
            publication_intent: creative.publication_intent,
            formats:            [creative.format],
            campaign_name:      creative.campaign_name ?? undefined,
            variation_count:    3,
            source_creative_id: creative.id,
          }),
        })

        const json = await res.json().catch(() => ({})) as Record<string, unknown>
        setPendingCampaigns((prev) => prev.filter((p) => p.id !== id))

        if (!res.ok) {
          setToasts((prev) => prev.map((t) =>
            t.id === id
              ? { ...t, type: 'error', message: (json.error as string) ?? `Error ${res.status}` }
              : t
          ))
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000)
          return
        }

        const newCreatives = (json.creatives as AdCreative[]) ?? []
        setCreatives((prev) => [...newCreatives, ...prev])
        setToasts((prev) => prev.map((t) =>
          t.id === id ? { ...t, type: 'success', count: newCreatives.length } : t
        ))
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error de red'
        setPendingCampaigns((prev) => prev.filter((p) => p.id !== id))
        setToasts((prev) => prev.map((t) =>
          t.id === id ? { ...t, type: 'error', message: msg } : t
        ))
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000)
      }
    })()
  }, [clientId])

  const handleOpenLightbox = useCallback((groupCreatives: AdCreative[], idx: number) => {
    if (!groupCreatives.length) return
    setLightbox({ batchId: groupCreatives[0].batch_id, idx })
  }, [])

  /**
   * Inicia la generación en background:
   * 1. Cierra el modal (ya cerrado por el modal mismo)
   * 2. Añade skeleton section + toast de carga
   * 3. Lanza fetch sin await desde la UI
   * 4. Al terminar: reemplaza skeletons por creativos reales, actualiza toast
   */
  const handleStartGeneration = useCallback((params: GenerationParams) => {
    const { id, campaignName, brief, intent, formats, campaignNameRaw, sourceContent } = params

    const skeletonCount = VARIATION_COUNT_CLIENT[intent] * formats.length

    setPendingCampaigns((prev) => [
      { id, campaignName, intent, formats, skeletonCount },
      ...prev,
    ])
    setToasts((prev) => [{ id, campaignName, type: 'loading' }, ...prev])

    // Fire and forget — no await aquí para no bloquear la UI
    void (async () => {
      try {
        const res = await fetch('/api/ad-creatives/generate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:          clientId,
            brief,
            publication_intent: intent,
            formats,
            campaign_name:      campaignNameRaw,
            source_content:     sourceContent,
          }),
        })

        const json = await res.json().catch(() => ({})) as Record<string, unknown>

        setPendingCampaigns((prev) => prev.filter((p) => p.id !== id))

        if (!res.ok) {
          setToasts((prev) => prev.map((t) =>
            t.id === id
              ? { ...t, type: 'error', message: (json.error as string) ?? `Error ${res.status}` }
              : t
          ))
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000)
          return
        }

        const newCreatives = (json.creatives as AdCreative[]) ?? []
        setCreatives((prev) => [...newCreatives, ...prev])

        setToasts((prev) => prev.map((t) =>
          t.id === id
            ? { ...t, type: 'success', count: newCreatives.length }
            : t
        ))
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error de red'
        setPendingCampaigns((prev) => prev.filter((p) => p.id !== id))
        setToasts((prev) => prev.map((t) =>
          t.id === id ? { ...t, type: 'error', message: msg } : t
        ))
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000)
      }
    })()
  }, [clientId])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-indigo-600" />
            Ad Creatives
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{clientNombre}</p>
        </div>
        <Button className="gap-2" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Nueva campaña
        </Button>
      </div>

      <Separator />

      {/* Generation toasts */}
      {toasts.length > 0 && (
        <div className="space-y-2">
          {toasts.map((toast) => (
            <GenerationToastBanner key={toast.id} toast={toast} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {campaigns.length === 0 && pendingCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
            <Sparkles className="h-7 w-7 text-indigo-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">Sin creativos todavía</h3>
          <p className="text-sm text-gray-500 mb-5 max-w-sm">
            Genera tu primera campaña de ad creatives con IA. Se crearán variaciones de copy
            e imágenes adaptadas a la identidad de marca del cliente.
          </p>
          <Button className="gap-2" onClick={() => setModalOpen(true)}>
            <Sparkles className="h-4 w-4" />
            Generar primera campaña
          </Button>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Pending campaigns (skeletons) — al principio */}
          {pendingCampaigns.map((pending, idx) => (
            <div key={pending.id}>
              <PendingCampaignSection pending={pending} />
              {(idx < pendingCampaigns.length - 1 || campaigns.length > 0) && (
                <Separator className="mt-10" />
              )}
            </div>
          ))}

          {/* Completed campaigns */}
          {campaigns.map((group, idx) => (
            <div key={group.batch_id}>
              {idx > 0 && <Separator className="mb-10" />}
              <CampaignSection
                group={group}
                onStatusChange={handleStatusChange}
                onRegenerate={handleRegenerate}
                onOpenLightbox={handleOpenLightbox}
                onEdit={setEditingCreative}
              />
            </div>
          ))}
        </div>
      )}

      {/* Download bar */}
      {approvedCount > 0 && (
        <DownloadBar clientId={clientId} approvedCount={approvedCount} />
      )}

      {/* New campaign modal */}
      <NewCampaignModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onStartGeneration={handleStartGeneration}
        prefillSourceContent={prefillSourceContent}
        prefillIntent={prefillIntent}
      />

      {/* Lightbox */}
      {lightbox && lightboxCreatives.length > 0 && (
        <CreativeLightbox
          creatives={lightboxCreatives}
          initialIdx={lightbox.idx}
          onClose={() => setLightbox(null)}
          onStatusChange={handleStatusChange}
          onEdit={(creative) => { setLightbox(null); setEditingCreative(creative) }}
        />
      )}

      {/* Edit drawer */}
      {editingCreative && (
        <EditCreativeDrawer
          creative={editingCreative}
          onClose={() => setEditingCreative(null)}
          onCopyUpdated={handleCopyUpdated}
          onStartRegenerate={handleStartRegenerate}
          onStartVariants={handleStartVariants}
        />
      )}
    </div>
  )
}
