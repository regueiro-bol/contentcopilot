'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Send, CheckCircle2, ChevronDown, ChevronUp,
  Calendar, Copy, CheckCheck, ExternalLink, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SocialPost } from './SocialPosts'

// ─── Types ────────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  linkedin : 'LinkedIn', twitter_x: 'Twitter/X', instagram: 'Instagram',
  facebook : 'Facebook', tiktok   : 'TikTok',    youtube  : 'YouTube',
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin : 'bg-blue-600',  twitter_x: 'bg-gray-900', instagram: 'bg-purple-600',
  facebook : 'bg-blue-500',  tiktok   : 'bg-black',    youtube  : 'bg-red-600',
}

const GENERIC_CHECKLIST = [
  '¿El copy está dentro del límite de caracteres de la plataforma?',
  '¿Los hashtags están al final del texto?',
  '¿El link está en bio (Instagram) o al final del post (LinkedIn)?',
  '¿La imagen o vídeo está adjunta y tiene la resolución correcta?',
  '¿Se ha revisado ortografía, puntuación y acentos?',
  '¿El tono es coherente con la voz de marca?',
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { clientId: string }

export default function SocialPublication({ clientId }: Props) {
  const [pendingPosts,   setPendingPosts]   = useState<SocialPost[]>([])
  const [publishedPosts, setPublishedPosts] = useState<SocialPost[]>([])
  const [checklist,      setChecklist]      = useState<string[]>([])
  const [checkItems,     setCheckItems]     = useState<boolean[]>([])
  const [loading,        setLoading]        = useState(true)
  const [showPublished,  setShowPublished]  = useState(false)
  const [showChecklist,  setShowChecklist]  = useState(true)
  const [filterPlatform, setFilterPlatform] = useState('')

  const [publishingPost,   setPublishingPost]   = useState<SocialPost | null>(null)
  const [expandedPost,     setExpandedPost]     = useState<string | null>(null)
  const [copiedPostId,     setCopiedPostId]     = useState<string | null>(null)

  // Current month for published filter
  const now   = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const [pendRes, pubRes, voiceRes] = await Promise.all([
        fetch(`/api/social/posts?clientId=${clientId}&status=aprobado`),
        fetch(`/api/social/posts?clientId=${clientId}&status=publicado`),
        fetch(`/api/social/brand-voice?clientId=${clientId}`).catch(() => ({ ok: false } as Response)),
      ])

      if (pendRes.ok) setPendingPosts(await pendRes.json() as SocialPost[])
      if (pubRes.ok) {
        const all = await pubRes.json() as SocialPost[]
        // Filter published this month
        setPublishedPosts(all.filter((p) => {
          if (!p.published_at) return false
          const pub = p.published_at.slice(0, 7)
          return pub === month
        }))
      }

      // Try to extract checklist from brand voice consistency_guidelines
      if (voiceRes.ok) {
        try {
          const voice = await voiceRes.json() as { consistency_guidelines?: unknown }
          if (voice?.consistency_guidelines) {
            const text = typeof voice.consistency_guidelines === 'object' && 'content' in (voice.consistency_guidelines as any)
              ? String((voice.consistency_guidelines as any).content)
              : String(voice.consistency_guidelines)
            const items = extractChecklistItems(text)
            if (items.length >= 3) {
              setChecklist(items)
              setCheckItems(new Array(items.length).fill(false))
              return
            }
          }
        } catch { /* fall through to generic */ }
      }
      setChecklist(GENERIC_CHECKLIST)
      setCheckItems(new Array(GENERIC_CHECKLIST.length).fill(false))
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId, month])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  function extractChecklistItems(text: string): string[] {
    // Look for numbered or bulleted list items
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 5)
    return lines
      .filter((l) => /^[-•\d.✓□\[\]]/.test(l) || l.length < 120)
      .map((l) => l.replace(/^[-•\d.✓□\[\]]\s*/, '').trim())
      .filter((l) => l.length > 0 && l.length < 120)
      .slice(0, 10)
  }

  function toggleCheck(i: number) {
    setCheckItems((prev) => { const next = [...prev]; next[i] = !next[i]; return next })
  }

  function resetCheckItems() {
    setCheckItems(new Array(checklist.length).fill(false))
  }

  async function copyToClipboard(text: string, postId: string) {
    await navigator.clipboard.writeText(text)
    setCopiedPostId(postId)
    setTimeout(() => setCopiedPostId(null), 2500)
  }

  const filtered = filterPlatform
    ? pendingPosts.filter((p) => p.platform === filterPlatform)
    : pendingPosts

  const uniquePlatforms = Array.from(new Set(pendingPosts.map((p) => p.platform)))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando piezas aprobadas…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Header stats ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 rounded-xl border border-amber-200">
          <Send className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-800">{pendingPosts.length}</span>
          <span className="text-xs text-amber-700">pendientes de publicar</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 rounded-xl border border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-semibold text-green-800">{publishedPosts.length}</span>
          <span className="text-xs text-green-700">publicadas este mes</span>
        </div>

        {/* Platform filter pills */}
        {uniquePlatforms.length > 1 && (
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <button
              onClick={() => setFilterPlatform('')}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${!filterPlatform ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
            >
              Todas
            </button>
            {uniquePlatforms.map((p) => (
              <button
                key={p}
                onClick={() => setFilterPlatform(filterPlatform === p ? '' : p)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterPlatform === p ? `${PLATFORM_COLORS[p]} text-white border-transparent` : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
              >
                {PLATFORM_LABELS[p] ?? p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Checklist ── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <button
          onClick={() => setShowChecklist((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        >
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Checklist de publicación
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {checkItems.filter(Boolean).length}/{checklist.length}
            </span>
            {showChecklist ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </div>
        </button>
        {showChecklist && (
          <div className="px-4 pb-4 border-t border-gray-100">
            <div className="space-y-2 pt-3">
              {checklist.map((item, i) => (
                <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
                  <div
                    onClick={() => toggleCheck(i)}
                    className={`mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer
                      ${checkItems[i] ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}
                  >
                    {checkItems[i] && <CheckCheck className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className={`text-sm transition-colors ${checkItems[i] ? 'line-through text-gray-400' : 'text-gray-600 group-hover:text-gray-900'}`}>
                    {item}
                  </span>
                </label>
              ))}
            </div>
            <button
              onClick={resetCheckItems}
              className="mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Reiniciar checklist
            </button>
          </div>
        )}
      </div>

      {/* ── Pending posts ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Pendientes de publicar
          {filtered.length !== pendingPosts.length && (
            <span className="ml-2 text-xs font-normal text-gray-400">
              ({filtered.length} de {pendingPosts.length})
            </span>
          )}
        </h3>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700 mb-1">Sin piezas pendientes</p>
            <p className="text-xs text-gray-500">
              Aprueba piezas en la tab Piezas para que aparezcan aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((post) => (
              <PendingPostCard
                key={post.id}
                post={post}
                isExpanded={expandedPost === post.id}
                isCopied={copiedPostId === post.id}
                onToggleExpand={() => {
                  setExpandedPost((prev) => (prev === post.id ? null : post.id))
                  resetCheckItems()
                }}
                onCopy={() => copyToClipboard(post.copy_approved ?? post.copy_draft ?? '', post.id)}
                onPublish={() => setPublishingPost(post)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Published this month ── */}
      {publishedPosts.length > 0 && (
        <div>
          <button
            onClick={() => setShowPublished((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
          >
            {showPublished ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Publicadas este mes ({publishedPosts.length})
          </button>

          {showPublished && (
            <div className="mt-3 space-y-2">
              {publishedPosts.map((post) => (
                <PublishedPostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Publish modal ── */}
      {publishingPost && (
        <PublishModal
          post={publishingPost}
          onClose={() => setPublishingPost(null)}
          onPublished={() => {
            setPublishingPost(null)
            fetchPosts()
          }}
        />
      )}
    </div>
  )
}

// ─── Pending Post Card ────────────────────────────────────────────────────────

function PendingPostCard({
  post, isExpanded, isCopied, onToggleExpand, onCopy, onPublish,
}: {
  post          : SocialPost
  isExpanded    : boolean
  isCopied      : boolean
  onToggleExpand: () => void
  onCopy        : () => void
  onPublish     : () => void
}) {
  const copy    = post.copy_approved ?? post.copy_draft ?? ''
  const preview = copy.slice(0, 120) + (copy.length > 120 ? '…' : '')

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-amber-300 transition-colors">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Platform badge */}
          <div className={`mt-0.5 h-8 w-8 rounded-lg ${PLATFORM_COLORS[post.platform] ?? 'bg-gray-600'} flex items-center justify-center shrink-0`}>
            <span className="text-white text-xs font-bold">
              {(PLATFORM_LABELS[post.platform] ?? post.platform).slice(0, 2).toUpperCase()}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-gray-800">
                {PLATFORM_LABELS[post.platform] ?? post.platform}
              </span>
              {post.format && (
                <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">
                  {post.format}
                </span>
              )}
              {post.humanized && (
                <span className="text-xs text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md">✓ humanizado</span>
              )}
            </div>

            {post.hook && (
              <p className="text-sm font-medium text-gray-900 mb-0.5 line-clamp-1">{post.hook}</p>
            )}
            <p className="text-xs text-gray-500 leading-relaxed">{preview}</p>

            {post.scheduled_date && (
              <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                <Calendar className="h-3 w-3" />
                Programado: {new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('es-ES', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </div>
            )}
          </div>
        </div>

        {/* Expanded copy */}
        {isExpanded && copy && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border border-gray-100">
            {copy}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {isExpanded ? 'Ocultar copy' : 'Ver copy completo'}
          </button>

          {isExpanded && (
            <button
              onClick={onCopy}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors ml-1"
            >
              {isCopied ? <CheckCheck className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {isCopied ? 'Copiado' : 'Copiar al portapapeles'}
            </button>
          )}

          <Button
            size="sm"
            onClick={onPublish}
            className="ml-auto text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Marcar publicado
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Published Post Card ──────────────────────────────────────────────────────

function PublishedPostCard({ post }: { post: SocialPost }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-3 text-sm">
      <div className={`h-6 w-6 rounded-md ${PLATFORM_COLORS[post.platform] ?? 'bg-gray-600'} flex items-center justify-center shrink-0`}>
        <span className="text-white text-xs font-bold">
          {(PLATFORM_LABELS[post.platform] ?? post.platform).slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-gray-700">{PLATFORM_LABELS[post.platform] ?? post.platform}</span>
        {post.format && <span className="text-xs text-gray-400 ml-2">{post.format}</span>}
      </div>
      {post.published_at && (
        <span className="text-xs text-gray-400 shrink-0">
          {new Date(post.published_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
        </span>
      )}
      {(post as any).published_url && (
        <a
          href={(post as any).published_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-700 shrink-0"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  )
}

// ─── Publish Modal ────────────────────────────────────────────────────────────

function PublishModal({
  post, onClose, onPublished,
}: {
  post       : SocialPost
  onClose    : () => void
  onPublished: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [publishedAt,    setPublishedAt]    = useState(today)
  const [publishedUrl,   setPublishedUrl]   = useState('')
  const [publishedNotes, setPublishedNotes] = useState('')
  const [saving,         setSaving]         = useState(false)
  const [errorMsg,       setErrorMsg]       = useState('')

  async function handleConfirm() {
    setSaving(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/social/publish', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          postId          : post.id,
          calendarEntryId : (post as any).calendar_entry_id ?? undefined,
          publishedAt     : new Date(publishedAt + 'T12:00:00').toISOString(),
          publishedUrl    : publishedUrl || undefined,
          publishedNotes  : publishedNotes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onPublished()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al confirmar publicación')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Confirmar publicación</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {PLATFORM_LABELS[post.platform] ?? post.platform}
            {post.format ? ` — ${post.format}` : ''}
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Fecha de publicación real
            </label>
            <input
              type="date"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              URL de la publicación <span className="font-normal text-gray-400 normal-case">(opcional)</span>
            </label>
            <input
              type="url"
              value={publishedUrl}
              onChange={(e) => setPublishedUrl(e.target.value)}
              placeholder="https://www.linkedin.com/posts/..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Notas <span className="font-normal text-gray-400 normal-case">(opcional)</span>
            </label>
            <textarea
              rows={2}
              value={publishedNotes}
              onChange={(e) => setPublishedNotes(e.target.value)}
              placeholder="Observaciones sobre la publicación…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
            />
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs text-gray-500">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={saving || !publishedAt}
            className="text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
          >
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirmando…</>
              : <><CheckCircle2 className="h-3.5 w-3.5" /> Confirmar publicación</>
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
