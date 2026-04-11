/**
 * GET /api/social/export-word?clientId=xxx
 *
 * Genera y descarga un archivo .docx con toda la estrategia social del cliente.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak,
  TabStopType, TabStopPosition,
} from 'docx'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Layout constants (A4) ────────────────────────────────────────────────────
// A4: 11906 wide, margins 1440 each side → content width = 9026 DXA

const CONTENT_W = 9026

const BORDER_CELL = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const BORDERS     = { top: BORDER_CELL, bottom: BORDER_CELL, left: BORDER_CELL, right: BORDER_CELL }
const NO_BORDER   = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS  = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }

const PLATFORM_COLORS: Record<string, string> = {
  linkedin : '0A66C2',
  twitter_x: '14171A',
  instagram: '833AB4',
  facebook : '1877F2',
  tiktok   : '010101',
  youtube  : 'FF0000',
}

// ─── Format catalogue (hardcoded reference data) ──────────────────────────────

const PLATFORM_FORMATS_DATA: Record<string, Array<{
  formato: string; tipo: string; funcion: string; frecuencia: string
}>> = {
  linkedin: [
    { formato: 'Artículo nativo',        tipo: 'Texto largo',    funcion: 'Liderazgo',      frecuencia: '1/sem.'    },
    { formato: 'Post de texto',           tipo: 'Texto',          funcion: 'Engagement',     frecuencia: '3-4/sem.'  },
    { formato: 'Documento PDF nativo',    tipo: 'Documento',      funcion: 'Educación',      frecuencia: 'Quincenal' },
    { formato: 'Vídeo corto',             tipo: 'Vídeo',          funcion: 'Awareness',      frecuencia: '1-2/sem.'  },
    { formato: 'Encuesta',                tipo: 'Interactivo',    funcion: 'Engagement',     frecuencia: 'Mensual'   },
    { formato: 'Celebración / Logro',     tipo: 'Texto + imagen', funcion: 'Imagen de marca',frecuencia: 'Puntual'   },
    { formato: 'Noticia del sector',      tipo: 'Curaduría',      funcion: 'Autoridad',      frecuencia: '2/sem.'    },
  ],
  twitter_x: [
    { formato: 'Tweet único',             tipo: 'Texto',          funcion: 'Engagement',     frecuencia: 'Diario'    },
    { formato: 'Hilo de tweets',          tipo: 'Texto largo',    funcion: 'Educación',      frecuencia: '1-2/sem.'  },
    { formato: 'Tweet con imagen',        tipo: 'Imagen',         funcion: 'Awareness',      frecuencia: '3-4/sem.'  },
    { formato: 'Tweet con vídeo',         tipo: 'Vídeo',          funcion: 'Engagement',     frecuencia: '1-2/sem.'  },
    { formato: 'Encuesta',                tipo: 'Interactivo',    funcion: 'Engagement',     frecuencia: 'Semanal'   },
    { formato: 'Respuesta / Conv.',       tipo: 'Conversacional', funcion: 'Comunidad',      frecuencia: 'Diario'    },
  ],
  instagram: [
    { formato: 'Post imagen',             tipo: 'Imagen',         funcion: 'Estética',       frecuencia: '3-4/sem.'  },
    { formato: 'Carrusel',                tipo: 'Carrusel',       funcion: 'Educación',      frecuencia: '2/sem.'    },
    { formato: 'Reel',                    tipo: 'Vídeo corto',    funcion: 'Alcance',        frecuencia: '2-3/sem.'  },
    { formato: 'Story',                   tipo: 'Efímero',        funcion: 'Comunidad',      frecuencia: 'Diario'    },
    { formato: 'Vídeo IGTV',             tipo: 'Vídeo largo',    funcion: 'Profundidad',    frecuencia: 'Mensual'   },
    { formato: 'Colaboración',            tipo: 'Co-creación',    funcion: 'Alcance',        frecuencia: 'Puntual'   },
    { formato: 'UGC',                     tipo: 'Cont. usuario',  funcion: 'Confianza',      frecuencia: 'Puntual'   },
  ],
  facebook: [
    { formato: 'Post texto',              tipo: 'Texto',          funcion: 'Comunidad',      frecuencia: '3-4/sem.'  },
    { formato: 'Post imagen',             tipo: 'Imagen',         funcion: 'Awareness',      frecuencia: '2-3/sem.'  },
    { formato: 'Vídeo nativo',            tipo: 'Vídeo',          funcion: 'Alcance',        frecuencia: '1-2/sem.'  },
    { formato: 'Reel',                    tipo: 'Vídeo corto',    funcion: 'Alcance',        frecuencia: '2/sem.'    },
    { formato: 'Story',                   tipo: 'Efímero',        funcion: 'Comunidad',      frecuencia: 'Diario'    },
    { formato: 'Evento',                  tipo: 'Evento',         funcion: 'Activación',     frecuencia: 'Puntual'   },
    { formato: 'Live',                    tipo: 'Directo',        funcion: 'Engagement',     frecuencia: 'Mensual'   },
  ],
  tiktok: [
    { formato: 'Vídeo corto (<60s)',       tipo: 'Vídeo corto',    funcion: 'Alcance',        frecuencia: '5-7/sem.'  },
    { formato: 'Vídeo largo (>60s)',       tipo: 'Vídeo largo',    funcion: 'Educación',      frecuencia: '1-2/sem.'  },
    { formato: 'Dueto',                   tipo: 'Co-creación',    funcion: 'Engagement',     frecuencia: 'Puntual'   },
    { formato: 'Stitch',                  tipo: 'Remix',          funcion: 'Tendencias',     frecuencia: 'Puntual'   },
    { formato: 'Live',                    tipo: 'Directo',        funcion: 'Comunidad',      frecuencia: 'Semanal'   },
    { formato: 'Serie',                   tipo: 'Colección',      funcion: 'Fidelización',   frecuencia: 'Semanal'   },
  ],
  youtube: [
    { formato: 'Vídeo largo (>10min)',     tipo: 'Vídeo largo',    funcion: 'Educación',      frecuencia: '1/sem.'    },
    { formato: 'Shorts',                  tipo: 'Vídeo corto',    funcion: 'Alcance',        frecuencia: '2-3/sem.'  },
    { formato: 'Live',                    tipo: 'Directo',        funcion: 'Comunidad',      frecuencia: 'Mensual'   },
    { formato: 'Premiere',               tipo: 'Estreno',        funcion: 'Lanzamiento',    frecuencia: 'Puntual'   },
    { formato: 'Post de comunidad',       tipo: 'Texto',          funcion: 'Engagement',     frecuencia: '2-3/sem.'  },
    { formato: 'Playlist',               tipo: 'Colección',      funcion: 'SEO / Retención',frecuencia: 'Mensual'   },
  ],
}

// ─── JSONB helper ─────────────────────────────────────────────────────────────

function jsonbToText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && 'content' in val) {
    return String((val as { content: string }).content)
  }
  return ''
}

// ─── Typography primitives ────────────────────────────────────────────────────

function emptyPara(): Paragraph {
  return new Paragraph({ children: [new TextRun('')], spacing: { before: 60, after: 60 } })
}

/** H3 — pilar / bloque / KPI heading inside body */
function h3Para(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, font: 'Arial', color: '1A2B4A' })],
    spacing : { before: 160, after: 80 },
  })
}

