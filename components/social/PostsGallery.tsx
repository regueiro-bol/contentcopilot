'use client'

import { useState, useEffect } from 'react'
import { Check, RotateCcw, PenSquare, Loader2 } from 'lucide-react'
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/social/platforms'
import type { SocialPost } from './SocialPosts'
import PostLightbox from './PostLightbox'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aspectClass(post: SocialPost): string {
  const fmt = (post.format ?? '').toLowerCase()
  if (post.platform === 'tiktok') return 'aspect-[9/16]'
  if (fmt.includes('story') || fmt.includes('reel') || fmt.includes('shorts')) return 'aspect-[9/16]'
  if (post.platform === 'instagram') return 'aspect-square'
  return 'aspect-video'
}

function platformAbbr(platform: string): string {
  return platform.replace('_', '').slice(0, 2).toUpperCase()
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_BORDER: Record<string, string> = {
  borrador  : 'border-gray-200',
  revision  : 'border-amber-300',
  aprobado  : 'border-green-400',
  en_diseno : 'border-orange-400',
  listo     : 'border-emerald-500 border-2',
  publicado : 'border-gray-300',
}

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  borrador  : { label: 'Borrador',    badgeClass: 'bg-gray-100 text-gray-600'     },
  revision  : { label: 'En revisión', badgeClass: 'bg-amber-100 text-amber-700'   },
  aprobado  : { label: 'Aprobado',    badgeClass: 'bg-green-100 text-green-700'   },
  en_diseno : { label: 'En diseño',   badgeClass: 'bg-orange-100 text-orange-700' },
  listo     : { label: 'Listo ✓',    badgeClass: 'bg-emerald-100 text-emerald-700' },
  publicado : { label: 'Publicado',   badgeClass: 'bg-blue-100 text-blue-700'     },
}

// ─── PostGalleryCard ───────────────────────────────────────────────────────────

interface CardProps {
  post: SocialPost
  allPosts: SocialPost[]
  onOpenLightbox: (idx: number) => void
  onEdit: (post: SocialPost) => void
  onPostUpdated: (post: SocialPost) => void
}

function PostGalleryCard({ post, allPosts, onOpenLightbox, onEdit, onPostUpdated }: CardProps) {
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null)
  const [confirmReject, setConfirmReject] = useState(false)

  const status     = post.status ?? 'borrador'
  const borderClass = STATUS_BORDER[status] ?? 'border-gray-200'
  const statusCfg  = STATUS_CONFIG[status] ?? { label: status, badgeClass: 'bg-gray-100 text-gray-600' }

  const platformKey = post.platform as keyof typeof PLATFORM_COLORS
  const colors      = PLATFORM_COLORS[platformKey] ?? { bg: 'bg-gray-500', text: 'text-white' }
  const label       = PLATFORM_LABELS[platformKey] ?? post.platform

  const cardIdx = allPosts.findIndex(p => p.id === post.id)

  async function handleApprove(e: React.MouseEvent) {
    e.stopPropagation()
    setActionLoading('approve')
    const updated = { ...post, status: 'aprobado' }
    onPostUpdated(updated)
    try {
      await fetch('/api/social/posts', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ id: post.id, status: 'aprobado' }),
      })
    } catch {
      onPostUpdated(post)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirmReject) {
      setConfirmReject(true)
      return
    }
    setConfirmReject(false)
    setActionLoading('reject')
    const updated = { ...post, status: 'borrador' }
    onPostUpdated(updated)
    try {
      await fetch('/api/social/posts', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ id: post.id, status: 'borrador' }),
      })
    } catch {
      onPostUpdated(post)
    } finally {
      setActionLoading(null)
    }
  }

  const showApprove = status === 'borrador' || status === 'revision'
  const showReject  = status === 'aprobado' || status === 'listo' || status === 'en_diseno'

  const copyText = post.copy_approved ?? post.copy_draft ?? ''

  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer group ${borderClass}`}
    >
      {/* Image section */}
      <div
        className={`relative ${aspectClass(post)} bg-gray-100 overflow-hidden`}
        onClick={() => onOpenLightbox(cardIdx)}
      >
        {post.asset_url ? (
          <img
            src={post.asset_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full flex flex-col items-center justify-center ${colors.bg}`}>
            <span className="text-3xl font-bold text-white">{platformAbbr(post.platform)}</span>
            <span className="text-white/60 text-xs mt-1">Sin imagen</span>
          </div>
        )}

        {/* Status overlays */}
        {status === 'en_diseno' && (
          <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
            <span className="bg-white/90 text-orange-700 text-xs font-semibold px-3 py-1 rounded-full">
              🎨 En diseño
            </span>
          </div>
        )}
        {status === 'publicado' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="bg-white/90 text-gray-800 text-xs font-semibold px-3 py-1 rounded-full">
              ✓ Publicado
            </span>
          </div>
        )}
        {status === 'listo' && (
          <div className="absolute top-2 right-2">
            <span className="bg-emerald-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
              ✓ Listo
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="text-white text-sm font-medium">Ver completo</span>
        </div>
      </div>

      {/* Content section */}
      <div className="p-3 space-y-2">
        {/* Row 1: badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold text-white px-2 py-0.5 rounded-full ${colors.bg}`}>
            {label}
          </span>
          {post.format && (
            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">
              {post.format}
            </span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${statusCfg.badgeClass}`}>
            {statusCfg.label}
          </span>
        </div>

        {/* Row 2: hook / title */}
        {post.hook ? (
          <p className="text-sm font-semibold text-gray-900 line-clamp-2">{post.hook}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">Sin gancho</p>
        )}

        {/* Row 3: copy preview */}
        {copyText && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{copyText}</p>
        )}

        {/* Row 4: date + image indicator */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {post.scheduled_date ? `📅 ${formatDate(post.scheduled_date)}` : ''}
          </span>
          {post.asset_url ? (
            <span className="text-xs text-emerald-600">🖼 Con imagen</span>
          ) : (
            <span className="text-xs text-amber-600">⚠ Sin imagen</span>
          )}
        </div>
      </div>

      {/* Action footer */}
      <div className="flex items-center gap-1 px-3 pb-3">
        {showApprove && (
          <button
            onClick={handleApprove}
            disabled={actionLoading !== null}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-60"
          >
            {actionLoading === 'approve' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Aprobar
          </button>
        )}

        {showReject && !confirmReject && (
          <button
            onClick={handleReject}
            disabled={actionLoading !== null}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs disabled:opacity-60"
          >
            {actionLoading === 'reject' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Desaprobar
          </button>
        )}

        {showReject && confirmReject && (
          <div
            className="flex-1 flex items-center justify-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs text-gray-600">¿Confirmar?</span>
            <button
              onClick={handleReject}
              className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
            >
              Sí
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmReject(false) }}
              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              No
            </button>
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onEdit(post) }}
          className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs"
        >
          <PenSquare className="h-3 w-3" />
          Editar
        </button>
      </div>
    </div>
  )
}

