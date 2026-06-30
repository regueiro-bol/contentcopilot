import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BriefSEO } from '@/types'

export const maxDuration = 120

interface PedidoAConfirmar {
  titulo: string
  url_destino: string | null
  tipo: 'nuevo' | 'actualizacion'
  keyword_principal: string
  volumen_estimado: number | null
  keywords_secundarias: string[]
  title_seo: string | null
  meta_description: string | null
  estructura_hs: string | null
  observaciones_seo: string | null
  enlaces_internos: Array<{ anchor: string; url: string }>
  fuentes_competencia: string[]
  fecha_entrega: string | null
  estado: string
  proyecto_id: string
}

function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
}

function buildBrief(p: PedidoAConfirmar): BriefSEO {
  return {
    texto_generado: undefined,
    keyword_principal: p.keyword_principal,
    titulo_propuesto: p.title_seo ?? p.titulo,
    url_prevista: p.url_destino ?? '',
    tipo_keyword: '',
    tipo_serp: '',
    description_propuesta: p.meta_description ?? '',
    respuesta_directa: '',
    featured_snippet: false,
    estructura_h: p.estructura_hs ?? '',
    keywords_secundarias: p.keywords_secundarias ?? [],
    fuentes: p.fuentes_competencia ?? [],
    links_obligatorios: [],
    enlaces_internos: p.enlaces_internos ?? [],
    fuentes_competencia: p.fuentes_competencia ?? [],
    formato_recomendado: '',
    enfoque: p.observaciones_seo ?? '',
    observaciones_seo: p.observaciones_seo ?? '',
    volumen_busquedas: p.volumen_estimado ?? undefined,
  }
}

const ESTADO_MAP: Record<string, string> = {
  pendiente: 'pendiente',
  revision: 'revision_seo',
  aprobado: 'aprobado',
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = (await req.json()) as {
      importacion_id: string
      cliente_id: string
      pedidos: PedidoAConfirmar[]
    }

    const { importacion_id, cliente_id, pedidos } = body
    if (!importacion_id || !cliente_id || !pedidos?.length) {
      return NextResponse.json({ error: 'Parámetros incompletos' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Agrupar por proyecto para crear un pedido por proyecto
    const porProyecto = new Map<string, PedidoAConfirmar[]>()
    for (const p of pedidos) {
      if (!porProyecto.has(p.proyecto_id)) porProyecto.set(p.proyecto_id, [])
      porProyecto.get(p.proyecto_id)!.push(p)
    }

    let creados = 0
    const errores: string[] = []

    for (const [proyectoId, grupo] of Array.from(porProyecto.entries())) {
      // Crear un pedido por proyecto
      const { data: pedidoRecord, error: pedidoErr } = await supabase
        .from('pedidos')
        .insert({
          tipo: 'excel',
          cliente_id,
          proyecto_id: proyectoId,
          nombre_archivo: null,
          estado: 'procesando',
        })
        .select('id')
        .single()

      if (pedidoErr || !pedidoRecord) {
        errores.push(`Proyecto ${proyectoId}: no se pudo crear el pedido`)
        continue
      }

      let creadosGrupo = 0

      for (const pedido of grupo) {
        try {
          const slug = slugify(pedido.titulo)
          const brief = buildBrief(pedido)
          const estado = ESTADO_MAP[pedido.estado] ?? 'pendiente'

          // Garantizar slug único dentro del proyecto
          const { data: existente } = await supabase
            .from('contenidos')
            .select('id')
            .eq('proyecto_id', proyectoId)
            .eq('slug', slug)
            .maybeSingle()
          const slugFinal = existente ? `${slug}-${Date.now().toString(36)}` : slug

          const { data: contenido, error: contErr } = await supabase
            .from('contenidos')
            .insert({
              titulo: pedido.titulo,
              slug: slugFinal,
              proyecto_id: proyectoId,
              cliente_id,
              estado,
              keyword_principal: pedido.keyword_principal || null,
              url_destino: pedido.url_destino || null,
              fecha_entrega: pedido.fecha_entrega || null,
              brief,
              enlaces_internos: pedido.enlaces_internos ?? [],
              fuentes_competencia: pedido.fuentes_competencia ?? [],
              activo: true,
            })
            .select('id')
            .single()

          if (contErr || !contenido) {
            errores.push(`"${pedido.titulo}": ${contErr?.message ?? 'error desconocido'}`)
          } else {
            creadosGrupo++
            creados++

            // Brief en background si hay Dify configurado
            const difyKey = process.env.DIFY_BRIEF_SEO_API_KEY ?? ''
            if (difyKey && pedido.titulo) {
              const difyBase = process.env.DIFY_BASE_URL ?? 'https://api.dify.ai/v1'
              const query = [
                `TÍTULO: ${pedido.titulo}`,
                pedido.estructura_hs ? `ESTRUCTURA:\n${pedido.estructura_hs}` : '',
                pedido.observaciones_seo ? `OBSERVACIONES:\n${pedido.observaciones_seo}` : '',
              ]
                .filter(Boolean)
                .join('\n')
              const contenidoId = contenido.id
              // fire and forget
              fetch(`${difyBase}/chat-messages`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${difyKey}`,
                },
                body: JSON.stringify({
                  inputs: {},
                  query,
                  response_mode: 'blocking',
                  conversation_id: '',
                  user: 'system',
                }),
              })
                .then((r) => r.json())
                .then(async (datos) => {
                  const textoGenerado: string = (datos as { answer?: string }).answer ?? ''
                  if (!textoGenerado) return
                  const { data: c } = await supabase
                    .from('contenidos')
                    .select('brief')
                    .eq('id', contenidoId)
                    .single()
                  await supabase
                    .from('contenidos')
                    .update({ brief: { ...(c?.brief ?? {}), texto_generado: textoGenerado } })
                    .eq('id', contenidoId)
                })
                .catch((e: unknown) => console.error('[brief-bg]', contenidoId, e))
            }
          }
        } catch (err) {
          errores.push(`"${pedido.titulo}": ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // Actualizar el pedido con el resultado
      await supabase
        .from('pedidos')
        .update({
          estado: creadosGrupo > 0 ? 'completado' : 'error',
          contenidos_generados: creadosGrupo,
          errores: errores as unknown[],
        })
        .eq('id', pedidoRecord.id)
    }

    // Marcar la importación como confirmada
    await supabase
      .from('importaciones_pedidos')
      .update({ estado: 'confirmado' })
      .eq('id', importacion_id)

    return NextResponse.json({ creados, errores: errores.length })
  } catch (err) {
    console.error('[Confirmar]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
