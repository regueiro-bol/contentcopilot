import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import VideosClient from './videos-client'

export const dynamic = 'force-dynamic'

export default async function VideosPage({ params }: { params: { id: string } }) {
  const supabase = createAdminClient()

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('id', params.id)
    .single()
  if (error || !cliente) notFound()

  const { data: projects } = await supabase
    .from('video_projects')
    .select('*')
    .eq('client_id', params.id)
    .order('created_at', { ascending: false })

  const projectIds = (projects ?? []).map((p) => p.id)
  let scenesByProject: Record<string, unknown[]> = {}
  if (projectIds.length > 0) {
    const { data: scenes } = await supabase
      .from('video_scenes')
      .select('*')
      .in('video_project_id', projectIds)
      .order('scene_index', { ascending: true })
    scenesByProject = (scenes ?? []).reduce<Record<string, unknown[]>>((acc, s) => {
      const key = (s as { video_project_id: string }).video_project_id
      if (!acc[key]) acc[key] = []
      acc[key].push(s)
      return acc
    }, {})
  }

  return (
    <VideosClient
      clientId={params.id}
      clientNombre={cliente.nombre}
      initialProjects={projects ?? []}
      initialScenesByProject={scenesByProject}
    />
  )
}
