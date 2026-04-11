/**
 * lib/visual/generators/satori-renderer.ts
 *
 * Renders branded data cards and quote cards as PNG buffers
 * using Satori (JSX → SVG) + sharp (SVG → PNG).
 *
 * Templates:
 *   data_highlight  – large number + label + subtext
 *   quote_card      – pull-quote with attribution
 *   bar_chart       – simple horizontal bar chart (up to 5 bars)
 *   infographic_3   – three-item icon + text columns
 *   editorial_post  – headline + body copy, no image
 *   checklist       – numbered / checked item list
 */

import satori                      from 'satori'
import sharp                       from 'sharp'
import { createElement as h }      from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SatoriTemplate =
  | 'data_highlight'
  | 'quote_card'
  | 'bar_chart'
  | 'infographic_3'
  | 'editorial_post'
  | 'checklist'

export interface SatoriInput {
  template    : SatoriTemplate
  width       : number
  height      : number
  primaryColor: string   // hex e.g. '#1A56FF'
  bgColor     : string   // hex e.g. '#FFFFFF'
  textColor   : string   // hex e.g. '#111827'
  // Template-specific fields
  headline?   : string
  subtext?    : string
  dataPoint?  : string   // e.g. '87%'
  dataLabel?  : string   // e.g. 'de satisfacción'
  quote?      : string
  attribution?: string
  items?      : Array<{ label: string; value?: number; text?: string }>
  ctaText?    : string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hex2rgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

function lighten(hex: string, amount = 0.92): string {
  const { r, g, b } = hex2rgb(hex)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

// ─── Inline font (system fallback) ───────────────────────────────────────────
// Satori requires at least one font. We bundle a minimal subset via fetch
// from Google Fonts (Noto Sans). This runs server-side so fetch is fine.

let cachedFont: ArrayBuffer | null = null

async function getFont(): Promise<ArrayBuffer> {
  if (cachedFont) return cachedFont
  try {
    const url = 'https://fonts.gstatic.com/s/notosans/v36/o-0bIpQlx3QUlC5A4PNjhiZSKg.woff'
    const res = await fetch(url)
    if (!res.ok) throw new Error('font fetch failed')
    cachedFont = await res.arrayBuffer()
  } catch {
    // Fallback: create a 1-byte placeholder that satori accepts as "loaded"
    // (satori will then use the system fallback)
    cachedFont = new ArrayBuffer(0)
  }
  return cachedFont!
}

// ─── Template builders (return React element trees) ──────────────────────────

function DataHighlight(inp: SatoriInput) {
  const accent = lighten(inp.primaryColor)
  return h('div', {
    style: {
      width: inp.width, height: inp.height,
      background: inp.bgColor,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px',
    },
  },
    h('div', {
      style: {
        background: accent,
        borderRadius: '24px',
        padding: '48px 64px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
        width: '100%',
      },
    },
      h('div', {
        style: {
          fontSize: Math.round(inp.width * 0.18),
          fontWeight: 800, color: inp.primaryColor, lineHeight: 1,
        },
      }, inp.dataPoint ?? '—'),
      h('div', {
        style: { fontSize: Math.round(inp.width * 0.042), color: inp.textColor, fontWeight: 600, textAlign: 'center' },
      }, inp.dataLabel ?? ''),
      inp.subtext ? h('div', {
        style: { fontSize: Math.round(inp.width * 0.030), color: '#6B7280', textAlign: 'center', marginTop: '8px' },
      }, inp.subtext) : null,
    ),
    inp.headline ? h('div', {
      style: {
        fontSize: Math.round(inp.width * 0.038), fontWeight: 700,
        color: inp.textColor, textAlign: 'center', marginTop: '32px',
      },
    }, inp.headline) : null,
  )
}

function QuoteCard(inp: SatoriInput) {
  return h('div', {
    style: {
      width: inp.width, height: inp.height,
      background: inp.primaryColor,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', padding: '80px',
    },
  },
    h('div', {
      style: {
        fontSize: Math.round(inp.width * 0.12), color: 'rgba(255,255,255,0.4)',
        lineHeight: 0.8, marginBottom: '24px',
      },
    }, '"'),
    h('div', {
      style: {
        fontSize: Math.round(inp.width * 0.055), color: '#FFFFFF', fontWeight: 600,
        lineHeight: 1.4,
      },
    }, inp.quote ?? ''),
    inp.attribution ? h('div', {
      style: {
        fontSize: Math.round(inp.width * 0.032), color: 'rgba(255,255,255,0.7)',
        marginTop: '40px', fontWeight: 500,
      },
    }, `— ${inp.attribution}`) : null,
  )
}

function BarChart(inp: SatoriInput) {
  const bars = (inp.items ?? []).slice(0, 5)
  const maxVal = Math.max(...bars.map(b => b.value ?? 0), 1)
  const accent = lighten(inp.primaryColor)
  return h('div', {
    style: {
      width: inp.width, height: inp.height, background: inp.bgColor,
      display: 'flex', flexDirection: 'column', padding: '60px',
    },
  },
    inp.headline ? h('div', {
      style: { fontSize: Math.round(inp.width * 0.05), fontWeight: 700, color: inp.textColor, marginBottom: '40px' },
    }, inp.headline) : null,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, justifyContent: 'center' } },
      ...bars.map(bar =>
        h('div', { key: bar.label, style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: Math.round(inp.width * 0.028), color: inp.textColor } },
            h('span', {}, bar.label),
            h('span', { style: { fontWeight: 700, color: inp.primaryColor } }, `${bar.value ?? 0}%`),
          ),
          h('div', { style: { height: '12px', background: accent, borderRadius: '6px', overflow: 'hidden' } },
            h('div', {
              style: {
                height: '12px', borderRadius: '6px', background: inp.primaryColor,
                width: `${Math.round(((bar.value ?? 0) / maxVal) * 100)}%`,
              },
            }),
          ),
        )
      ),
    ),
    inp.subtext ? h('div', {
      style: { fontSize: Math.round(inp.width * 0.024), color: '#9CA3AF', marginTop: '24px' },
    }, inp.subtext) : null,
  )
}

