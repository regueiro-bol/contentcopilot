'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus,
  Loader2,
  Sparkles,
  Film,
  CheckCircle2,
  XCircle,
  Pencil,
  PlayCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────
type Platform = 'tiktok' | 'instagram_reels' | 'youtube_shorts' | 'linkedin'
type VideoFormat = '9x16' | '16x9' | '1x1' | 'both'
type Tone = 'divulgativo' | 'periodistico' | 'cercano' | 'tecnico'
type Intention = 'informativo' | 'educativo' | 'promocional'
type VideoStatus =
  | 'draft_script'
  | 'script_approved'
  | 'generating'
  | 'draft_video'
  | 'approved'
  | 'rejected'

export interface VideoProject {
  id: string
  client_id: string
  content_id: string | null
  title: string
  brief: string
  script: string | null
  narrative_hook: string | null
  platform: Platform | null
  tone: Tone | null
  intention: Intention | null
  apply_brand_assets: boolean | null
  show_logo: boolean | null
  duration_seconds: number
  format: VideoFormat
  status: VideoStatus
  video_url: string | null
  created_at: string
}

interface VideoScene {
  id: string
  video_project_id: string
  scene_index: number
  description: string
  narration_text: string
  duration_seconds: number
  image_url: string | null
  video_clip_url: string | null
  audio_url: string | null
  status: 'pending' | 'generating' | 'ready' | 'error'
  shot_type: string | null
  camera_angle: string | null
  camera_movement: string | null
  lens: string | null
  lighting: string | null
  background: string | null
  text_overlay: string | null
  seedance_prompt: string | null
}

export interface ContenidoOption {
  id: string
  titulo: string
  estado: string
}

interface Props {
  clientId: string
  clientNombre: string
  initialProjects: VideoProject[]
  initialScenesByProject: Record<string, unknown[]>
  contenidos: ContenidoOption[]
  prefillContentId?: string
  openModalOnMount?: boolean
}

// ─── Constants ─────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<VideoStatus, string> = {
  draft_script: 'Borrador de guión',
  script_approved: 'Guión aprobado',
  generating: 'Generando…',
  draft_video: 'Borrador de vídeo',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}
const STATUS_COLOR: Record<VideoStatus, string> = {
  draft_script: 'bg-amber-100 text-amber-800 border-amber-200',
  script_approved: 'bg-blue-100 text-blue-800 border-blue-200',
  generating: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  draft_video: 'bg-purple-100 text-purple-800 border-purple-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
}
const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram_reels: 'Instagram Reels',
  youtube_shorts: 'YouTube Shorts',
  linkedin: 'LinkedIn',
}

const SHOT_TYPES = [
  'primer_plano',
  'plano_detalle',
  'plano_medio',
  'plano_general',
  'plano_americano',
] as const
const CAMERA_ANGLES = ['normal', 'picado', 'contrapicado', 'cenital'] as const
const CAMERA_MOVEMENTS = [
  'estatico',
  'dolly_in',
  'dolly_out',
  'pan_left',
  'pan_right',
  'tilt_up',
  'tilt_down',
  'zoom_in',
  'zoom_out',
] as const
const LENSES = ['24mm', '35mm', '50mm', '85mm', '135mm'] as const
const LIGHTINGS = ['natural_calida', 'natural_fria', 'estudio', 'dramatica', 'suave'] as const