// ─── PostsGallery (main export) ────────────────────────────────────────────────

interface Props {
  posts: SocialPost[]
  onEdit: (post: SocialPost) => void
  onPostUpdated: (post: SocialPost) => void
}

export default function PostsGallery({ posts, onEdit, onPostUpdated }: Props) {
  const [localPosts, setLocalPosts]     = useState<SocialPost[]>(posts)
  const [lightboxIdx, setLightboxIdx]   = useState<number | null>(null)

  useEffect(() => setLocalPosts(posts), [posts])

  function handlePostUpdated(updated: SocialPost) {
    setLocalPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
    onPostUpdated(updated)
  }

  async function handleLightboxApprove(id: string) {
    const post = localPosts.find(p => p.id === id)
    if (!post) return
    const updated = { ...post, status: 'aprobado' }
    handlePostUpdated(updated)
    try {
      await fetch('/api/social/posts', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ id, status: 'aprobado' }),
      })
    } catch {
      handlePostUpdated(post)
    }
  }

  async function handleLightboxReject(id: string) {
    const post = localPosts.find(p => p.id === id)
    if (!post) return
    const updated = { ...post, status: 'borrador' }
    handlePostUpdated(updated)
    try {
      await fetch('/api/social/posts', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ id, status: 'borrador' }),
      })
    } catch {
      handlePostUpdated(post)
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {localPosts.map((post) => (
          <PostGalleryCard
            key={post.id}
            post={post}
            allPosts={localPosts}
            onOpenLightbox={setLightboxIdx}
            onEdit={onEdit}
            onPostUpdated={handlePostUpdated}
          />
        ))}
      </div>

      {lightboxIdx !== null && (
        <PostLightbox
          post={localPosts[lightboxIdx]}
          posts={localPosts}
          onClose={() => setLightboxIdx(null)}
          onApprove={(id) => handleLightboxApprove(id)}
          onReject={(id) => handleLightboxReject(id)}
          onEdit={(p) => { setLightboxIdx(null); onEdit(p) }}
          onPostUpdated={(p) => {
            setLocalPosts(prev => prev.map(x => x.id === p.id ? p : x))
            onPostUpdated(p)
          }}
        />
      )}
    </>
  )
}