/** Normal body paragraph — 10pt, 1.15 leading */
function normalPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: 'Arial', color: '333333' })],
    spacing : { before: 0, after: 100, line: 276 },
  })
}

/** Bullet item — colored dot as TextRun + indent */
function bulletPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '\u2022  ', size: 20, font: 'Arial', color: '2E5F8A' }),
      new TextRun({ text, size: 20, font: 'Arial', color: '333333' }),
    ],
    indent : { left: 400 },
    spacing: { before: 0, after: 80 },
  })
}

/**
 * parseAndRender — strips markdown, detects H3 keywords and bullets,
 * returns docx Paragraph[].
 */
function parseAndRender(
  text: string | null | undefined,
  placeholder = '(Pendiente de completar)',
): Paragraph[] {
  const raw = (text ?? '').trim()
  if (!raw) return placeholder ? [normalPara(placeholder)] : []

  // Strip markdown formatting characters
  const clean = raw
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')

  const lines  = clean.split('\n')
  const result: Paragraph[] = []

  for (const line of lines) {
    const l = line.trim()
    if (!l) { result.push(emptyPara()); continue }
    if (/^(PILAR|BLOQUE|HORIZONTE|NIVEL|KPI)\b/i.test(l)) {
      result.push(h3Para(l)); continue
    }
    if (l.startsWith('- ')) {
      result.push(bulletPara(l.slice(2))); continue
    }
    result.push(normalPara(l))
  }
  return result
}

