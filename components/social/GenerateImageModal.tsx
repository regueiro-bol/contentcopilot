'use client'

import { useState } from 'react'
import { Loader2, Sparkles, X, RefreshCw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  postId            : string
  clientId          : string
  platform          : string
  format            : string
  visualDescription : string
  onClose           : () => void
  onImageGenerated  : (assetUrl: string) => void
}

// ─── Ratio config ─────────────────────────────────────────────────────────────

const RATIOS: Array<{ value: string; label: string; dims: string }> = [
  { value: '1:1',  label: '1:1',  dims: '1024×1024' },
  { value: '16:9', label: '16:9', dims: '1344×768'  },
  { value: '9:16', label: '9:16', dims: '768×1344'  },
  { value: '4:5',  label: '4:5',  dims: '896×1120'  },
]

function defaultRatioForPlatform(platform: string, format: string): string {
  const fmt = format.toLowerCase()
  if (fmt.includes('story') || fmt.includes('reel') || platform === 'tiktok') return '9:16'
  if (platform === 'instagram') return '1:1'
  return '16:9'
}

const STYLES: Array<{ value: string; label: string }> = [
  { value: 'photorealistic', label: 'Fotorrealista'      },
  { value: 'illustration',   label: 'Ilustración'        },
  { value: 'minimalista',    label: 'Minimalista'        },
  { value: 'editorial',      label: 'Editorial'          },
  { value: 'corporativo',    label: 'Corporativo moderno' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function GenerateImageModal({
  postId, clientId, platform, format, visualDescription, onClose, onImageGenerated,
}: Props) {
  const [prompt,      setPrompt]      = useState(visualDescription)
  const [ratio,       setRatio]       = useState(() => defaultRatioForPlatform(platform, format))
  const [style,       setStyle]       = useState('photorealistic')
  const [includeLogo, setIncludeLogo] = useState(true)
  const [overlayText, setOverlayText] = useState('')
  const [showOverlay, setShowOverlay] = useState(false)

  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState('')
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)

  async function handleGenerate() {
    if (!prompt.trim()) return
    setGenerating(true)
    setGenError('')
    try {
      const res = await fetch('/api/social/generate-post-image', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          postId,
          clientId,
          platform,
          format,
          visualDescription: prompt,
          ratio,
          style,
          includeLogo,
          overlayText: showOverlay && overlayText.trim() ? overlayText.trim() : null,
        }),
      })
      const data = await res.json() as { imageUrl: string } | { error: string }
      if (!res.ok) throw new Error((data as any).error)
      setGeneratedUrl((data as { imageUrl: string }).imageUrl)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Error al generar la imagen')
    } finally {
      setGenerating(false)
    }
  }

  async function handleUse() {
    if (!generatedUrl) return
    setSaving(true)
    try {
      // Update the post with the asset
      await fetch('/api/social/posts', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          id          : postId,
          asset_url   : generatedUrl,
          asset_type  : 'image',
          asset_source: 'ai_generated',
          status      : 'listo',
        }),
      })
      onImageGenerated(generatedUrl)
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Generar imagen con IA</h2>
            <p className="text-xs text-gray-500 mt-0.5">Basada en la descripción visual de la pieza</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Prompt */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Descripción del visual
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              placeholder="Describe qué debe aparecer en la imagen…"
            />
          </div>

          {/* Ratio */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Proporción de imagen
            </label>
            <div className="grid grid-cols-4 gap-2">
              {RATIOS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRatio(r.value)}
                  className={`rounded-lg border p-2 text-center transition-all ${
                    ratio === r.value
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-800">{r.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{r.dims}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Estilo visual
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {STYLES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-gray-700">Incluir logo de marca</span>
              <button
                onClick={() => setIncludeLogo((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${includeLogo ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${includeLogo ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-gray-700">Añadir texto en la imagen</span>
              <button
                onClick={() => setShowOverlay((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showOverlay ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${showOverlay ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
            {showOverlay && (
              <input
                type="text"
                value={overlayText}
                onChange={(e) => setOverlayText(e.target.value)}
                placeholder="Texto a superponer (ej: el gancho de apertura)"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            )}
          </div>

          {/* Error */}
          {genError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
              <span className="shrink-0">⚠️</span>
              {genError}
            </div>
          )}

          {/* Generated image preview */}
          {generatedUrl && (
            <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={generatedUrl}
                alt="Imagen generada"
                className="w-full max-h-72 object-contain"
              />
            </div>
          )}

          {/* Generating state */}
          {generating && (
            <div className="flex flex-col items-center justify-center py-6 gap-3 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm">Generando imagen con IA…</p>
              <p className="text-xs text-gray-400">(puede tardar 15-30 segundos)</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex items-center gap-2 shrink-0">
          {!generatedUrl ? (
            <Button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              {generating
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                : <><Sparkles className="h-3.5 w-3.5" /> Generar imagen</>
              }
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerar
              </Button>
              <Button
                size="sm"
                onClick={handleUse}
                disabled={saving}
                className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                {saving
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</>
                  : <><Check className="h-3.5 w-3.5" /> Usar esta imagen</>
                }
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
