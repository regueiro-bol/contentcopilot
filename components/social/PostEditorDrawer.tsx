'use client'

import { useState, useEffect } from 'react'
import {
  Loader2, Sparkles, Zap, Check, Trash2, X, Copy, CheckCircle2,
  Image as ImageIcon, PenSquare, ExternalLink, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SocialPost } from './SocialPosts'
import GenerateImageModal from './GenerateImageModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  linkedin : 'LinkedIn', twitter_x: 'Twitter/X', instagram: 'Instagram',
  facebook : 'Facebook', tiktok   : 'TikTok',    youtube  : 'YouTube',
}

const PLATFORM_FORMATS: Record<string, string[]> = {
  linkedin : ['Artículo nativo', 'Post de texto', 'Documento PDF nativo', 'Vídeo corto', 'Encuesta', 'Carrusel'],
  twitter_x: ['Tweet único', 'Hilo de tweets', 'Tweet con imagen', 'Tweet con vídeo', 'Encuesta'],
  instagram: ['Post imagen', 'Carrusel', 'Reel', 'Story', 'Vídeo IGTV', 'Colaboración'],
  facebook : ['Post texto', 'Post imagen', 'Vídeo nativo', 'Reel', 'Story', 'Live', 'Evento'],
  tiktok   : ['Vídeo corto (<60s)', 'Vídeo largo (>60s)', 'Live', 'Dueto', 'Stitch', 'Serie'],
  youtube  : ['Vídeo largo (>10min)', 'Shorts', 'Live', 'Premiere', 'Post de comunidad'],
}

const STATUS_OPTIONS = [
  { value: 'borrador',  label: 'Borrador'   },
  { value: 'revision',  label: 'En revisión' },
  { value: 'aprobado',  label: 'Aprobado'   },
  { value: 'en_diseno', label: 'En diseño'  },
  { value: 'listo',     label: 'Listo'      },
  { value: 'publicado', label: 'Publicado'  },
]


// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open    : boolean
  clientId: string
  post    : SocialPost | null
  onClose : () => void
  onSaved : () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostEditorDrawer({ open, clientId, post, onClose, onSaved }: Props) {
  const isNew = !post?.id

  const [platform,          setPlatform]          = useState('linkedin')
  const [format,            setFormat]            = useState('')
  const [contentPillar,     setContentPillar]     = useState('')
  const [scheduledDate,     setScheduledDate]     = useState('')
  const [hook,              setHook]              = useState('')
  const [copyDraft,         setCopyDraft]         = useState('')
  const [visualDescription, setVisualDescription] = useState('')
  const [status,            setStatus]            = useState('borrador')
  const [context,           setContext]           = useState('')
  const [assetUrl,          setAssetUrl]          = useState<string | null>(null)
  const [assetType,         setAssetType]         = useState<string | null>(null)
  const [assetSource,       setAssetSource]       = useState<string | null>(null)

  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [generating,  setGenerating]  = useState(false)
  const [humanizing,  setHumanizing]  = useState(false)
  const [approving,   setApproving]   = useState(false)
  const [errorMsg,    setErrorMsg]    = useState('')
  const [copiedHook,  setCopiedHook]  = useState(false)
  const [copiedCopy,  setCopiedCopy]  = useState(false)

  // Visual resource modals
  const [showGenImageModal, setShowGenImageModal] = useState(false)
  const [showDesignModal,   setShowDesignModal]   = useState(false)
  const [designNotes,       setDesignNotes]       = useState('')
  const [sendingDesign,     setSendingDesign]     = useState(false)
  const [designToast,       setDesignToast]       = useState(false)

  // Populate form when post changes
  useEffect(() => {
    if (post) {
      setPlatform(post.platform ?? 'linkedin')
      setFormat(post.format ?? '')
      setContentPillar(post.content_pillar ?? '')
      setScheduledDate(post.scheduled_date ?? '')
      setHook(post.hook ?? '')
      setCopyDraft(post.copy_draft ?? '')
      setVisualDescription(post.visual_description ?? '')
      setStatus(post.status ?? 'borrador')
      setContext('')
      setAssetUrl(post.asset_url ?? null)
      setAssetType(post.asset_type ?? null)
      setAssetSource(post.asset_source ?? null)
      setDesignNotes(post.visual_description ?? '')
    } else {
      setPlatform('linkedin')
      setFormat('')
      setContentPillar('')
      setScheduledDate('')
      setHook('')
      setCopyDraft('')
      setVisualDescription('')
      setStatus('borrador')
      setContext('')
      setAssetUrl(null)
      setAssetType(null)
      setAssetSource(null)
      setDesignNotes('')
    }
    setErrorMsg('')
  }, [post, open])

  if (!open) return null

  const formats = PLATFORM_FORMATS[platform] ?? []

  const showVisualSection = !isNew &&
    (status === 'aprobado' || status === 'en_diseno' || status === 'listo')

  async function handleSave() {
    setSaving(true)
    setErrorMsg('')
    try {
      const payload: Record<string, unknown> = {
        client_id         : clientId,
        platform,
        format            : format || null,
        content_pillar    : contentPillar || null,
        scheduled_date    : scheduledDate || null,
        hook              : hook || null,
        copy_draft        : copyDraft || null,
        visual_description: visualDescription || null,
        status,
      }

      const res = isNew
        ? await fetch('/api/social/posts', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify(payload),
          })
        : await fetch('/api/social/posts', {
            method : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ id: post!.id, ...payload }),
          })

      if (!res.ok) {
        const e = await res.json() as { error: string }
        throw new Error(e.error)
      }
      onSaved()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!post?.id) return
    setDeleting(true)
    try {
      await fetch(`/api/social/posts?id=${post.id}`, { method: 'DELETE' })
      onSaved()
    } catch { /* silencioso */ }
    finally { setDeleting(false) }
  }

  async function handleGenerate() {
    setGenerating(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/social/generate-post', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          clientId,
          postId       : post?.id,
          platform,
          format       : format || undefined,
          contentPillar: contentPillar || undefined,
          context      : context || undefined,
        }),
      })
      const data = await res.json() as { hook: string; copy_draft: string; visual_description: string } | { error: string }
      if (!res.ok) throw new Error((data as any).error)
      const d = data as { hook: string; copy_draft: string; visual_description: string }
      setHook(d.hook ?? '')
      setCopyDraft(d.copy_draft ?? '')
      setVisualDescription(d.visual_description ?? '')
      setDesignNotes(d.visual_description ?? '')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al generar')
    } finally {
      setGenerating(false)
    }
  }

  async function handleHumanize() {
    if (!copyDraft.trim()) return
    setHumanizing(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/social/humanize-post', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          postId  : post?.id ?? 'temp',
          copy    : copyDraft,
          platform,
          clientId,
        }),
      })
      const data = await res.json() as { copy: string } | { error: string }
      if (!res.ok) throw new Error((data as any).error)
      setCopyDraft((data as { copy: string }).copy)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al humanizar')
    } finally {
      setHumanizing(false)
    }
  }

  async function handleApprove() {
    if (!post?.id || !copyDraft.trim()) return
    setApproving(true)
    try {
      await fetch('/api/social/posts', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          id           : post.id,
          copy_approved: copyDraft,
          status       : 'aprobado',
        }),
      })
      setStatus('aprobado')
    } catch { /* silencioso */ }
    finally { setApproving(false) }
  }

  async function handleSendToDesign() {
    if (!post?.id) return
    setSendingDesign(true)
    try {
      const res = await fetch('/api/social/posts', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          id          : post.id,
          status      : 'en_diseno',
          design_notes: designNotes || null,
        }),
      })
      if (!res.ok) throw new Error('Error al enviar')
      setStatus('en_diseno')
      setShowDesignModal(false)
      setDesignToast(true)
      setTimeout(() => setDesignToast(false), 3000)
      onSaved()
    } catch { /* silencioso */ }
    finally { setSendingDesign(false) }
  }

  async function handleRemoveAsset() {
    if (!post?.id) return
    await fetch('/api/social/posts', {
      method : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        id          : post.id,
        asset_url   : null,
        asset_type  : null,
        asset_source: null,
        status      : status === 'listo' ? 'aprobado' : status,
      }),
    })
    setAssetUrl(null)
    setAssetType(null)
    setAssetSource(null)
    if (status === 'listo') setStatus('aprobado')
  }

  async function copyToClipboard(text: string, type: 'hook' | 'copy') {
    await navigator.clipboard.writeText(text)
    if (type === 'hook') { setCopiedHook(true); setTimeout(() => setCopiedHook(false), 2000) }
    else                  { setCopiedCopy(true); setTimeout(() => setCopiedCopy(false), 2000) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <div className="bg-white w-full max-w-xl h-full flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {isNew ? 'Nueva pieza' : `Editar — ${PLATFORM_LABELS[platform] ?? platform}`}
            </h2>
            {!isNew && post?.humanized && (
              <span className="text-xs text-teal-600">✓ humanizado</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Platform + Format */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Plataforma
              </label>
              <select
                value={platform}
                onChange={(e) => { setPlatform(e.target.value); setFormat('') }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
              >
                {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Formato
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
              >
                <option value="">Libre</option>
                {formats.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pillar + Date + Status */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Pilar
              </label>
              <input
                type="text"
                value={contentPillar}
                onChange={(e) => setContentPillar(e.target.value)}
                placeholder="Pilar editorial"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Fecha
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Estado
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Context for AI */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Contexto para la IA <span className="text-gray-400 font-normal normal-case">(tema, idea clave, ángulo…)</span>
            </label>
            <textarea
              rows={2}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Ej: Anunciar el lanzamiento de nuestro nuevo servicio de consultoría. Tone: directo y profesional."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
            />
          </div>

          {/* Generate copy button */}
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full gap-2 bg-pink-600 hover:bg-pink-700 text-white"
            size="sm"
          >
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando copy…</>
              : <><Sparkles className="h-4 w-4" /> Generar copy con IA</>
            }
          </Button>

          {/* Hook */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Gancho de apertura
              </label>
              {hook && (
                <button
                  onClick={() => copyToClipboard(hook, 'hook')}
                  className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-xs"
                >
                  {copiedHook ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedHook ? 'Copiado' : 'Copiar'}
                </button>
              )}
            </div>
            <input
              type="text"
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="Gancho de apertura (aparece antes del 'leer más')"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>

          {/* Copy draft */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Copy
              </label>
              <div className="flex items-center gap-2">
                {copyDraft && (
                  <button
                    onClick={() => copyToClipboard(copyDraft, 'copy')}
                    className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-xs"
                  >
                    {copiedCopy ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCopy ? 'Copiado' : 'Copiar'}
                  </button>
                )}
                <button
                  onClick={handleHumanize}
                  disabled={humanizing || !copyDraft.trim()}
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {humanizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  {humanizing ? 'Humanizando…' : 'Humanizar'}
                </button>
              </div>
            </div>
            <textarea
              rows={8}
              value={copyDraft}
              onChange={(e) => setCopyDraft(e.target.value)}
              placeholder="El copy aparecerá aquí después de generar, o puedes escribirlo directamente."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none leading-relaxed"
            />
            {copyDraft && (
              <p className="text-xs text-gray-400 mt-1 text-right">
                {copyDraft.length} caracteres
              </p>
            )}
          </div>

          {/* Visual description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Descripción visual <span className="text-gray-400 font-normal normal-case">(para el equipo creativo)</span>
            </label>
            <textarea
              rows={3}
              value={visualDescription}
              onChange={(e) => {
                setVisualDescription(e.target.value)
                if (!designNotes || designNotes === post?.visual_description) {
                  setDesignNotes(e.target.value)
                }
              }}
              placeholder="Qué debe mostrar la imagen, vídeo o diseño."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
            />
          </div>

          {/* ── Recurso visual section ── */}
          {showVisualSection && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Recurso visual
              </p>

              {!assetUrl ? (
                <>
                  <p className="text-xs text-gray-500">
                    Esta pieza necesita un recurso visual para poder publicarse.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => setShowGenImageModal(true)}
                      className="flex-1 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Generar imagen con IA
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowDesignModal(true)}
                      className="flex-1 text-xs gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50"
                    >
                      <PenSquare className="h-3.5 w-3.5" />
                      Enviar a diseño
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Asset preview */}
                  <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
                    {assetType === 'video' ? (
                      <video
                        src={assetUrl}
                        controls
                        className="w-full max-h-48 object-contain"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={assetUrl}
                        alt="Recurso visual"
                        className="w-full max-h-48 object-contain"
                      />
                    )}
                  </div>
                  {/* Source badge */}
                  <div className="flex items-center gap-2">
                    {assetSource === 'ai_generated' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        ✨ Generado con IA
                      </span>
                    )}
                    {assetSource === 'designer' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                        🎨 Diseño
                      </span>
                    )}
                    {assetSource === 'external' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        🔗 Externo
                      </span>
                    )}
                  </div>
                  {/* Asset actions */}
                  <div className="flex items-center gap-2">
                    <a
                      href={assetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver en tamaño completo
                    </a>
                    <button
                      onClick={() => setShowGenImageModal(true)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 ml-2"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      Cambiar imagen
                    </button>
                    <button
                      onClick={handleRemoveAsset}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 ml-auto"
                    >
                      Eliminar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between shrink-0 gap-2">
          {!isNew && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors disabled:opacity-40"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Eliminar
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {!isNew && status !== 'aprobado' && status !== 'en_diseno' && status !== 'listo' && copyDraft.trim() && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleApprove}
                disabled={approving}
                className="text-xs gap-1.5 border-green-200 text-green-700 hover:bg-green-50"
              >
                {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Aprobar
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white"
            >
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</>
                : <><Check className="h-3.5 w-3.5" /> {isNew ? 'Crear pieza' : 'Guardar'}</>
              }
            </Button>
          </div>
        </div>

        {/* Toast */}
        {designToast && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-lg">
            Pieza enviada al panel de diseño ✓
          </div>
        )}
      </div>

      {/* ── GenerateImageModal ── */}
      {showGenImageModal && post?.id && (
        <GenerateImageModal
          postId={post.id}
          clientId={clientId}
          platform={platform}
          format={format}
          visualDescription={visualDescription}
          onClose={() => setShowGenImageModal(false)}
          onImageGenerated={(url) => {
            setAssetUrl(url)
            setAssetType('image')
            setAssetSource('ai_generated')
            setStatus('listo')
            setShowGenImageModal(false)
          }}
        />
      )}

      {/* ── Enviar a diseño modal ── */}
      {showDesignModal && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Enviar a diseño</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                ¿Enviar esta pieza al panel de diseño?
              </p>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Instrucciones adicionales para el diseñador
              </label>
              <textarea
                rows={4}
                value={designNotes}
                onChange={(e) => setDesignNotes(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                placeholder="Instrucciones visuales, referencias, formato preferido…"
              />
            </div>
            <div className="px-5 pb-5 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowDesignModal(false)} className="text-xs text-gray-500">
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSendToDesign}
                disabled={sendingDesign}
                className="text-xs gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {sendingDesign
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando…</>
                  : <><PenSquare className="h-3.5 w-3.5" /> Enviar a diseño</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
