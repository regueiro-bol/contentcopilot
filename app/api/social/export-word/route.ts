/**
 * GET /api/social/export-word?clientId=xxx
 *
 * Genera y descarga un archivo .docx con toda la estrategia social del cliente.
 * Usa la librería 'docx' (npm package).
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
} from 'docx'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonbToText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && 'content' in val) {
    return String((val as { content: string }).content)
  }
  return ''
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    heading  : HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    children : [new TextRun({ text, bold: true, size: 32, font: 'Arial' })],
    spacing  : { before: 240, after: 180 },
  })
}

function subTitle(text: string): Paragraph {
  return new Paragraph({
    heading : HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, size: 26, font: 'Arial' })],
    spacing : { before: 200, after: 120 },
  })
}

function bodyText(text: string | null | undefined, placeholder = '(Pendiente de completar)'): Paragraph[] {
  const content = (text ?? '').trim() || placeholder
  const lines   = content.split('\n')
  return lines.map(
    (line) => new Paragraph({
      children: [new TextRun({ text: line, size: 22, font: 'Arial' })],
      spacing : { before: 60, after: 60 },
    }),
  )
}

function emptyPara(): Paragraph {
  return new Paragraph({ children: [new TextRun('')], spacing: { before: 60, after: 60 } })
}

const BORDER_CELL = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const BORDERS     = { top: BORDER_CELL, bottom: BORDER_CELL, left: BORDER_CELL, right: BORDER_CELL }

// ─── Datos de formatos por plataforma ─────────────────────────────────────────

const PLATFORM_FORMATS_DATA: Record<string, Array<{ formato: string; tipo: string }>> = {
  linkedin : [
    { formato: 'Artículo nativo',          tipo: 'Texto largo'        },
    { formato: 'Post de texto',             tipo: 'Texto'              },
    { formato: 'Documento PDF nativo',      tipo: 'Documento'          },
    { formato: 'Vídeo corto',               tipo: 'Vídeo'              },
    { formato: 'Encuesta',                  tipo: 'Interactivo'        },
    { formato: 'Celebración / Logro',       tipo: 'Texto + imagen'     },
    { formato: 'Noticia del sector',        tipo: 'Curaduría'          },
  ],
  twitter_x: [
    { formato: 'Tweet único',               tipo: 'Texto'              },
    { formato: 'Hilo de tweets',            tipo: 'Texto largo'        },
    { formato: 'Tweet con imagen',          tipo: 'Imagen'             },
    { formato: 'Tweet con vídeo',           tipo: 'Vídeo'              },
    { formato: 'Encuesta',                  tipo: 'Interactivo'        },
    { formato: 'Respuesta / Conversación',  tipo: 'Conversacional'     },
  ],
  instagram: [
    { formato: 'Post imagen',               tipo: 'Imagen'             },
    { formato: 'Carrusel',                  tipo: 'Carrusel'           },
    { formato: 'Reel',                      tipo: 'Vídeo corto'        },
    { formato: 'Story',                     tipo: 'Efímero'            },
    { formato: 'Vídeo IGTV',               tipo: 'Vídeo largo'        },
    { formato: 'Colaboración',              tipo: 'Co-creación'        },
    { formato: 'UGC',                       tipo: 'Contenido usuario'  },
  ],
  facebook : [
    { formato: 'Post texto',                tipo: 'Texto'              },
    { formato: 'Post imagen',               tipo: 'Imagen'             },
    { formato: 'Vídeo nativo',              tipo: 'Vídeo'              },
    { formato: 'Reel',                      tipo: 'Vídeo corto'        },
    { formato: 'Story',                     tipo: 'Efímero'            },
    { formato: 'Evento',                    tipo: 'Evento'             },
    { formato: 'Live',                      tipo: 'Directo'            },
  ],
  tiktok   : [
    { formato: 'Vídeo corto (<60s)',         tipo: 'Vídeo corto'       },
    { formato: 'Vídeo largo (>60s)',         tipo: 'Vídeo largo'       },
    { formato: 'Dueto',                     tipo: 'Co-creación'        },
    { formato: 'Stitch',                    tipo: 'Remix'              },
    { formato: 'Live',                      tipo: 'Directo'            },
    { formato: 'Serie',                     tipo: 'Colección'          },
  ],
  youtube  : [
    { formato: 'Vídeo largo (>10min)',       tipo: 'Vídeo largo'       },
    { formato: 'Shorts',                    tipo: 'Vídeo corto'        },
    { formato: 'Live',                      tipo: 'Directo'            },
    { formato: 'Premiere',                  tipo: 'Estreno'            },
    { formato: 'Post de comunidad',         tipo: 'Texto'              },
    { formato: 'Playlist',                  tipo: 'Colección'          },
  ],
}

function makePlatformFormatTable(
  platformKey : string,
  label       : string,
): (Paragraph | Table)[] {
  const formats = PLATFORM_FORMATS_DATA[platformKey] ?? []
  if (!formats.length) return []

  const headerRow = new TableRow({
    tableHeader: true,
    children   : ['Formato', 'Tipo de pieza'].map((h, i) => new TableCell({
      borders  : BORDERS,
      width    : { size: [5000, 4360][i], type: WidthType.DXA },
      shading  : { fill: 'EEF2F7', type: ShadingType.CLEAR },
      margins  : { top: 80, bottom: 80, left: 120, right: 120 },
      children : [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: 'Arial' })] })],
    })),
  })

  const dataRows = formats.map(({ formato, tipo }) => new TableRow({
    children: [
      { v: formato, w: 5000 },
      { v: tipo,    w: 4360 },
    ].map(({ v, w }) => new TableCell({
      borders : BORDERS,
      width   : { size: w, type: WidthType.DXA },
      margins : { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: v, size: 18, font: 'Arial' })] })],
    })),
  }))

  return [
    new Paragraph({
      children: [new TextRun({ text: label, bold: true, size: 22, font: 'Arial', color: '1A2B4A' })],
      spacing : { before: 160, after: 80 },
    }),
    new Table({
      width        : { size: 9360, type: WidthType.DXA },
      columnWidths : [5000, 4360],
      rows         : [headerRow, ...dataRows],
    }),
    emptyPara(),
  ]
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()

  // Leer todos los datos en paralelo
  const [
    { data: cliente },
    { data: platforms },
    { data: benchmark },
    { data: auditSynth },
    { data: strategy },
    { data: architecture },
    { data: brandVoice },
    { data: kpis },
    { data: actionPlan },
  ] = await Promise.all([
    supabase.from('clientes').select('nombre').eq('id', clientId).single(),
    supabase.from('social_platforms').select('*').eq('client_id', clientId).order('platform'),
    supabase.from('social_benchmark').select('*').eq('client_id', clientId).order('sort_order'),
    supabase.from('social_audit_synthesis').select('*').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_strategy').select('*').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_content_architecture').select('*').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_brand_voice').select('*').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_kpis').select('*').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_action_plan').select('*').eq('client_id', clientId).maybeSingle(),
  ])

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const clientName = cliente.nombre
  const dateStr    = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const footerText = `Raíz — Agencia de Marketing Digital y Contenidos  |  Documento confidencial  |  ${clientName}  |  ${dateStr}`

  const PLATFORM_LABELS: Record<string, string> = {
    linkedin : 'LinkedIn', twitter_x: 'Twitter/X', instagram: 'Instagram',
    facebook : 'Facebook', tiktok   : 'TikTok',   youtube  : 'YouTube',
  }

  // ─── Tabla de plataformas ────────────────────────────────────────────────────

  const activePlatforms = (platforms ?? []).filter(
    (p) => p.strategic_priority != null || (p.followers && p.followers > 0),
  )

  const platformTableRows = [
    // Header row
    new TableRow({
      tableHeader: true,
      children: ['Plataforma', 'Seguidores', 'Engagement', 'Posts/sem.', 'Prioridad'].map(
        (h) => new TableCell({
          borders,
          width   : { size: 1872, type: WidthType.DXA },
          shading : { fill: 'E8EEF4', type: ShadingType.CLEAR },
          margins : { top: 80, bottom: 80, left: 120, right: 120 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: 'Arial' })] })],
        }),
      ),
    }),
    ...activePlatforms.map(
      (p) => new TableRow({
        children: [
          PLATFORM_LABELS[p.platform] ?? p.platform,
          p.followers ? p.followers.toLocaleString('es-ES') : '—',
          p.avg_engagement ? `${p.avg_engagement}%` : '—',
          p.posts_per_week ? String(p.posts_per_week) : '—',
          p.strategic_priority ?? '—',
        ].map(
          (cell) => new TableCell({
            borders,
            width  : { size: 1872, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: cell, size: 18, font: 'Arial' })] })],
          }),
        ),
      }),
    ),
  ]

  // ─── Tabla benchmark ──────────────────────────────────────────────────────────

  const includedBenchmark = (benchmark ?? []).filter((b) => b.included !== false)

  const benchmarkTableRows = [
    new TableRow({
      tableHeader: true,
      children: ['Referente', 'Plataforma', 'Qué hace bien'].map((h, i) => new TableCell({
        borders,
        width  : { size: [2000, 2000, 5360][i], type: WidthType.DXA },
        shading: { fill: 'E8EEF4', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: 'Arial' })] })],
      })),
    }),
    ...includedBenchmark.map((b) => new TableRow({
      children: [
        { v: b.name ?? '', w: 2000 },
        { v: b.platform ?? '', w: 2000 },
        { v: b.what_they_do_well ?? '—', w: 5360 },
      ].map(({ v, w }) => new TableCell({
        borders,
        width  : { size: w, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: v, size: 18, font: 'Arial' })] })],
      })),
    })),
  ]

  // ─── Construir documento ─────────────────────────────────────────────────────

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run      : { size: 32, bold: true, font: 'Arial', color: '1A2B4A' },
          paragraph: { spacing: { before: 300, after: 200 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run      : { size: 26, bold: true, font: 'Arial', color: '2E5BA8' },
          paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 },
        },
      ],
    },

    numbering: {
      config: [
        {
          reference: 'bullets',
          levels   : [{
            level    : 0,
            format   : LevelFormat.BULLET,
            text     : '\u2022',
            alignment: AlignmentType.LEFT,
            style    : { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },

    sections: [{
      properties: {
        page: {
          size  : { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },

      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children : [new TextRun({ text: `Estrategia Social Media — ${clientName}`, size: 16, font: 'Arial', color: '888888' })],
              border   : { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
            }),
          ],
        }),
      },

      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children : [
                new TextRun({ text: footerText, size: 16, font: 'Arial', color: '888888' }),
                new TextRun({ text: '  |  Pág. ', size: 16, font: 'Arial', color: '888888' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: '888888' }),
              ],
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
            }),
          ],
        }),
      },

      children: [
        // ── PORTADA ──────────────────────────────────────────────────────────────
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing  : { before: 2000, after: 400 },
          children : [new TextRun({ text: 'ESTRATEGIA SOCIAL MEDIA', bold: true, size: 52, font: 'Arial', color: '1A2B4A' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing  : { before: 0, after: 200 },
          children : [new TextRun({ text: clientName, bold: true, size: 40, font: 'Arial', color: '2E5BA8' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing  : { before: 0, after: 600 },
          children : [new TextRun({ text: 'Documento de trabajo interno', size: 24, font: 'Arial', color: '666666', italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing  : { before: 0, after: 200 },
          children : [new TextRun({ text: dateStr, size: 22, font: 'Arial', color: '444444' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing  : { before: 0, after: 1200 },
          children : [new TextRun({ text: 'Elaborado por Raíz — Agencia de Marketing Digital y Contenidos', size: 20, font: 'Arial', color: '888888' })],
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // ── SECCIÓN 1: AUDITORÍA Y BENCHMARK ─────────────────────────────────────
        sectionTitle('1. Auditoría y Benchmark'),

        subTitle('1.1 Síntesis de auditoría'),
        ...bodyText(null, ''),

        new Paragraph({
          children: [new TextRun({ text: 'Fortalezas principales', bold: true, size: 22, font: 'Arial', color: '2E7D32' })],
          spacing : { before: 160, after: 80 },
        }),
        ...bodyText(auditSynth?.main_strengths),
        emptyPara(),

        new Paragraph({
          children: [new TextRun({ text: 'Debilidades y gaps principales', bold: true, size: 22, font: 'Arial', color: 'C62828' })],
          spacing : { before: 160, after: 80 },
        }),
        ...bodyText(auditSynth?.main_weaknesses),
        emptyPara(),

        ...(activePlatforms.length > 0 ? [
          subTitle('1.2 Plataformas analizadas'),
          new Table({
            width      : { size: 9360, type: WidthType.DXA },
            columnWidths: [1872, 1872, 1872, 1872, 1872],
            rows       : platformTableRows,
          }),
          emptyPara(),
        ] : []),

        ...(includedBenchmark.length > 0 ? [
          subTitle('1.3 Benchmark'),
          new Table({
            width       : { size: 9360, type: WidthType.DXA },
            columnWidths: [2000, 2000, 5360],
            rows        : benchmarkTableRows,
          }),
          emptyPara(),
        ] : []),

        // ── SECCIÓN 2: ESTRATEGIA DE PLATAFORMAS ─────────────────────────────────
        sectionTitle('2. Estrategia de Plataformas'),

        subTitle('2.1 Decisiones por plataforma'),
        ...bodyText(strategy?.platform_decisions),
        emptyPara(),

        subTitle('2.2 Arquitectura del ecosistema de canales'),
        ...bodyText(strategy?.channel_architecture),
        emptyPara(),

        subTitle('2.3 Diferenciación editorial por plataforma'),
        ...bodyText(strategy?.editorial_differentiation),

        // ── SECCIÓN 3: ARQUITECTURA DE CONTENIDOS ────────────────────────────────
        sectionTitle('3. Arquitectura de Contenidos'),

        subTitle('3.1 Pilares editoriales'),
        ...bodyText(jsonbToText(architecture?.editorial_pillars)),
        emptyPara(),

        subTitle('3.2 Formatos por plataforma'),
        ...bodyText(jsonbToText(architecture?.formats_by_platform)),
        emptyPara(),

        subTitle('3.3 Cadencia de publicación'),
        ...bodyText(jsonbToText(architecture?.publishing_cadence)),
        emptyPara(),

        subTitle('3.4 Calendario tipo semanal'),
        ...bodyText(architecture?.calendar_template),
        emptyPara(),

        subTitle('3.5 Ecosistema de formatos y producción visual'),
        ...activePlatforms.flatMap(
          (p) => makePlatformFormatTable(p.platform, PLATFORM_LABELS[p.platform] ?? p.platform),
        ),
        new Paragraph({
          children: [new TextRun({ text: 'Nota: Los formatos disponibles dependen de la prioridad estratégica asignada a cada plataforma y de los recursos de producción del cliente.', italics: true, size: 18, font: 'Arial', color: '888888' })],
          spacing : { before: 80, after: 80 },
        }),

        // ── SECCIÓN 4: TONO Y GUIDELINES ─────────────────────────────────────────
        sectionTitle('4. Tono y Guidelines de Marca'),

        subTitle('4.1 Manual de voz para redes'),
        ...bodyText(brandVoice?.voice_manual),
        emptyPara(),

        subTitle('4.2 Registro por plataforma'),
        ...bodyText(jsonbToText(brandVoice?.register_by_platform)),
        emptyPara(),

        subTitle('4.3 Lo que la marca nunca dice'),
        ...bodyText(brandVoice?.editorial_red_lines),
        emptyPara(),

        subTitle('4.4 Guía de consistencia para equipo distribuido'),
        ...bodyText(brandVoice?.consistency_guidelines),

        // ── SECCIÓN 5: KPIs Y MÉTRICAS ────────────────────────────────────────────
        sectionTitle('5. KPIs y Métricas'),

        subTitle('5.1 Indicadores de éxito por objetivo'),
        ...bodyText(jsonbToText(kpis?.kpis_by_objective)),
        emptyPara(),

        subTitle('5.2 Metodología de medición'),
        ...bodyText(kpis?.measurement_methodology),
        emptyPara(),

        subTitle('5.3 Sistema de reporting'),
        ...bodyText(kpis?.reporting_system),

        // ── SECCIÓN 6: PLAN DE ACCIÓN ─────────────────────────────────────────────
        sectionTitle('6. Plan de Acción'),

        subTitle('6.1 Roadmap de implementación'),
        ...bodyText(jsonbToText(actionPlan?.roadmap)),
        emptyPara(),

        subTitle('6.2 Primeros 90 días'),
        ...bodyText(actionPlan?.first_90_days),
        emptyPara(),

        subTitle('6.3 Equipo y recursos necesarios'),
        ...bodyText(actionPlan?.team_resources),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)

  const safeFileName = clientName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const fileName     = `Estrategia_Social_${safeFileName}_${new Date().toISOString().slice(0, 10)}.docx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type'       : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length'     : String(buffer.length),
    },
  })
}

// Alias para evitar ambigüedad de variable no usada
const borders = BORDERS