/** H2 — subsection title (e.g. "1.1 Síntesis…") */
function subTitle(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, font: 'Arial', color: '2E5F8A' })],
    spacing : { before: 240, after: 120 },
  })
}

/**
 * H1 — section title with left accent bar.
 * Returns [PageBreak paragraph, accent Table, spacing paragraph].
 */
function sectionTitle(text: string): (Paragraph | Table)[] {
  const ACCENT_W = 180
  const TEXT_W   = CONTENT_W - ACCENT_W

  return [
    new Paragraph({ children: [new PageBreak()] }),
    new Table({
      width       : { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [ACCENT_W, TEXT_W],
      rows: [new TableRow({
        children: [
          // Accent bar
          new TableCell({
            width  : { size: ACCENT_W, type: WidthType.DXA },
            shading: { fill: '2E5F8A', type: ShadingType.CLEAR },
            borders: NO_BORDERS,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ children: [new TextRun('')] })],
          }),
          // Title text
          new TableCell({
            width  : { size: TEXT_W, type: WidthType.DXA },
            shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
            borders: NO_BORDERS,
            margins: { top: 140, bottom: 140, left: 240, right: 0 },
            children: [new Paragraph({
              children: [new TextRun({ text, bold: true, size: 44, font: 'Arial', color: '1A2B4A' })],
            })],
          }),
        ],
      })],
    }),
    new Paragraph({ children: [new TextRun('')], spacing: { before: 0, after: 200 } }),
  ]
}

/** Horizontal rule between major subsections */
function sectionSeparator(): Paragraph {
  return new Paragraph({
    children: [new TextRun('')],
    border  : { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E0E8F0', space: 1 } },
    spacing : { before: 200, after: 200 },
  })
}

// ─── Section 3.5 builders ─────────────────────────────────────────────────────

/** Platform header row (colored banner with name + priority) */
function makePlatformHeader(label: string, color: string, priority: string | null): Table {
  return new Table({
    width       : { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({
      children: [new TableCell({
        width  : { size: CONTENT_W, type: WidthType.DXA },
        shading: { fill: color, type: ShadingType.CLEAR },
        borders: NO_BORDERS,
        margins: { top: 100, bottom: 100, left: 220, right: 220 },
        children: [new Paragraph({
          children: [
            new TextRun({ text: label, bold: true, size: 22, font: 'Arial', color: 'FFFFFF' }),
            ...(priority
              ? [new TextRun({ text: '\t' + priority, size: 18, font: 'Arial', color: 'FFFFFF' })]
              : []),
          ],
          tabStops: priority
            ? [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }]
            : [],
        })],
      })],
    })],
  })
}

/** 4-column formats table for one platform */
function makePlatformFormatsTable(platformKey: string): Table {
  const COL_W = [3200, 1606, 2520, 1700] as const // sum = 9026
  const formats = PLATFORM_FORMATS_DATA[platformKey] ?? []

  const headerRow = new TableRow({
    tableHeader: true,
    children: (['Formato', 'Tipo', 'Función', 'Frecuencia'] as const).map((h, i) =>
      new TableCell({
        borders : BORDERS,
        width   : { size: COL_W[i], type: WidthType.DXA },
        shading : { fill: 'E8F0F8', type: ShadingType.CLEAR },
        margins : { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, size: 18, font: 'Arial', color: '1A2B4A' })],
        })],
      }),
    ),
  })

  const dataRows = formats.map(({ formato, tipo, funcion, frecuencia }, rowIdx) =>
    new TableRow({
      children: ([formato, tipo, funcion, frecuencia] as const).map((v, i) =>
        new TableCell({
          borders : BORDERS,
          width   : { size: COL_W[i], type: WidthType.DXA },
          shading : { fill: rowIdx % 2 === 0 ? 'FFFFFF' : 'F5F8FC', type: ShadingType.CLEAR },
          margins : { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({
            children: [new TextRun({ text: v, size: 18, font: 'Arial', color: '333333' })],
          })],
        }),
      ),
    }),
  )

  return new Table({
    width       : { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [...COL_W],
    rows        : [headerRow, ...dataRows],
  })
}

