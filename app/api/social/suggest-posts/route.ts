import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    clientId       : string
    articleId      : string
    articleTitle   : string
    articleKeyword?: string
  }

  const { clientId, articleId, articleTitle, articleKeyword } = body
  if (!clientId || !articleId || !articleTitle) {
    return NextResponse.json({ error: 'clientId, articleId, articleTitle required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Fetch context in parallel
  const [platformsRes, archRes, voiceRes] = await Promise.all([
    supabase.from('social_platforms').select('platform, posts_per_week, strategic_priority').eq('client_id', clientId),
    supabase.from('social_content_architecture').select('editorial_pillars, formats_by_platform').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_brand_voice').select('voice_manual').eq('client_id', clientId).maybeSingle(),
  ])

  const platforms   = platformsRes.data ?? []
  const archData    = archRes.data
  const voiceData   = voiceRes.data

  // Filter active/relevant platforms
  const activePlatforms = platforms.filter(
    (p) => p.strategic_priority && p.strategic_priority !== 'descartar'
  )

  function jsonbToText(val: any): string {
    if (!val) return ''
    if (typeof val === 'string') return val
    if (typeof val === 'object' && 'content' in val) return val.content ?? ''
    return JSON.stringify(val)
  }

  const pilarsText   = jsonbToText(archData?.editorial_pillars).slice(0, 400)
  const formatsText  = jsonbToText(archData?.formats_by_platform).slice(0, 300)
  const voiceText    = jsonbToText(voiceData?.voice_manual).slice(0, 200)

  const platformList = activePlatforms.length > 0
    ? activePlatforms.map((p) => `- ${p.platform}`).join('\n')
    : platforms.map((p) => `- ${p.platform}`).join('\n')

  const systemPrompt = `Eres un consultor de social media especializado en adaptar contenido editorial de blog a redes sociales. Dado un artículo de blog, generas sugerencias concretas de piezas sociales derivadas: qué publicar, en qué red, en qué formato y con qué ángulo editorial distinto al del artículo original.

Cada pieza debe tener valor propio, no ser un resumen del artículo.`

  const userPrompt = `ARTÍCULO DEL BLOG:
Título: ${articleTitle}
Keyword principal: ${articleKeyword ?? '(no especificada)'}

PLATAFORMAS ACTIVAS DEL CLIENTE:
${platformList || '- linkedin\n- twitter_x\n- instagram'}

FORMATOS DISPONIBLES:
${formatsText || '(estándar por plataforma)'}

PILARES EDITORIALES:
${pilarsText || '(no configurados)'}

VOZ DE MARCA:
${voiceText || '(no configurada)'}

Genera 4-5 sugerencias de piezas sociales derivadas de este artículo.
Para cada sugerencia:
- platform: (linkedin/twitter_x/instagram/facebook/tiktok/youtube)
- format: (formato específico de esa plataforma)
- title: título sugerido para la pieza (máx 80 chars)
- angle: ángulo editorial (qué hace diferente esta pieza respecto al artículo, máx 120 chars)

Responde SOLO con un array JSON válido, sin texto adicional:
[
  {
    "platform": "linkedin",
    "format": "Documento PDF nativo",
    "title": "...",
    "angle": "..."
  }
]`

  try {
    const response = await anthropic.messages.create({
      model    : 'claude-sonnet-4-5',
      max_tokens: 1024,
      system   : systemPrompt,
      messages : [{ role: 'user', content: userPrompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''

    // Extract JSON array from response
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in response')

    const suggestions = JSON.parse(match[0]) as Array<{
      platform: string
      format  : string
      title   : string
      angle   : string
    }>

    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('[suggest-posts] Error:', err)
    return NextResponse.json({ error: 'Error generating suggestions' }, { status: 500 })
  }
}
