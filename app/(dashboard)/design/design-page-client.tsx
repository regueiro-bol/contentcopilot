'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Palette, ChevronDown, Loader2, CheckCircle2, Calendar,
} from 'lucide-react'
import PostEditorDrawer    from '@/components/social/PostEditorDrawer'
import { Badge }           from '@/components/ui/badge'
import type { SocialPost } from '@/components/social/SocialPosts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cliente { id: string; nombre: string }

interface DesignPost extends SocialPost {
  client_nombre: string
}

interface Props {
  clientes: Cliente[]
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn', twitter_x: 'Twitter/X', instagram: 'Instagram',
  facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube',
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: 'bg-blue-600', twitter_x: 'bg-gray-900', instagram: 'bg-purple-600',
  facebook: 'bg-blue-500', tiktok: 'bg-black', youtube: 'bg-red-600',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DesignPageClient({ clientes }: Props) {
  const [filterClientId, setFilterClientId] = useState('')
  const [posts,          setPosts]          = useState<DesignPost[]>([])
  const [loading,        setLoading]        = useState(true)
  const [selectedPost,   setSelectedPost]   = useState<DesignPost | null>(null)
  const [drawerOpen,     setDrawerOpen]     = useState(false)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterClientId) params.set('clientId', filterClientId)
      const res = await fetch(`/api/social/design-queue?${params}`)
      if (res.ok) setPosts(await res.json() as DesignPost[])
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [filterClientId])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  function openDrawer(post: DesignPost) {
    setSelectedPost(post)
    setDrawerOpen(true)
  }

  function handleSaved() {
    setDrawerOpen(false)
    setSelectedPost(null)
    fetchPosts()
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
          <Palette className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Panel de Diseño</h1>
          <p className="text-sm text-gray-500">Piezas pendientes de recurso visual</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 flex-wrap">
        <div className="relative">
          <select
            value={filterClientId}
            onChange={(e) => setFilterClientId(e.target.value)}
            className="appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-200">
            <Palette className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-800">{posts.length}</span>
            <span className="text-xs text-orange-700">en diseño</span>
          </div>
          <button
            onClick={fetchPosts}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-100"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando piezas…</span>
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-orange-50 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-orange-300" />
          </div>
          <p className="text-base font-semibold text-gray-700 mb-1">Sin piezas en diseño</p>
          <p className="text-sm text-gray-400">
            {filterClientId
              ? 'Este cliente no tiene piezas pendientes de diseño.'
              : 'No hay piezas pendientes de recurso visual.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <DesignCard
              key={post.id}
              post={post}
              showClient={!filterClientId}
              onClick={() => openDrawer(post)}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      <PostEditorDrawer
        open={drawerOpen}
        clientId={selectedPost?.client_id ?? ''}
        post={selectedPost}
        onClose={() => { setDrawerOpen(false); setSelectedPost(null) }}
        onSaved={handleSaved}
      />
    </div>
  )
}

// ─── Design Card ──────────────────────────────────────────────────────────────

function DesignCard({
  post,
  showClient,
  onClick,
}: {
  post      : DesignPost
  showClient: boolean
  onClick   : () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-orange-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-3">
        {/* Platform badge */}
        <div className={`mt-0.5 h-8 w-8 rounded-lg ${PLATFORM_COLORS[post.platform] ?? 'bg-gray-600'} flex items-center justify-center shrink-0`}>
          <span className="text-white text-xs font-bold">
            {(PLATFORM_LABELS[post.platform] ?? post.platform).slice(0, 2).toUpperCase()}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            {showClient && (
              <Badge variant="secondary" className="text-xs">{post.client_nombre}</Badge>
            )}
            <span className="text-xs font-semibold text-gray-800">
              {PLATFORM_LABELS[post.platform] ?? post.platform}
            </span>
            {post.format && (
              <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                {post.format}
              </span>
            )}
          </div>

          {post.hook && (
            <p className="text-sm font-medium text-gray-900 line-clamp-1">"{post.hook}"</p>
          )}

          {post.design_notes && (
            <p className="text-xs text-orange-700 mt-0.5 line-clamp-1">
              📝 {post.design_notes}
            </p>
          )}

          {post.scheduled_date && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
              <Calendar className="h-3 w-3 shrink-0" />
              {new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('es-ES', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </div>
          )}
        </div>

        {/* Chevron hint */}
        <span className="text-gray-300 group-hover:text-orange-400 text-lg leading-none shrink-0 mt-0.5">›</span>
      </div>
    </button>
  )
}