/** Full platform block: header + formats table */
function makePlatformBlock(
  platformKey: string,
  label      : string,
  priority   : string | null,
): (Paragraph | Table)[] {
  const color = PLATFORM_COLORS[platformKey] ?? '444444'
  return [
    makePlatformHeader(label, color, priority),
    makePlatformFormatsTable(platformKey),
    new Paragraph({ children: [new TextRun('')], spacing: { before: 200, after: 0 } }),
  ]
}

/** Legend row at the bottom of section 3.5 */
function makeLegend(): Table {
  const HALF = Math.floor(CONTENT_W / 2)
  const REST = CONTENT_W - HALF // 4513

  const makeCol = (items: Array<{ dot: string; label: string }>) =>
    new TableCell({
      borders : NO_BORDERS,
      width   : { size: HALF, type: WidthType.DXA },
      shading : { fill: 'F0F4F8', type: ShadingType.CLEAR },
      margins : { top: 80, bottom: 80, left: 160, right: 80 },
      children: [new Paragraph({
        children: items.flatMap(({ dot, label }, i) => [
          ...(i > 0 ? [new TextRun({ text: '    ', size: 16, font: 'Arial', color: '333333' })] : []),
          new TextRun({ text: '\u25CF ', size: 16, font: 'Arial', color: dot }),
          new TextRun({ text: label, size: 16, font: 'Arial', color: '333333' }),
        ]),
      })],
    })

  return new Table({
    width       : { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [HALF, REST],
    rows: [new TableRow({
      children: [
        makeCol([
          { dot: '2E5F8A', label: 'Diseño estático' },
          { dot: '2D9E6B', label: 'Motion / animación' },
        ]),
        makeCol([
          { dot: 'E53935', label: 'Vídeo editado' },
          { dot: '7B3FA0', label: 'Formato editorial nativo' },
        ]),
      ],
    })],
  })
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()

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

  const PLATFORM_LABELS: Record<string, string> = {
    linkedin : 'LinkedIn', twitter_x: 'Twitter/X', instagram: 'Instagram',
    facebook : 'Facebook', tiktok   : 'TikTok',    youtube  : 'YouTube',
  }

  // ─── Active platforms ──────────────────────────────────────────────────────

  const activePlatforms = (platforms ?? []).filter(
    (p) => p.strategic_priority != null || (p.followers && p.followers > 0),
  )

  // ─── Platform metrics table (section 1.2) ─────────────────────────────────

  const platformTableRows = [
    new TableRow({
      tableHeader: true,
      children: ['Plataforma', 'Seguidores', 'Engagement', 'Posts/sem.', 'Prioridad'].map(
        (h) => new TableCell({
          borders      : BORDERS,
          width        : { size: 1872, type: WidthType.DXA },
          shading      : { fill: 'E8EEF4', type: ShadingType.CLEAR },
          margins      : { top: 80, bottom: 80, left: 120, right: 120 },
          verticalAlign: VerticalAlign.CENTER,
          children     : [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: 'Arial', color: '1A2B4A' })] })],
        }),
      ),
    }),
    ...activePlatforms.map((p) => new TableRow({
      children: [
        PLATFORM_LABELS[p.platform] ?? p.platform,
        p.followers       ? p.followers.toLocaleString('es-ES') : '—',
        p.avg_engagement  ? `${p.avg_engagement}%`              : '—',
        p.posts_per_week  ? String(p.posts_per_week)            : '—',
        p.strategic_priority ?? '—',
      ].map((cell) => new TableCell({
        borders : BORDERS,
        width   : { size: 1872, type: WidthType.DXA },
        margins : { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: cell, size: 18, font: 'Arial', color: '333333' })] })],
      })),
    })),
  ]

  // ─── Benchmark table (section 1.3) ────────────────────────────────────────

  const includedBenchmark = (benchmark ?? []).filter((b) => b.included !== false)

  const benchmarkTableRows = [
    new TableRow({
      tableHeader: true,
      children: ['Referente', 'Plataforma', 'Qué hace bien'].map((h, i) => new TableCell({
        borders : BORDERS,
        width   : { size: [2000, 2000, 5026][i], type: WidthType.DXA },
        shading : { fill: 'E8EEF4', type: ShadingType.CLEAR },
        margins : { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: 'Arial', color: '1A2B4A' })] })],
      })),
    }),
    ...includedBenchmark.map((b) => new TableRow({
      children: [
        { v: b.name             ?? '',  w: 2000 },
        { v: b.platform         ?? '',  w: 2000 },
        { v: b.what_they_do_well ?? '—', w: 5026 },
      ].map(({ v, w }) => new TableCell({
        borders : BORDERS,
        width   : { size: w, type: WidthType.DXA },
        margins : { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: v, size: 18, font: 'Arial', color: '333333' })] })],
      })),
    })),
  ]

  // ─── Build document ────────────────────────────────────────────────────────

  const doc = new Document({

    styles: {
      default: { document: { run: { font: 'Arial', size: 20, color: '333333' } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run      : { size: 44, bold: true, font: 'Arial', color: '1A2B4A' },
          paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run      : { size: 28, bold: true, font: 'Arial', color: '2E5F8A' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
        },
      ],
    },

    sections: [{
      properties: {
        page: {
          size  : { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },

      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            border   : { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
            children : [new TextRun({
              text : `Estrategia Social Media — ${clientName}`,
              size : 16, font: 'Arial', color: '999999',
            })],
          })],
        }),
      },

      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            border   : { top: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
            children : [
              new TextRun({ text: `Raíz — Estrategia Social Media  |  ${clientName}  |  ${dateStr}  |  Pág. `, size: 16, font: 'Arial', color: '999999' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: '999999' }),
            ],
          })],
        }),
      },

      children: [

        // ── PORTADA ───────────────────────────────────────────────────────────
        new Table({
          width       : { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [CONTENT_W],
          rows: [new TableRow({
            children: [new TableCell({
              width        : { size: CONTENT_W, type: WidthType.DXA },
              shading      : { fill: '1A2B4A', type: ShadingType.CLEAR },
              borders      : NO_BORDERS,
              verticalAlign: VerticalAlign.CENTER,
              margins      : { top: 2000, bottom: 2000, left: 560, right: 560 },
              children     : [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing  : { before: 0, after: 400 },
                  children : [new TextRun({ text: 'ESTRATEGIA SOCIAL MEDIA', bold: true, size: 56, font: 'Arial', color: 'FFFFFF' })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing  : { before: 0, after: 280 },
                  children : [new TextRun({ text: clientName, bold: true, size: 40, font: 'Arial', color: 'A8C8E8' })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing  : { before: 0, after: 0 },
                  children : [new TextRun({ text: `${dateStr}  ·  Raíz — Agencia de Marketing Digital y Contenidos`, size: 20, font: 'Arial', color: '7BA5C8' })],
                }),
              ],
            })],
          })],
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // ── SECCIÓN 1: AUDITORÍA Y BENCHMARK ─────────────────────────────────
        ...sectionTitle('1. Auditoría y Benchmark'),

        ...(auditSynth?.main_strengths ? [
          subTitle('1.1 Fortalezas principales'),
          ...parseAndRender(auditSynth.main_strengths),
          sectionSeparator(),
        ] : []),

        ...(auditSynth?.main_weaknesses ? [
          subTitle('1.2 Debilidades y gaps'),
          ...parseAndRender(auditSynth.main_weaknesses),
          sectionSeparator(),
        ] : []),

        ...(activePlatforms.length > 0 ? [
          subTitle('1.3 Plataformas analizadas'),
          new Table({
            width       : { size: CONTENT_W, type: WidthType.DXA },
            columnWidths: [1872, 1872, 1872, 1872, 1538],
            rows        : platformTableRows,
          }),
          emptyPara(),
          sectionSeparator(),
        ] : []),

        ...(includedBenchmark.length > 0 ? [
          subTitle('1.4 Benchmark de referentes'),
          new Table({
            width       : { size: CONTENT_W, type: WidthType.DXA },
            columnWidths: [2000, 2000, 5026],
            rows        : benchmarkTableRows,
          }),
          emptyPara(),
        ] : []),

        // ── SECCIÓN 2: ESTRATEGIA DE PLATAFORMAS ─────────────────────────────
        ...sectionTitle('2. Estrategia de Plataformas'),

        subTitle('2.1 Decisiones por plataforma'),
        ...parseAndRender(strategy?.platform_decisions),
        sectionSeparator(),

        subTitle('2.2 Arquitectura del ecosistema de canales'),
        ...parseAndRender(strategy?.channel_architecture),
        sectionSeparator(),

        subTitle('2.3 Diferenciación editorial por plataforma'),
        ...parseAndRender(strategy?.editorial_differentiation),

        // ── SECCIÓN 3: ARQUITECTURA DE CONTENIDOS ────────────────────────────
        ...sectionTitle('3. Arquitectura de Contenidos'),

        subTitle('3.1 Pilares editoriales'),
        ...parseAndRender(jsonbToText(architecture?.editorial_pillars)),
        sectionSeparator(),

        subTitle('3.2 Formatos por plataforma'),
        ...parseAndRender(jsonbToText(architecture?.formats_by_platform)),
        sectionSeparator(),

        subTitle('3.3 Cadencia de publicación'),
        ...parseAndRender(jsonbToText(architecture?.publishing_cadence)),
        sectionSeparator(),

        subTitle('3.4 Calendario tipo semanal'),
        ...parseAndRender(architecture?.calendar_template),
        sectionSeparator(),

        // ── SECCIÓN 3.5: ECOSISTEMA VISUAL ───────────────────────────────────
        subTitle('3.5 Ecosistema de formatos y producción visual'),
        new Paragraph({
          children: [new TextRun({
            text   : 'Arquitectura de piezas por plataforma activa. De la pieza recurrente al formato de campaña.',
            italics: true, size: 20, font: 'Arial', color: '666666',
          })],
          spacing: { before: 0, after: 200 },
        }),

        ...activePlatforms.flatMap((p) =>
          makePlatformBlock(
            p.platform,
            PLATFORM_LABELS[p.platform] ?? p.platform,
            p.strategic_priority ?? null,
          ),
        ),

        ...(activePlatforms.length > 0 ? [
          makeLegend(),
          emptyPara(),
          new Paragraph({
            children: [new TextRun({
              text   : 'El sistema visual definitivo se desarrollará con acceso a los brand assets oficiales del cliente.',
              italics: true, size: 16, font: 'Arial', color: '888888',
            })],
            spacing: { before: 80, after: 80 },
          }),
        ] : []),

        // ── SECCIÓN 4: TONO Y GUIDELINES ─────────────────────────────────────
        ...sectionTitle('4. Tono y Guidelines de Marca'),

        subTitle('4.1 Manual de voz para redes'),
        ...parseAndRender(brandVoice?.voice_manual),
        sectionSeparator(),

        subTitle('4.2 Registro por plataforma'),
        ...parseAndRender(jsonbToText(brandVoice?.register_by_platform)),
        sectionSeparator(),

        subTitle('4.3 Lo que la marca nunca dice'),
        ...parseAndRender(brandVoice?.editorial_red_lines),
        sectionSeparator(),

        subTitle('4.4 Guía de consistencia para equipo distribuido'),
        ...parseAndRender(brandVoice?.consistency_guidelines),

        // ── SECCIÓN 5: KPIs Y MÉTRICAS ────────────────────────────────────────
        ...sectionTitle('5. KPIs y Métricas'),

        subTitle('5.1 Indicadores de éxito por objetivo'),
        ...parseAndRender(jsonbToText(kpis?.kpis_by_objective)),
        sectionSeparator(),

        subTitle('5.2 Metodología de medición'),
        ...parseAndRender(kpis?.measurement_methodology),
        sectionSeparator(),

        subTitle('5.3 Sistema de reporting para el cliente'),
        ...parseAndRender(kpis?.reporting_system),

        // ── SECCIÓN 6: PLAN DE ACCIÓN ─────────────────────────────────────────
        ...sectionTitle('6. Plan de Acción'),

        subTitle('6.1 Roadmap de implementación'),
        ...parseAndRender(jsonbToText(actionPlan?.roadmap)),
        sectionSeparator(),

        subTitle('6.2 Primeros 90 días — acciones concretas'),
        ...parseAndRender(actionPlan?.first_90_days),
        sectionSeparator(),

        subTitle('6.3 Equipo y recursos necesarios'),
        ...parseAndRender(actionPlan?.team_resources),

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
