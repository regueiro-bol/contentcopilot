'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Check, RotateCcw, ChevronRight } from 'lucide-react'
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/social/platforms'
import type { SocialPost } from './SocialPosts'
import PostLightbox from './PostLightbox'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEntry {
  id             : string
  client_id      : string
  platform       : string
  format?        : string | null
  title?         : string | null
  description?   : string | null
  scheduled_date : string
  status?        : string | null
  social_post_id?: string | null
  // enriched fields from linked social_post:
  post_status?   : string | null
  post_asset_url?: string | null
  post_humanized?: boolean | null
  post_has_copy? : boolean | null
}

interface Props {
  date          : string          // YYYY-MM-DD
  clientId      : string
  entries       : CalendarEntry[] // entries for this day (already filtered)
  onClose       : () => void
  onPostUpdated?: () => void      // called when a post is approved/rejected, to refresh parent
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BORDER: Record<string, string> = {
  borrador  : 'border-gray-200',
  revision  : 'border-amber-300',
  aprobado  : 'border-green-400',
  en_diseno : 'border-orange-400',
  listo     : 'border-emerald-500 border-2',
  publicado : 'border-gray-300',
}

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  borrador  : { label: 'Borrador',    badgeClass: 'bg-gray-100 text-gray-600'       },
  revision  : { label: 'En revisión', badgeClass: 'bg-amber-100 text-amber-700'     },
  aprobado  : { label: 'Aprobado',    badgeClass: 'bg-green-100 text-green-700'     },
  en_diseno : { label: 'En diseño',   badgeClass: 'bg-orange-100 text-orange-700'   },
  listo     : { label: 'Listo ✓',    badgeClass: 'bg-emerald-100 text-emerald-700' },
  publicado : { label: 'Publicado',   badgeClass: 'bg-blue-100 text-blue-700'       },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function platformAbbr(platform: string): string {
  return platform.replace('_', '').slice(0, 2).toUpperCase()
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DayPostsPanel({
  date,
  clientId,
  entries,
  onClose,
  onPostUpdated,
}: Props) {
  const [posts,       setPosts]       = useState<SocialPost[]>([])
  const [loading,     setLoading]     = useState(true)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  // Stable dep: only re-fetch when the set of post IDs changes
  const postIdsDep = JSON.stringify(entries.map(e => e.social_post_id))

  useEffect(() => {
    const postIds = entries
      .filter(e => e.social_post_id)
      .map(e => e.social_post_id!)

    if (postIds.length === 0) {
      setPosts([])
      setLoading(false)
      return
    }

    setLoading(true)
    Promise.all(
      postIds.map(id =>
        fetch(`/api/social/posts?postId=${id}`).then(r => r.json())
      )
    )
      .then(results => setPosts(results.filter(Boolean) as SocialPost[]))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postIdsDep])

  // ── Formatted date label ───────────────────────────────────────────────────
  const formattedDate = capitalizeFirst(
    new Date(date + 'T12:00:00').toLocaleDateString('es-ES', {
      weekday: 'long',
      day    : 'numeric',
      month  : 'long',
    })
  )

  // ── Mini approve / reject ──────────────────────────────────────────────────
  async function miniApprove(post: SocialPost) {
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'aprobado' } : p))
    await fetch('/api/social/posts', {
      method : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ id: post.id, status: 'aprobado' }),
    }).catch(() => {
      setPosts(prev => prev.map(p => p.id === post.id ? post : p))
    })
    onPostUpdated?.()
  }

  async function miniReject(post: SocialPost) {
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'borrador' } : p))
    await fetch('/api/social/posts', {
      method : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ id: post.id, status: 'borrador' }),
    }).catch(() => {
      setPosts(prev => prev.map(p => p.id === post.id ? post : p))
    })
    onPostUpdated?.()
  }

  // ── Footer counts ──────────────────────────────────────────────────────────
  const noImage = posts.filter(p => !p.asset_url).length

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[480px] bg-white shadow-2xl flex flex-col translate-x-0">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-900">{formattedDate}</p>
            <p className="text-xs text-gray-400">
              {posts.length} pieza{posts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : posts.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                No hay piezas vinculadas a las entradas de este día.
              </p>
              {entries.length > 0 && (
                <ul className="space-y-2">
                  {entries.map(entry => {
                    const platformKey = entry.platform as keyof typeof PLATFORM_COLORS
                    const colors      = PLATFORM_COLORS[platformKey] ?? { bg: 'bg-gray-500', text: 'text-white' }
                    const label       = PLATFORM_LABELS[platformKey] ?? entry.platform
                    return (
                      <li
                        key={entry.id}
                        className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-700"
                      >
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors.bg} ${colors.text}`}>
                          {label}
                        </span>
                        {entry.format && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                            {entry.format}
                          </span>
                        )}
                        <span className="truncate text-gray-500">
                          {entry.title ?? entry.description ?? '(sin título)'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div className={posts.length > 1 ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
              {posts.map((post, idx) => (
                <MiniPostCard
                  key={post.id}
                  post={post}
                  idx={idx}
                  onOpenLightbox={setLightboxIdx}
                  onApprove={miniApprove}
                  onReject={miniReject}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-100 p-4">
          {noImage > 0 && !loading && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              <span>
                ⚠ {noImage} pieza{noImage !== 1 ? 's' : ''} sin imagen
              </span>
            </div>
          )}
          {noImage === 0 && posts.length > 0 && !loading && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
              <span>✓ Todas las piezas del día están listas</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightboxIdx !== null && posts[lightboxIdx] && (
        <PostLightbox
          post={posts[lightboxIdx]}
          posts={posts}
          onClose={() => setLightboxIdx(null)}
          onApprove={() => { /* handled via onPostUpdated in lightbox */ }}
          onReject={() => {}}
          onEdit={() => setLightboxIdx(null)}
          onPostUpdated={(updated) => {
            setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
            onPostUpdated?.()
          }}
        />
      )}
    </>
  )
}

// ─── MiniPostCard ─────────────────────────────────────────────────────────────

interface MiniCardProps {
  post          : SocialPost
  idx           : number
  onOpenLightbox: (idx: number) => void
  onApprove     : (post: SocialPost) => void
  onReject      : (post: SocialPost) => void
}

function MiniPostCard({ post, idx, onOpenLightbox, onApprove, onReject }: MiniCardProps) {
  const status      = post.status ?? 'borrador'
  const borderClass = STATUS_BORDER[status] ?? 'border-gray-200'
  const statusCfg   = STATUS_CONFIG[status] ?? { label: status, badgeClass: 'bg-gray-100 text-gray-600' }

  const platformKey = post.platform as keyof typeof PLATFORM_COLORS
  const colors      = PLATFORM_COLORS[platformKey] ?? { bg: 'bg-gray-500', text: 'text-white' }
  const label       = PLATFORM_LABELS[platformKey] ?? post.platform

  const canApprove = status === 'borrador' || status === 'revision'
  const canReject  = status === 'aprobado' || status === 'listo' || status === 'en_diseno'

  return (
    <div
      className={`rounded-xl border overflow-hidden cursor-pointer hover:shadow-md transition-shadow group ${borderClass}`}
      onClick={() => onOpenLightbox(idx)}
    >
      {/* Image area */}
      <div className="relative aspect-square bg-gray-100">
        {post.asset_url ? (
          <img
            src={post.asset_url}
            alt={post.hook ?? 'Post'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${colors.bg}`}>
            <span className={`text-lg font-bold ${colors.text}`}>
              {platformAbbr(post.platform)}
            </span>
          </div>
        )}

        {/* Status badge overlay */}
        <span
          className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusCfg.badgeClass}`}
        >
          {statusCfg.label}
        </span>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-xs font-medium">Ver completo →</span>
        </div>
      </div>

      {/* Card bottom */}
      <div className="p-2 space-y-1">
        {/* Platform + format badges */}
        <div className="flex flex-wrap gap-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors.bg} ${colors.text}`}>
            {label}
          </span>
          {post.format && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
              {post.format}
            </span>
          )}
        </div>

        {/* Hook */}
        <p className="text-xs font-medium text-gray-800 line-clamp-1">
          {post.hook ?? 'Sin gancho'}
        </p>

        {/* Action buttons */}
        <div
          className="flex gap-1 items-center"
          onClick={e => e.stopPropagation()}
        >
          {canApprove && (
            <button
              title="Aprobar"
              onClick={() => onApprove(post)}
              className="h-6 w-6 rounded-md bg-green-100 hover:bg-green-200 text-green-700 flex items-center justify-center transition-colors"
            >
              <Check className="h-3 w-3" />
            </button>
          )}
          {canReject && (
            <button
              title="Rechazar"
              onClick={() => onReject(post)}
              className="h-6 w-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          <button
            title="Ver"
            onClick={() => onOpenLightbox(idx)}
            className="text-[10px] px-2 h-6 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 ml-auto flex items-center gap-0.5 transition-colors"
          >
            Ver <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