// ─── Component ─────────────────────────────────────────────────────────────
export default function VideosClient({
  clientId,
  clientNombre,
  initialProjects,
  initialScenesByProject,
  contenidos,
  prefillContentId,
  openModalOnMount,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [projects, setProjects] = useState<VideoProject[]>(initialProjects)
  const [scenesByProject, setScenesByProject] = useState<Record<string, VideoScene[]>>(
    initialScenesByProject as Record<string, VideoScene[]>,
  )

  const [openNew, setOpenNew] = useState(openModalOnMount ?? false)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Modal form state
  const [contentId, setContentId] = useState<string>(prefillContentId ?? '')
  const [brief, setBrief] = useState('')
  const [platform, setPlatform] = useState<Platform>('instagram_reels')
  const [format, setFormat] = useState<VideoFormat>('9x16')
  const [duration, setDuration] = useState<15 | 30 | 60>(15)
  const [tone, setTone] = useState<Tone>('cercano')
  const [intention, setIntention] = useState<Intention>('informativo')
  const [applyBrand, setApplyBrand] = useState(true)
  const [showLogo, setShowLogo] = useState(true)

  useEffect(() => {
    if (openModalOnMount) setOpenNew(true)
  }, [openModalOnMount])

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function handleCreate() {
    if (!contentId && !brief.trim()) {
      alert('Elige un contenido o escribe un brief')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/videos/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          content_id: contentId || undefined,
          brief: brief.trim() || undefined,
          platform,
          format,
          duration_seconds: duration,
          tone,
          intention,
          apply_brand_assets: applyBrand,
          show_logo: showLogo,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar guión')
      setProjects((p) => [data.project, ...p])
      setScenesByProject((m) => ({ ...m, [data.project.id]: data.scenes }))
      setOpenNew(false)
      setBrief('')
      setContentId('')
      setEditingId(data.project.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setCreating(false)
    }
  }

  async function handleSaveScript(
    projectId: string,
    scenes: VideoScene[],
    approve = false,
  ) {
    const res = await fetch(`/api/videos/${projectId}/script`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenes: scenes.map((s) => ({
          id: s.id,
          description: s.description,
          narration_text: s.narration_text,
          duration_seconds: s.duration_seconds,
          shot_type: s.shot_type ?? undefined,
          camera_angle: s.camera_angle ?? undefined,
          camera_movement: s.camera_movement ?? undefined,
          lens: s.lens ?? undefined,
          lighting: s.lighting ?? undefined,
          background: s.background ?? undefined,
          text_overlay: s.text_overlay ?? undefined,
          seedance_prompt: s.seedance_prompt ?? undefined,
        })),
        approve,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Error al guardar')
      return
    }
    setProjects((p) => p.map((x) => (x.id === projectId ? data.project : x)))
    setScenesByProject((m) => ({ ...m, [projectId]: data.scenes }))
  }

  async function handleGenerate(projectId: string) {
    setProjects((p) =>
      p.map((x) => (x.id === projectId ? { ...x, status: 'generating' } : x)),
    )
    try {
      const res = await fetch(`/api/videos/${projectId}/generate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar vídeo')
      setProjects((p) => p.map((x) => (x.id === projectId ? data.project : x)))
      setScenesByProject((m) => ({ ...m, [projectId]: data.scenes }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido')
      refresh()
    }
  }

  async function handleStatus(projectId: string, status: 'approved' | 'rejected') {
    const res = await fetch(`/api/videos/${projectId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json()
    if (!res.ok) return alert(data.error || 'Error')
    setProjects((p) => p.map((x) => (x.id === projectId ? data.project : x)))
  }

  const totalDuration = (sceneList: VideoScene[]) =>
    sceneList.reduce((sum, s) => sum + (s.duration_seconds || 0), 0)

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Film className="h-6 w-6 text-indigo-600" />
            Vídeos
          </h1>
          <p className="text-sm text-gray-500 mt-1">{clientNombre}</p>
        </div>
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo vídeo
        </Button>
      </header>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-500">
            <Film className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>Aún no hay vídeos para este cliente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              scenes={scenesByProject[p.id] ?? []}
              isEditing={editingId === p.id}
              onToggleEdit={() => setEditingId(editingId === p.id ? null : p.id)}
              onSaveScript={(scenes, approve) => handleSaveScript(p.id, scenes, approve)}
              onGenerate={() => handleGenerate(p.id)}
              onStatus={(s) => handleStatus(p.id, s)}
              onUpdateScenes={(scenes) =>
                setScenesByProject((m) => ({ ...m, [p.id]: scenes }))
              }
              totalDuration={totalDuration(scenesByProject[p.id] ?? [])}
            />
          ))}
        </div>
      )}

      {/* Modal nuevo vídeo */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo vídeo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {contenidos.length > 0 && (
              <div className="space-y-1.5">
                <Label>Contenido existente (opcional)</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 text-sm"
                  value={contentId}
                  onChange={(e) => setContentId(e.target.value)}
                >
                  <option value="">— Sin contenido (brief manual) —</option>
                  {contenidos.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.estado}] {c.titulo}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Brief {contentId ? '(opcional)' : ''}</Label>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder={
                  contentId
                    ? 'Instrucciones adicionales para el director de arte…'
                    : 'Describe el vídeo que quieres generar…'
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Plataforma</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 text-sm"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform)}
                >
                  <option value="tiktok">TikTok</option>
                  <option value="instagram_reels">Instagram Reels</option>
                  <option value="youtube_shorts">YouTube Shorts</option>
                  <option value="linkedin">LinkedIn</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Formato</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 text-sm"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as VideoFormat)}
                >
                  <option value="9x16">9:16 vertical</option>
                  <option value="16x9">16:9 horizontal</option>
                  <option value="1x1">1:1 cuadrado</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Duración</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 text-sm"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) as 15 | 30 | 60)}
                >
                  <option value={15}>15 s</option>
                  <option value={30}>30 s</option>
                  <option value={60}>60 s</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tono</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 text-sm"
                  value={tone}
                  onChange={(e) => setTone(e.target.value as Tone)}
                >
                  <option value="divulgativo">Divulgativo</option>
                  <option value="periodistico">Periodístico</option>
                  <option value="cercano">Cercano</option>
                  <option value="tecnico">Técnico</option>
                </select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Intención</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 text-sm"
                  value={intention}
                  onChange={(e) => setIntention(e.target.value as Intention)}
                >
                  <option value="informativo">Informativo</option>
                  <option value="educativo">Educativo</option>
                  <option value="promocional">Promocional</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={applyBrand}
                  onChange={(e) => setApplyBrand(e.target.checked)}
                />
                Aplicar assets de marca
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showLogo}
                  onChange={(e) => setShowLogo(e.target.checked)}
                />
                Mostrar logo
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setOpenNew(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || (!contentId && !brief.trim())}
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generar guión
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── ProjectCard ───────────────────────────────────────────────────────────
function ProjectCard({
  project,
  scenes,
  isEditing,
  onToggleEdit,
  onSaveScript,
  onGenerate,
  onStatus,
  onUpdateScenes,
  totalDuration,
}: {
  project: VideoProject
  scenes: VideoScene[]
  isEditing: boolean
  onToggleEdit: () => void
  onSaveScript: (scenes: VideoScene[], approve: boolean) => void
  onGenerate: () => void
  onStatus: (s: 'approved' | 'rejected') => void
  onUpdateScenes: (s: VideoScene[]) => void
  totalDuration: number
}) {
  const [savingApprove, setSavingApprove] = useState(false)
  const [expandedScene, setExpandedScene] = useState<string | null>(null)
  const isGenerating = project.status === 'generating'
  const hasVideo = !!project.video_url

  const updateScene = (id: string, patch: Partial<VideoScene>) =>
    onUpdateScenes(scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-gray-900">{project.title}</h2>
              <Badge
                variant="outline"
                className={`text-xs ${STATUS_COLOR[project.status]}`}
              >
                {STATUS_LABEL[project.status]}
              </Badge>
              {project.platform && (
                <Badge variant="outline" className="text-xs">
                  {PLATFORM_LABEL[project.platform]}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {totalDuration || project.duration_seconds}s · {project.format}
              </Badge>
            </div>
            {project.narrative_hook && (
              <p className="text-sm text-indigo-700 mt-1 italic">
                “{project.narrative_hook}”
              </p>
            )}
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.brief}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(project.status === 'draft_script' ||
              project.status === 'script_approved') && (
              <Button variant="outline" size="sm" onClick={onToggleEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                {isEditing ? 'Cerrar' : 'Editar guión'}
              </Button>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="mt-5 space-y-3 border-t pt-4">
            <Label className="text-xs">Escenas</Label>
            {scenes.map((s, idx) => {
              const isOpen = expandedScene === s.id
              return (
                <div key={s.id} className="border rounded-md bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setExpandedScene(isOpen ? null : s.id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-700">
                        Escena {idx + 1}
                      </span>
                      <span className="text-xs text-gray-500">
                        {s.duration_seconds}s · {s.shot_type ?? '—'} ·{' '}
                        {s.camera_movement ?? '—'}
                      </span>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 space-y-3 border-t bg-white">
                      <div className="grid grid-cols-2 gap-3 pt-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500">
                            Duración (s)
                          </Label>
                          <Input
                            type="number"
                            min={2}
                            max={15}
                            value={s.duration_seconds}
                            onChange={(e) =>
                              updateScene(s.id, {
                                duration_seconds: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500">Plano</Label>
                          <select
                            className="w-full border rounded-md h-9 px-2 text-sm"
                            value={s.shot_type ?? ''}
                            onChange={(e) =>
                              updateScene(s.id, { shot_type: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {SHOT_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t.replace('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500">Ángulo</Label>
                          <select
                            className="w-full border rounded-md h-9 px-2 text-sm"
                            value={s.camera_angle ?? ''}
                            onChange={(e) =>
                              updateScene(s.id, { camera_angle: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {CAMERA_ANGLES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500">
                            Movimiento
                          </Label>
                          <select
                            className="w-full border rounded-md h-9 px-2 text-sm"
                            value={s.camera_movement ?? ''}
                            onChange={(e) =>
                              updateScene(s.id, { camera_movement: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {CAMERA_MOVEMENTS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500">Objetivo</Label>
                          <select
                            className="w-full border rounded-md h-9 px-2 text-sm"
                            value={s.lens ?? ''}
                            onChange={(e) =>
                              updateScene(s.id, { lens: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {LENSES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500">
                            Iluminación
                          </Label>
                          <select
                            className="w-full border rounded-md h-9 px-2 text-sm"
                            value={s.lighting ?? ''}
                            onChange={(e) =>
                              updateScene(s.id, { lighting: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {LIGHTINGS.map((t) => (
                              <option key={t} value={t}>
                                {t.replace('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-gray-500">Narración</Label>
                        <Textarea
                          rows={2}
                          value={s.narration_text}
                          onChange={(e) =>
                            updateScene(s.id, { narration_text: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-gray-500">
                          Descripción visual
                        </Label>
                        <Textarea
                          rows={2}
                          value={s.description}
                          onChange={(e) =>
                            updateScene(s.id, { description: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-gray-500">
                          Texto en pantalla
                        </Label>
                        <Input
                          value={s.text_overlay ?? ''}
                          onChange={(e) =>
                            updateScene(s.id, { text_overlay: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-gray-500">
                          Prompt de Seedance (en inglés)
                        </Label>
                        <Textarea
                          rows={3}
                          value={s.seedance_prompt ?? ''}
                          onChange={(e) =>
                            updateScene(s.id, { seedance_prompt: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSaveScript(scenes, false)}
              >
                Guardar cambios
              </Button>
              <Button
                size="sm"
                disabled={savingApprove || isGenerating}
                onClick={async () => {
                  setSavingApprove(true)
                  try {
                    await onSaveScript(scenes, true)
                    onGenerate()
                  } finally {
                    setSavingApprove(false)
                  }
                }}
              >
                {savingApprove ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Aprobar y generar vídeo
              </Button>
            </div>
          </div>
        )}

        {hasVideo && project.video_url && (
          <div className="mt-5 border-t pt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <PlayCircle className="h-4 w-4" />
              Borrador de vídeo
            </div>
            <video
              src={project.video_url}
              controls
              className="rounded-md max-h-[480px] mx-auto bg-black"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStatus('rejected')}
              >
                <XCircle className="h-4 w-4 mr-1.5 text-red-500" />
                Rechazar
              </Button>
              <Button variant="outline" size="sm" onClick={onGenerate}>
                <Sparkles className="h-4 w-4 mr-1.5" />
                Regenerar
              </Button>
              <Button size="sm" onClick={() => onStatus('approved')}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Aprobar
              </Button>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="mt-5 border-t pt-4 flex items-center justify-center text-sm text-indigo-600 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generando vídeo… esto puede tardar varios minutos.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
