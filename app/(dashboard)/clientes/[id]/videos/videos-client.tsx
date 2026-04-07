'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────
type VideoType = 'images_audio' | 'animation' | 'infographic'
type VideoFormat = '9x16' | '16x9' | 'both'
type VideoStatus =
  | 'draft_script'
  | 'script_approved'
  | 'generating'
  | 'draft_video'
  | 'approved'
  | 'rejected'

interface VideoProject {
  id: string
  client_id: string
  title: string
  brief: string
  script: string | null
  video_type: VideoType
  duration_seconds: number
  format: VideoFormat
  status: VideoStatus
  video_url: string | null
  thumbnail_url: string | null
  created_at: string
  updated_at: string
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
}

interface Props {
  clientId: string
  clientNombre: string
  initialProjects: VideoProject[]
  initialScenesByProject: Record<string, unknown[]>
}

// ─── Helpers ───────────────────────────────────────────────────────────────
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

const TYPE_LABEL: Record<VideoType, string> = {
  images_audio: 'Imágenes + audio',
  animation: 'Animación',
  infographic: 'Infografía',
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function VideosClient({
  clientId,
  clientNombre,
  initialProjects,
  initialScenesByProject,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [projects, setProjects] = useState<VideoProject[]>(initialProjects)
  const [scenesByProject, setScenesByProject] = useState<Record<string, VideoScene[]>>(
    initialScenesByProject as Record<string, VideoScene[]>,
  )

  const [openNew, setOpenNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // ── Modal state
  const [brief, setBrief] = useState('')
  const [videoType, setVideoType] = useState<VideoType>('images_audio')
  const [duration, setDuration] = useState<15 | 30 | 60>(30)
  const [format, setFormat] = useState<VideoFormat>('9x16')

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function handleCreate() {
    if (!brief.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/videos/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          brief,
          video_type: videoType,
          duration_seconds: duration,
          format,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar guión')
      setProjects((p) => [data.project, ...p])
      setScenesByProject((m) => ({ ...m, [data.project.id]: data.scenes }))
      setOpenNew(false)
      setBrief('')
      setEditingId(data.project.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setCreating(false)
    }
  }

  async function handleSaveScript(
    projectId: string,
    script: string,
    scenes: VideoScene[],
    approve = false,
  ) {
    const res = await fetch(`/api/videos/${projectId}/script`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script,
        scenes: scenes.map((s) => ({
          id: s.id,
          description: s.description,
          narration_text: s.narration_text,
          duration_seconds: s.duration_seconds,
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
    if (!res.ok) {
      alert(data.error || 'Error al actualizar estado')
      return
    }
    setProjects((p) => p.map((x) => (x.id === projectId ? data.project : x)))
  }

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
            <p className="text-sm mt-1">Pulsa “Nuevo vídeo” para empezar.</p>
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
              onSaveScript={(script, scenes, approve) =>
                handleSaveScript(p.id, script, scenes, approve)
              }
              onGenerate={() => handleGenerate(p.id)}
              onStatus={(s) => handleStatus(p.id, s)}
              onUpdateScenes={(scenes) =>
                setScenesByProject((m) => ({ ...m, [p.id]: scenes }))
              }
            />
          ))}
        </div>
      )}

      {/* Modal nuevo vídeo */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo vídeo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Brief</Label>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={4}
                placeholder="Describe el vídeo que quieres generar…"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 text-sm"
                  value={videoType}
                  onChange={(e) => setVideoType(e.target.value as VideoType)}
                >
                  <option value="images_audio">Imágenes + audio</option>
                  <option value="animation">Animación</option>
                  <option value="infographic">Infografía</option>
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
                <Label className="text-xs">Formato</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 text-sm"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as VideoFormat)}
                >
                  <option value="9x16">9:16</option>
                  <option value="16x9">16:9</option>
                  <option value="both">Ambos</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpenNew(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={creating || !brief.trim()}>
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
}: {
  project: VideoProject
  scenes: VideoScene[]
  isEditing: boolean
  onToggleEdit: () => void
  onSaveScript: (script: string, scenes: VideoScene[], approve: boolean) => void
  onGenerate: () => void
  onStatus: (s: 'approved' | 'rejected') => void
  onUpdateScenes: (s: VideoScene[]) => void
}) {
  const [scriptDraft, setScriptDraft] = useState(project.script ?? '')
  const [savingApprove, setSavingApprove] = useState(false)

  const isGenerating = project.status === 'generating'
  const hasVideo = !!project.video_url

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
              <Badge variant="outline" className="text-xs">
                {TYPE_LABEL[project.video_type]}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {project.duration_seconds}s · {project.format}
              </Badge>
            </div>
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

        {/* Editor de guión */}
        {isEditing && (
          <div className="mt-5 space-y-4 border-t pt-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Guión completo</Label>
              <Textarea
                value={scriptDraft}
                onChange={(e) => setScriptDraft(e.target.value)}
                rows={5}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs">Escenas</Label>
              {scenes.map((s, idx) => (
                <div key={s.id} className="border rounded-md p-3 bg-gray-50 space-y-2">
                  <div className="text-xs font-medium text-gray-500">
                    Escena {idx + 1} · {s.duration_seconds}s
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-gray-500">
                        Descripción visual
                      </Label>
                      <Textarea
                        rows={3}
                        value={s.description}
                        onChange={(e) =>
                          onUpdateScenes(
                            scenes.map((x) =>
                              x.id === s.id ? { ...x, description: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-gray-500">Narración</Label>
                      <Textarea
                        rows={3}
                        value={s.narration_text}
                        onChange={(e) =>
                          onUpdateScenes(
                            scenes.map((x) =>
                              x.id === s.id
                                ? { ...x, narration_text: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSaveScript(scriptDraft, scenes, false)}
              >
                Guardar cambios
              </Button>
              <Button
                size="sm"
                disabled={savingApprove || isGenerating}
                onClick={async () => {
                  setSavingApprove(true)
                  try {
                    await onSaveScript(scriptDraft, scenes, true)
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

        {/* Reproductor */}
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
