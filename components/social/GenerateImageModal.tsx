'use client'

import { useState } from 'react'
import { Loader2, Sparkles, X, RefreshCw, Check, Wand2, Info } from 'lucide-react'
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

interface GenerateResult {
  modelUsed      : string
  modelReason    : string
  generatedPrompt: string
  variations     : string[]
  generationId   : string | null
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

// ─── Style config ─────────────────────────────────────────────────────────────

const STYLES: Array<{ value: string; label: string; badge: string; model: string }> = [
  { value: 'photorealistic', label: 'Fotorrealista',       badge: 'Flux Ultra',  model: 'fal-ai/flux-pro/v1.1-ultra' },
  { value: 'illustration',   label: 'Ilustración',         badge: 'Flux Dev',    model: 'fal-ai/flux/dev'            },
  { value: 'minimalista',    label: 'Minimalista',         badge: 'Recraft V3',  model: 'fal-ai/recraft-v3'          },
  { value: 'editorial',      label: 'Editorial',           badge: 'Recraft V3',  model: 'fal-ai/recraft-v3'          },
  { value: 'corporativo',    label: 'Corporativo',         badge: 'Recraft V3',  model: 'fal-ai/recraft-v3'          },
  { value: 'datos',          label: 'Datos / Gráfico',     badge: 'Satori',      model: 'satori'                     },
]

const MODEL_LABELS: Record<string, string> = {
  'fal-ai/flux-pro/v1.1-ultra': 'Flux Pro Ultra',
  'fal-ai/recraft-v3'         : 'Recraft V3',
  'fal-ai/flux/dev'           : 'Flux Dev',
  'satori'                    : 'Satori (vectorial)',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GenerateImageModal({
  postId, clientId, platform, format, visualDescription, onClose, onImageGenerated,
}: Props) {
  const [prompt,         setPrompt]         = useState(visualDescription)
  const [ratio,          setRatio]          = useState(() => defaultRatioForPlatform(platform, format))
  const [style,          setStyle]          = useState('photorealistic')
  const [includeLogo,    setIncludeLogo]    = useState(true)
  const [overlayText,    setOverlayText]    = useState('')
  const [showOverlay,    setShowOverlay]    = useState(false)

  const [generating,     setGenerating]     = useState(false)
  const [genError,       setGenError]       = useState('')
  const [genResult,      setGenResult]      = useState<GenerateResult | null>(null)
  const [selectedIdx,    setSelectedIdx]    = useState<number>(0)
  const [lightboxUrl,    setLightboxUrl]    = useState<string | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [showPromptInfo, setShowPromptInfo] = useState(false)

  // ── Generate ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true)
    setGenError('')
    setGenResult(null)
    try {
      const res = await fetch('/api/visual/generate', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          postId,
          clientId,
          platform,
          format,
          style,
          ratio,
          visualDescription: prompt.trim(),
          includeLogo,
          overlayText: showOverlay && overlayText.trim() ? overlayText.trim() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al generar')
      setGenResult(data as GenerateResult)
      setSelectedIdx(0)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Error al generar la imagen')
    } finally {
      setGenerating(false)
    }
  }

  // ── Use selected variation ───────────────────────────────────────────────────

  async function handleUse() {
    if (!genResult) return
    const url = genResult.variations[selectedIdx]
    if (!url) return
    setSaving(true)
    try {
      // Save selected_url to visual_generations
      if (genResult.generationId) {
        fetch('/api/visual/generate', {
          method : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ generationId: genResult.generationId, selectedUrl: url }),
        }).catch(() => {})
      }
      // Update social post
      await fetch('/api/social/posts', {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          id          : postId,
          asset_url   : url,
          asset_type  : 'image',
          asset_source: 'ai_generated',
          status      : 'listo',
        }),
      })
      onImageGenerated(url)
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const selectedStyleConfig = STYLES.find(s => s.value === style)
  const modelLabel = genResult
    ? (MODEL_LABELS[genResult.modelUsed] ?? genResult.modelUsed)
    : selectedStyleConfig?.badge ?? ''

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-500" />
              Generar imagen con IA
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {genResult
                ? `3 variaciones generadas con ${MODEL_LABELS[genResult.modelUsed] ?? genResult.modelUsed}`
                : 'Selecciona estilo y genera 3 variaciones para elegir'
              }
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Prompt (optional) ────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Descripción visual
                <span className="ml-1.5 font-normal text-gray-400 normal-case">(opcional)</span>
              </label>
              {!prompt.trim() && (
                <span className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  <Wand2 className="h-3 w-3" />
                  Claude la generará automáticamente
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none placeholder-gray-300"
              placeholder="Deja vacío y Claude describirá el visual automáticamente…"
            />
          </div>

          {/* ── Style selector ────────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Estilo visual
            </label>
            <div className="grid grid-cols-3 gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={`rounded-lg border p-2.5 text-left transition-all ${
                    style === s.value
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-800">{s.label}</div>
                  <div className={`text-[10px] mt-0.5 font-medium px-1.5 py-0.5 rounded inline-block ${
                    style === s.value
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {s.badge}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Ratio ─────────────────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Proporción
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

          {/* ── Toggles ───────────────────────────────────────────────────────── */}
          <div className="space-y-1 border border-gray-100 rounded-xl p-3">
            <label className="flex items-center justify-between py-1.5 cursor-pointer">
              <span className="text-sm text-gray-700">Incluir logo de marca</span>
              <button
                onClick={() => setIncludeLogo(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${includeLogo ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${includeLogo ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between py-1.5 cursor-pointer">
              <span className="text-sm text-gray-700">Añadir texto en la imagen</span>
              <button
                onClick={() => setShowOverlay(v => !v)}
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
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 mt-1"
              />
            )}
          </div>

          {/* ── Error ─────────────────────────────────────────────────────────── */}
          {genError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
              <span className="shrink-0">⚠️</span>
              {genError}
            </div>
          )}

          {/* ── Generating state ──────────────────────────────────────────────── */}
          {generating && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm font-medium">Generando 3 variaciones…</p>
              <p className="text-xs text-gray-400">puede tardar 20-40 segundos</p>
            </div>
          )}

          {/* ── Variations grid ───────────────────────────────────────────────── */}
          {genResult && !generating && (
            <div className="space-y-3">
              {/* Model badge */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Selecciona una variación
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                    {MODEL_LABELS[genResult.modelUsed] ?? genResult.modelUsed}
                  </span>
                  <button
                    title="Ver prompt generado"
                    onClick={() => setShowPromptInfo(v => !v)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Generated prompt info (collapsible) */}
              {showPromptInfo && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Motivo del modelo</p>
                  <p className="text-xs text-gray-600">{genResult.modelReason}</p>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-2">Prompt generado</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{genResult.generatedPrompt}</p>
                </div>
              )}

              {/* 3-column variation grid */}
              <div className="grid grid-cols-3 gap-2">
                {genResult.variations.map((url, i) => (
                  <button
                    key={url}
                    onClick={() => setSelectedIdx(i)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all group ${
                      selectedIdx === i
                        ? 'border-blue-500 ring-2 ring-blue-300'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Variación ${i + 1}`}
                      className="w-full aspect-square object-cover"
                    />
                    {/* Selection indicator */}
                    {selectedIdx === i && (
                      <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                    {/* Hover to enlarge */}
                    <div
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end justify-center pb-1 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); setLightboxUrl(url) }}
                    >
                      <span className="text-white text-[10px] bg-black/60 px-2 py-0.5 rounded-full">
                        Ver completo
                      </span>
                    </div>
                    <div className="absolute bottom-1 left-1 text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded-full pointer-events-none">
                      {i + 1}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="p-5 border-t border-gray-100 flex items-center gap-2 shrink-0">
          {!genResult ? (
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              {generating
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                : <><Sparkles className="h-3.5 w-3.5" /> Generar 3 variaciones</>
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
                disabled={saving || genResult.variations.length === 0}
                className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                {saving
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</>
                  : <><Check className="h-3.5 w-3.5" /> Usar variación {selectedIdx + 1}</>
                }
              </Button>
            </>
          )}
        </div>
      </div>
    </div>

    {/* ── Lightbox ───────────────────────────────────────────────────────────── */}
    {lightboxUrl && (
      <div
        className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4"
        onClick={() => setLightboxUrl(null)}
      >
        <button
          className="absolute top-4 right-4 text-white/70 hover:text-white"
          onClick={() => setLightboxUrl(null)}
        >
          <X className="h-7 w-7" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={lightboxUrl}
          alt="Variación ampliada"
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    </>
  )
}
