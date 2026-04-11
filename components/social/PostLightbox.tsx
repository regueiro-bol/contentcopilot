'use client'

import { useState, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  RotateCcw,
  PenSquare,
  Copy,
  CheckCheck,
  Sparkles,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/social/platforms'
import type { SocialPost } from './SocialPosts'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  borrador  : { label: 'Borrador',    badgeClass: 'bg-gray-100 text-gray-600'       },
  revision  : { label: 'En revisión', badgeClass: 'bg-amber-100 text-amber-700'     },
  aprobado  : { label: 'Aprobado',    badgeClass: 'bg-green-100 text-green-700'     },
  en_diseno : { label: 'En diseño',   badgeClass: 'bg-orange-100 text-orange-700'   },
  listo     : { label: 'Listo ✓',    badgeClass: 'bg-emerald-100 text-emerald-700' },
  publicado : { label: 'Publicado',   badgeClass: 'bg-blue-100 text-blue-700'       },
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  post          : SocialPost
  posts         : SocialPost[]
  onClose       : () => void
  onApprove     : (postId: string) => void
  onReject      : (postId: string) => void
  onEdit        : (post: SocialPost) => void
  onPostUpdated : (post: SocialPost) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostLightbox({
  post,
  posts,
  onClose,
  onApprove,
  onReject,
  onEdit,
  onPostUpdated,
}: Props) {
  const [idx, setIdx] = useState<number>(
    () => Math.max(0, posts.findIndex(p => p.id === post.id))
  )
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null)
  const [copied, setCopied] = useState(false)

  const currentPost = posts[idx] ?? post
  const hasPrev     = idx > 0
  const hasNext     = idx < posts.length - 1

  // ── Keyboard navigation ──────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')                      { onClose(); return }
      if (e.key === 'ArrowLeft'  && hasPrev) setIdx(i => i - 1)
      if (e.key === 'ArrowRight' && hasNext) setIdx(i => i + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasPrev, hasNext, onClose])

  // ── Approve ──────────────────────────────────────────────────────────────────

  async function handleApprove() {
    setActionLoading('approve')
    const updated = { ...currentPost, status: 'aprobado' }
    onPostUpdated(updated)
    try {
      await fetch('/api/social/posts', {
        method  : 'PATCH',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify({ id: currentPost.id, status: 'aprobado' }),
      })
      onApprove(currentPost.id)
    } catch {
      onPostUpdated(currentPost)
    } finally {
      setActionLoading(null)
    }
  }

  // ── Reject ───────────────────────────────────────────────────────────────────

  async function handleReject() {
    setActionLoading('reject')
    const updated = { ...currentPost, status: 'borrador' }
    onPostUpdated(updated)
    try {
      await fetch('/api/social/posts', {
        method  : 'PATCH',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify({ id: currentPost.id, status: 'borrador' }),
      })
      onReject(currentPost.id)
    } catch {
      onPostUpdated(currentPost)
    } finally {
      setActionLoading(null)
    }
  }

  // ── Copy ─────────────────────────────────────────────────────────────────────

  async function handleCopy() {
    const text = currentPost.copy_approved ?? currentPost.copy_draft ?? ''
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const platformKey    = currentPost.platform as keyof typeof PLATFORM_COLORS
  const platformColors = PLATFORM_COLORS[platformKey] ?? { bg: 'bg-gray-600', text: 'text-white' }
  const platformLabel  = PLATFORM_LABELS[platformKey] ?? currentPost.platform
  const platformAbbr   = platformLabel.slice(0, 2).toUpperCase()

  const statusKey    = currentPost.status ?? 'borrador'
  const statusCfg    = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.borrador

  const copyText     = currentPost.copy_approved ?? currentPost.copy_draft ?? null
  const hasCopyApproved = Boolean(currentPost.copy_approved)

  const formattedDate = currentPost.scheduled_date
    ? new Date(currentPost.scheduled_date).toLocaleDateString('es-ES', {
        weekday: 'long',
        day    : 'numeric',
        month  : 'long',
      })
    : null

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Inner panel */}
      <div
        className="bg-white rounded-2xl overflow-hidden max-w-5xl w-full max-h-[92vh] flex flex-col md:flex-row"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left column: image ─────────────────────────────────────────────── */}
        <div className="flex-1 bg-gray-950 flex items-center justify-center relative min-h-[300px]">

          {currentPost.asset_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentPost.asset_url}
              alt={currentPost.hook ?? 'Post image'}
              className="object-contain max-h-[92vh] w-full"
            />
          ) : (
            /* Placeholder */
            <div className={`flex flex-col items-center justify-center gap-3 w-full h-full min-h-[300px] ${platformColors.bg}`}>
              <span className="text-6xl font-bold text-white">{platformAbbr}</span>
              <span className="text-sm text-white/50">Sin imagen generada</span>
            </div>
          )}

          {/* Prev arrow */}
          {hasPrev && (
            <button
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 rounded-full p-2 text-white hover:bg-black/70 transition-colors"
              onClick={() => setIdx(i => i - 1)}
              aria-label="Anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {/* Next arrow */}
          {hasNext && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 rounded-full p-2 text-white hover:bg-black/70 transition-colors"
              onClick={() => setIdx(i => i + 1)}
              aria-label="Siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Counter badge */}
          {posts.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
              {idx + 1} / {posts.length}
            </div>
          )}

          {/* Close button */}
          <button
            className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70 transition-colors"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Right column: info panel ────────────────────────────────────────── */}
        <div className="w-full md:w-96 flex flex-col border-t md:border-t-0 md:border-l border-gray-200">

          {/* Header */}
          <div className="p-5 border-b border-gray-100 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Platform badge */}
              <span className={`${platformColors.bg} text-white text-xs font-semibold px-2.5 py-1 rounded-full`}>
                {platformLabel}
              </span>

              {/* Format badge */}
              {currentPost.format && (
                <span className="border border-gray-300 text-gray-600 text-xs px-2 py-0.5 rounded-md">
                  {currentPost.format}
                </span>
              )}

              {/* Status badge */}
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusCfg.badgeClass}`}>
                {statusCfg.label}
              </span>
            </div>

            {/* Scheduled date */}
            {formattedDate && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-2">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span className="capitalize">{formattedDate}</span>
              </div>
            )}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Hook */}
            {currentPost.hook && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Gancho de apertura
                </p>
                <p className="text-sm font-semibold text-gray-900 leading-snug">
                  {currentPost.hook}
                </p>
              </div>
            )}

            {/* Copy */}
            {copyText && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Copy
                    {hasCopyApproved && (
                      <span className="ml-2 normal-case font-normal text-green-600 text-[10px]">
                        ✓ Aprobado
                      </span>
                    )}
                  </p>
                  <button
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={handleCopy}
                  >
                    {copied
                      ? <CheckCheck className="h-3 w-3 text-green-500" />
                      : <Copy className="h-3 w-3" />
                    }
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {copyText}
                </p>
              </div>
            )}

            {/* Visual description */}
            {currentPost.visual_description && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Descripción visual
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {currentPost.visual_description}
                </p>
              </div>
            )}

            {/* Content pillar */}
            {currentPost.content_pillar && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Pilar editorial
                </p>
                <span className="inline-block text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                  {currentPost.content_pillar}
                </span>
              </div>
            )}
          </div>

          {/* Action footer */}
          <div className="p-4 border-t border-gray-100 space-y-2">
            {(statusKey === 'borrador' || statusKey === 'revision') && (
              <>
                {/* Approve */}
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  onClick={handleApprove}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === 'approve' ? (
                    <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Aprobar
                </Button>

                {/* Edit */}
                <Button
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => onEdit(currentPost)}
                  disabled={actionLoading !== null}
                >
                  <PenSquare className="h-4 w-4" />
                  Editar
                </Button>
              </>
            )}

            {(statusKey === 'aprobado' || statusKey === 'en_diseno' || statusKey === 'listo') && (
              <>
                {/* Unapprove */}
                <Button
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={handleReject}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === 'reject' ? (
                    <span className="animate-spin h-4 w-4 border-2 border-gray-400/40 border-t-gray-600 rounded-full" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Desaprobar
                </Button>

                {/* Edit */}
                <Button
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => onEdit(currentPost)}
                  disabled={actionLoading !== null}
                >
                  <PenSquare className="h-4 w-4" />
                  Editar
                </Button>

                {/* Generate image (if no asset) — delegates to onEdit */}
                {!currentPost.asset_url && (
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                    onClick={() => onEdit(currentPost)}
                    disabled={actionLoading !== null}
                  >
                    <Sparkles className="h-4 w-4" />
                    Generar imagen
                  </Button>
                )}
              </>
            )}

            {statusKey === 'publicado' && (
              <Button
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => onEdit(currentPost)}
              >
                <PenSquare className="h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