function Infographic3(inp: SatoriInput) {
  const cols = (inp.items ?? []).slice(0, 3)
  const accent = lighten(inp.primaryColor)
  return h('div', {
    style: {
      width: inp.width, height: inp.height, background: inp.bgColor,
      display: 'flex', flexDirection: 'column', padding: '60px',
      alignItems: 'center',
    },
  },
    inp.headline ? h('div', {
      style: { fontSize: Math.round(inp.width * 0.048), fontWeight: 700, color: inp.textColor, marginBottom: '48px', textAlign: 'center' },
    }, inp.headline) : null,
    h('div', { style: { display: 'flex', gap: '32px', flex: 1, alignItems: 'center', width: '100%' } },
      ...cols.map((col, i) =>
        h('div', {
          key: i, style: {
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: accent, borderRadius: '16px', padding: '32px 20px', gap: '16px',
          },
        },
          h('div', {
            style: {
              width: '56px', height: '56px', borderRadius: '50%', background: inp.primaryColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: '22px',
            },
          }, `${i + 1}`),
          h('div', {
            style: { fontSize: Math.round(inp.width * 0.030), fontWeight: 700, color: inp.textColor, textAlign: 'center' },
          }, col.label),
          col.text ? h('div', {
            style: { fontSize: Math.round(inp.width * 0.024), color: '#6B7280', textAlign: 'center', lineHeight: 1.4 },
          }, col.text) : null,
        )
      ),
    ),
  )
}

function EditorialPost(inp: SatoriInput) {
  return h('div', {
    style: {
      width: inp.width, height: inp.height, background: inp.bgColor,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px',
    },
  },
    h('div', {
      style: {
        width: '64px', height: '6px', background: inp.primaryColor,
        borderRadius: '3px', marginBottom: '40px',
      },
    }),
    inp.headline ? h('div', {
      style: {
        fontSize: Math.round(inp.width * 0.065), fontWeight: 800, color: inp.textColor,
        lineHeight: 1.15, marginBottom: '32px',
      },
    }, inp.headline) : null,
    inp.subtext ? h('div', {
      style: { fontSize: Math.round(inp.width * 0.036), color: '#6B7280', lineHeight: 1.6 },
    }, inp.subtext) : null,
    inp.ctaText ? h('div', {
      style: {
        marginTop: '48px', background: inp.primaryColor, color: '#fff',
        paddingTop: '16px', paddingBottom: '16px', paddingLeft: '32px', paddingRight: '32px',
        borderRadius: '999px', fontSize: Math.round(inp.width * 0.030), fontWeight: 700,
        display: 'inline-block', alignSelf: 'flex-start',
      },
    }, inp.ctaText) : null,
  )
}

function Checklist(inp: SatoriInput) {
  const checks = (inp.items ?? []).slice(0, 6)
  return h('div', {
    style: {
      width: inp.width, height: inp.height, background: inp.bgColor,
      display: 'flex', flexDirection: 'column', padding: '60px',
    },
  },
    inp.headline ? h('div', {
      style: { fontSize: Math.round(inp.width * 0.048), fontWeight: 800, color: inp.textColor, marginBottom: '40px' },
    }, inp.headline) : null,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, justifyContent: 'center' } },
      ...checks.map((item, i) =>
        h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: '20px' } },
          h('div', {
            style: {
              width: '32px', height: '32px', borderRadius: '50%', background: inp.primaryColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: '15px', flexShrink: 0,
            },
          }, '✓'),
          h('div', {
            style: { fontSize: Math.round(inp.width * 0.032), color: inp.textColor, fontWeight: 500, lineHeight: 1.3 },
          }, item.label),
        )
      ),
    ),
  )
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export async function renderSatoriTemplate(inp: SatoriInput): Promise<Buffer> {
  const fontData = await getFont()

  const fonts = fontData.byteLength > 0
    ? [{ name: 'Noto Sans', data: fontData, weight: 400 as const, style: 'normal' as const }]
    : []

  let element: ReturnType<typeof h>
  switch (inp.template) {
    case 'data_highlight' : element = DataHighlight(inp); break
    case 'quote_card'     : element = QuoteCard(inp);     break
    case 'bar_chart'      : element = BarChart(inp);      break
    case 'infographic_3'  : element = Infographic3(inp);  break
    case 'editorial_post' : element = EditorialPost(inp); break
    case 'checklist'      : element = Checklist(inp);     break
    default               : element = EditorialPost(inp)
  }

  const svg = await satori(element, {
    width : inp.width,
    height: inp.height,
    fonts,
  })

  // Convert SVG → PNG using sharp (librsvg-backed, no native .node binaries needed)
  return Buffer.from(
    await sharp(Buffer.from(svg))
      .resize(inp.width, inp.height)
      .png()
      .toBuffer()
  )
}
