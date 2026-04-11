'use client'

import { useState, useCallback } from 'react'
import { Loader2, Sparkles, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformData {
  id?                      : string
  client_id                : string
  platform                 : string
  is_active                : boolean
  handle?                  : string
  profile_url?             : string
  followers?               : number | null
  following?               : number | null
  posts_per_week?          : number | null
  avg_engagement?          : number | null
  last_post_date?          : string | null
  formats_used             : string[]
  main_topics?             : string
  top_post_example?        : string
  score_brand_consistency  : number
  score_editorial_quality  : number
  score_activity           : number
  score_community          : number
  observations?            : string
  strategic_conclusion?    : string
  strategic_priority?      : 'alta' | 'mantener' | 'evaluar' | 'descartar' | null
}

interface Props {
  clientId     : string
  platform     : string
  initialData? : Partial<PlatformData>
  defaultOpen? : boolean
  onSaved?     : (data: PlatformData) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  linkedin  : 'LinkedIn',
  twitter_x : 'Twitter / X',
  instagram : 'Instagram',
  facebook  : 'Facebook',
  tiktok    : 'TikTok',
  youtube   : 'YouTube',
}

const PLATFORM_ICONS: Record<string, string> = {
  linkedin  : '💼',
  twitter_x : '𝕏',
  instagram : '📸',
  facebook  : '👥',
  tiktok    : '🎵',
  youtube   : '▶️',
}

const FORMATS_BY_PLATFORM: Record<string, string[]> = {
  linkedin  : ['Artículos', 'Posts texto', 'Documentos PDF', 'Vídeo nativo', 'Newsletters', 'Encuestas'],
  twitter_x : ['Tweets texto', 'Hilos', 'Imágenes', 'Vídeos cortos', 'Encuestas', 'Spaces'],
  instagram : ['Posts foto', 'Carruseles', 'Reels', 'Stories', 'Lives', 'Guías'],
  facebook  : ['Posts texto', 'Imágenes', 'Vídeos', 'Stories', 'Lives', 'Grupos'],
  tiktok    : ['Vídeos cortos', 'Lives', 'Duetos', 'Trends', 'Vídeos explicativos'],
  youtube   : ['Vídeos largos', 'Shorts', 'Lives', 'Comunidad', 'Podcasts'],
}

const PRIORITY_OPTIONS: Array<{ value: PlatformData['strategic_priority']; label: string; color: string }> = [
  { value: 'alta',      label: 'Alta prioridad',  color: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'mantener',  label: 'Mantener',         color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'evaluar',   label: 'Evaluar',           color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'descartar', label: 'Descartar',         color: 'bg-gray-100 text-gray-600 border-gray-200' },
]

const SCORE_LABELS: Record<number, string> = { 1: 'Muy bajo', 2: 'Bajo', 3: 'Medio', 4: 'Alto', 5: 'Excelente' }

// ─── Slider Component ─────────────────────────────────────────────────────────

function ScoreSlider({
  label,
  value,
  onChange,
}: {
  label   : string
  value   : number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">{label}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
          ${value >= 4 ? 'bg-green-100 text-green-700' :
            value >= 3 ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'}
        `}>
          {value}/5 · {SCORE_LABELS[value]}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-pink-600"
      />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuditByPlatform({ clientId, platform, initialData, defaultOpen = false, onSaved }: Props) {
  const [expanded, setExpanded] = useState(defaultOpen)

  const [data, setData] = useState<PlatformData>({
    client_id              : clientId,
    platform,
    is_active              : initialData?.is_active              ?? false,
    handle                 : initialData?.handle                 ?? '',
    profile_url            : initialData?.profile_url            ?? '',
    followers              : initialData?.followers              ?? null,
    following              : initialData?.following              ?? null,
    posts_per_week         : initialData?.posts_per_week         ?? null,
    avg_engagement         : initialData?.avg_engagement         ?? null,
    last_post_date         : initialData?.last_post_date         ?? null,
    formats_used           : initialData?.formats_used           ?? [],
    main_topics            : initialData?.main_topics            ?? '',
    top_post_example       : initialData?.top_post_example       ?? '',
    score_brand_consistency: initialData?.score_brand_consistency ?? 3,
    score_editorial_quality: initialData?.score_editorial_quality ?? 3,
    score_activity         : initialData?.score_activity         ?? 3,
    score_community        : initialData?.score_community        ?? 3,
    observations           : initialData?.observations           ?? '',
    strategic_conclusion   : initialData?.strategic_conclusion   ?? '',
    strategic_priority     : initialData?.strategic_priority     ?? null,
  })

  const [saving,      setSaving]      = useState(false)
  const [generating,  setGenerating]  = useState(false)
  const [savedAt,     setSavedAt]     = useState<string | null>(null)

  const set = useCallback(<K extends keyof PlatformData>(key: K, value: PlatformData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }))
    setSavedAt(null)
  }, [])

  function toggleFormat(fmt: string) {
    setData((prev) => ({
      ...prev,
      formats_used: prev.formats_used.includes(fmt)
        ? prev.formats_used.filter((f) => f !== fmt)
        : [...prev.formats_used, fmt],
    }))
    setSavedAt(null)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/social/platforms', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(data),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const saved = await res.json() as PlatformData
      setData((prev) => ({ ...prev, ...saved }))
      setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      onSaved?.(saved)
    } catch (err) {
      console.error('[AuditByPlatform] Save error:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateConclusion() {
    setGenerating(true)
    try {
      const res = await fetch('/api/social/generate-platform-conclusion', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, platform, platformData: data }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { conclusion } = await res.json() as { conclusion: string }
      set('strategic_conclusion', conclusion)
    } catch (err) {
      console.error('[AuditByPlatform] Generate error:', err)
    } finally {
      setGenerating(false)
    }
  }

  const platformLabel = PLATFORM_LABELS[platform] ?? platform
  const platformIcon  = PLATFORM_ICONS[platform] ?? '🌐'
  const availableFormats = FORMATS_BY_PLATFORM[platform] ?? []
  const priorityOption = PRIORITY_OPTIONS.find((o) => o.value === data.strategic_priority)

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* ── Cabecera colapsable ── */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{platformIcon}</span>
          <div className="text-left">
            <span className="text-sm font-semibold text-gray-900">{platformLabel}</span>
            {data.strategic_conclusion && (
              <p className="text-xs text-gray-500 mt-0.5 max-w-sm line-clamp-1">{data.strategic_conclusion}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {priorityOption && (
            <Badge className={`text-xs ${priorityOption.color}`}>{priorityOption.label}</Badge>
          )}
          <div className={`h-2.5 w-2.5 rounded-full ${data.is_active ? 'bg-green-400' : 'bg-gray-300'}`} title={data.is_active ? 'Activa' : 'Sin presencia'} />
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {/* ── Formulario ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-6">
          {/* SECCIÓN 1: Presencia */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Presencia actual</h4>
            <div className="flex items-center gap-3 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.is_active}
                  onChange={(e) => set('is_active', e.target.checked)}
                  className="h-4 w-4 rounded accent-pink-600"
                />
                <span className="text-sm text-gray-700">Tiene presencia activa en {platformLabel}</span>
              </label>
            </div>

            {data.is_active && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Handle / usuario</label>
                  <input
                    type="text"
                    value={data.handle ?? ''}
                    onChange={(e) => set('handle', e.target.value)}
                    onBlur={handleSave}
                    placeholder="@usuario"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">URL del perfil</label>
                  <input
                    type="url"
                    value={data.profile_url ?? ''}
                    onChange={(e) => set('profile_url', e.target.value)}
                    onBlur={handleSave}
                    placeholder="https://..."
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECCIÓN 2: Datos cuantitativos */}
          {data.is_active && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Datos cuantitativos</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Seguidores</label>
                  <input
                    type="number"
                    min={0}
                    value={data.followers ?? ''}
                    onChange={(e) => set('followers', e.target.value ? Number(e.target.value) : null)}
                    onBlur={handleSave}
                    placeholder="0"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Siguiendo</label>
                  <input
                    type="number"
                    min={0}
                    value={data.following ?? ''}
                    onChange={(e) => set('following', e.target.value ? Number(e.target.value) : null)}
                    onBlur={handleSave}
                    placeholder="0"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Posts / semana</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={data.posts_per_week ?? ''}
                    onChange={(e) => set('posts_per_week', e.target.value ? Number(e.target.value) : null)}
                    onBlur={handleSave}
                    placeholder="0"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Engagement %</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={data.avg_engagement ?? ''}
                    onChange={(e) => set('avg_engagement', e.target.value ? Number(e.target.value) : null)}
                    onBlur={handleSave}
                    placeholder="0.00"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="text-xs text-gray-500 block mb-1">Último post</label>
                <input
                  type="date"
                  value={data.last_post_date ?? ''}
                  onChange={(e) => set('last_post_date', e.target.value || null)}
                  onBlur={handleSave}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>
            </div>
          )}

          {/* SECCIÓN 3: Formatos usados */}
          {data.is_active && availableFormats.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Formatos usados</h4>
              <div className="flex flex-wrap gap-2">
                {availableFormats.map((fmt) => {
                  const active = data.formats_used.includes(fmt)
                  return (
                    <button
                      key={fmt}
                      onClick={() => toggleFormat(fmt)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                        ${active
                          ? 'bg-pink-100 text-pink-800 border-pink-300 font-medium'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }
                      `}
                    >
                      {active && <span className="mr-1">✓</span>}
                      {fmt}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* SECCIÓN 4: Contenido */}
          {data.is_active && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Contenido</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Temas principales</label>
                  <textarea
                    rows={2}
                    value={data.main_topics ?? ''}
                    onChange={(e) => set('main_topics', e.target.value)}
                    onBlur={handleSave}
                    placeholder="Ej: noticias del sector, casos de éxito, contenido educativo..."
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Ejemplo de post más exitoso (URL o descripción)</label>
                  <input
                    type="text"
                    value={data.top_post_example ?? ''}
                    onChange={(e) => set('top_post_example', e.target.value)}
                    onBlur={handleSave}
                    placeholder="URL o descripción del contenido más destacado"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
              </div>
            </div>
          )}

          {/* SECCIÓN 5: Valoraciones 1-5 */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">Valoración cualitativa</h4>
            <div className="space-y-4">
              <ScoreSlider
                label="Consistencia de marca"
                value={data.score_brand_consistency}
                onChange={(v) => set('score_brand_consistency', v)}
              />
              <ScoreSlider
                label="Calidad editorial"
                value={data.score_editorial_quality}
                onChange={(v) => set('score_editorial_quality', v)}
              />
              <ScoreSlider
                label="Actividad y frecuencia"
                value={data.score_activity}
                onChange={(v) => set('score_activity', v)}
              />
              <ScoreSlider
                label="Comunidad y engagement"
                value={data.score_community}
                onChange={(v) => set('score_community', v)}
              />
            </div>
          </div>

          {/* SECCIÓN 6: Observaciones */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-400 block mb-2">
              Observaciones del auditor
            </label>
            <textarea
              rows={3}
              value={data.observations ?? ''}
              onChange={(e) => set('observations', e.target.value)}
              onBlur={handleSave}
              placeholder="Notas adicionales, contexto, puntos de atención..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
            />
          </div>

          {/* SECCIÓN 7: Conclusión estratégica */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wide text-gray-400">
                Conclusión estratégica
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerateConclusion}
                disabled={generating}
                className="text-xs gap-1.5 text-pink-600 hover:text-pink-700 hover:bg-pink-50 h-7 px-2"
              >
                {generating
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Generando…</>
                  : <><Sparkles className="h-3 w-3" /> Generar con IA</>
                }
              </Button>
            </div>
            <textarea
              rows={4}
              value={data.strategic_conclusion ?? ''}
              onChange={(e) => set('strategic_conclusion', e.target.value)}
              onBlur={handleSave}
              placeholder="Conclusión sobre el rol de esta plataforma en la estrategia del cliente..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
            />
          </div>

          {/* SECCIÓN 8: Prioridad estratégica */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-400 block mb-3">
              Prioridad estratégica
            </label>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    set('strategic_priority', opt.value)
                  }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium
                    ${data.strategic_priority === opt.value
                      ? opt.color
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  {data.strategic_priority === opt.value && <span className="mr-1">✓</span>}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Pie: guardar ── */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              {savedAt && (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="h-3 w-3" /> Guardado a las {savedAt}
                </span>
              )}
            </span>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white"
            >
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</>
                : 'Guardar plataforma'
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
