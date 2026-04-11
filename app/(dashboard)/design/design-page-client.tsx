'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Palette, ChevronDown, Loader2, CheckCircle2, Upload,
  Link as LinkIcon, AlertCircle, Calendar, ChevronRight,
} from 'lucide-react'
import { Button }  from '@/components/ui/button'
import { Badge }   from '@/components/ui/badge'
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
  const [expandedPost,   setExpandedPost]   = useState<string | null>(null)

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

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
          <Palette className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Panel de Diseño</h1>
          <p className="text-sm text-gray-500">Piezas de contenido pendientes de recurso visual</p>
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
            {filterClientId ? 'Este cliente no tiene piezas pendientes de diseño.' : 'No hay piezas pendientes de recurso visual en ningún cliente.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <DesignCard
              key={post.id}
              post={post}
              showClient={!filterClientId}
              isExpanded={expandedPost === post.id}
              onToggle={() => setExpandedPost((prev) => prev === post.id ? null : post.id)}
              onMarkedReady={fetchPosts}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Design Card ──────────────────────────────────────────────────────────────

function DesignCard({
  post, showClient, isExpanded, onToggle, onMarkedReady,
}: {
  post        : DesignPost
  showClient  : boolean
  isExpanded  : boolean
  onToggle    : () => void
  onMarkedReady: () => void
}) {
  const [assetUrl,     setAssetUrl]     = useState(post.asset_url ?? '')
  const [assetType,    setAssetType]    = useState<'image' | 'video'>('image')
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null)
  const [uploading,    setUploading]    = useState(false)
  const [uploadError,  setUploadError]  = useState('')
  const [marking,      setMarking]      = useState(false)
  const [markedDone,   setMarkedDone]   = useState(false)
  const [progress,     setProgress]     = useState(0)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Local preview
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    setAssetType(file.type.startsWith('video/') ? 'video' : 'image')

    setUploading(true)
    setUploadError('')
    setProgress(10)

    try {
      const formData = new FormData()
      formData.append('file',     file)
      formData.append('clientId', post.client_id)
      formData.append('postId',   post.id)

      setProgress(40)
      const res = await fetch('/api/social/upload-asset', {
        method: 'POST',
        body  : formData,
      })
      const data = await res.json() as { url: string; assetType: string } | { error: string }
      if (!res.ok) throw new Error((data as any).error)

      setProgress(100)
      setAssetUrl((data as any).url)
      setAssetType((data as any).assetType)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al subir el archivo')
      setPreviewUrl(null)
    } finally {
      setUploading(false)
    }
  }

  function handleUrlPaste(url: string) {
    setAssetUrl(url)
    if (url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)) {
      setPreviewUrl(url)
      setAssetType('image')
    } else if (url.match(/\.(mp4|webm|mov)(\?|$)/i)) {
      setPreviewUrl(url)
      setAssetType('video')
    }
  }

  async function handleMarkReady() {
    if (!assetUrl.trim()) return
    setMarking(true)
    try {
      const res = await fetch('/api/social/posts', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          id          : post.id,
          status      : 'listo',
          asset_url   : assetUrl.trim(),
          asset_type  : assetType,
          asset_source: 'designer',
          updated_at  : new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      setMarkedDone(true)
      setTimeout(() => onMarkedReady(), 1200)
    } catch { /* silencioso */ }
    finally { setMarking(false) }
  }

  if (markedDone) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <p className="text-sm font-medium text-emerald-800">Pieza lista para publicar ✓</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Card header */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className={`h-8 w-8 rounded-lg ${PLATFORM_COLORS[post.platform] ?? 'bg-gray-600'} flex items-center justify-center shrink-0`}>
          <span className="text-white text-xs font-bold">
            {(PLATFORM_LABELS[post.platform] ?? post.platform).slice(0, 2).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {showClient && (
              <Badge variant="secondary" className="text-xs">{post.client_nombre}</Badge>
            )}
            <span className="text-xs font-semibold text-gray-800">
              {PLATFORM_LABELS[post.platform] ?? post.platform}
            </span>
            {post.format && (
              <span className="text-xs text-gray-400">{post.format}</span>
            )}
          </div>
          {post.hook && (
            <p className="text-sm text-gray-700 mt-0.5 line-clamp-1">"{post.hook}"</p>
          )}
          {post.scheduled_date && (
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
              <Calendar className="h-3 w-3" />
              Para publicar: {new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('es-ES', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </div>
          )}
        </div>

        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 space-y-4 pt-4">
          {/* Visual briefing */}
          {post.visual_description && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Briefing visual</p>
              <p className="text-sm text-gray-700 leading-relaxed">{post.visual_description}</p>
            </div>
          )}

          {/* Design notes */}
          {post.design_notes && post.design_notes !== post.visual_description && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Instrucciones adicionales</p>
              <p className="text-sm text-gray-600 leading-relaxed">{post.design_notes}</p>
            </div>
          )}

          {/* Upload zone */}
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-4 space-y-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Subir recurso visual</p>

            {/* File upload */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-1.5 text-xs"
              >
                {uploading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo ({progress}%)…</>
                  : <><Upload className="h-3.5 w-3.5" /> Seleccionar archivo</>
                }
              </Button>
              <span className="text-xs text-gray-400 ml-2">Imágenes hasta 10MB · Vídeos hasta 50MB</span>
            </div>

            {/* URL input */}
            <div className="flex items-center gap-2">
              <LinkIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <input
                type="url"
                placeholder="O pegar URL del recurso (Canva, Drive, Dropbox…)"
                value={assetUrl}
                onChange={(e) => handleUrlPaste(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
              />
            </div>

            {/* Preview */}
            {previewUrl && (
              <div className="rounded-lg overflow-hidden border border-gray-200 bg-white max-h-48">
                {assetType === 'video'
                  ? <video src={previewUrl} controls className="w-full max-h-48 object-contain" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={previewUrl} alt="Preview" className="w-full max-h-48 object-contain" />
                }
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {uploadError}
              </div>
            )}
          </div>

          {/* Mark ready button */}
          <Button
            onClick={handleMarkReady}
            disabled={marking || !assetUrl.trim()}
            className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
          >
            {marking
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
              : <><CheckCircle2 className="h-4 w-4" /> Marcar como listo</>
            }
          </Button>
        </div>
      )}
    </div>
  )
}

