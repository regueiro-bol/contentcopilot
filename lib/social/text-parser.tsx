/**
 * lib/social/text-parser.tsx
 *
 * React version of the parseAndRender logic from export-word.
 * Converts AI-generated strategy text (possibly JSONB {content:"..."}) into JSX.
 * Same parsing rules as the Word exporter, but outputs React elements.
 */

import React from 'react'

/** Unwrap JSONB { content: "..." } or return raw string */
function extractText(text: unknown): string {
  if (!text) return ''
  if (typeof text === 'object' && text !== null && 'content' in text) {
    return String((text as { content: unknown }).content ?? '')
  }
  return String(text)
}

/**
 * Split raw text preserving paragraph structure.
 * Double newlines → empty string sentinel (paragraph break).
 */
function preSplit(raw: string): string[] {
  const groups = raw.split(/\n{2,}/)
  const result: string[] = []

  for (let i = 0; i < groups.length; i++) {
    const lines = groups[i].split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    if (lines.length === 0) continue
    result.push(...lines)
    if (i < groups.length - 1) result.push('')
  }

  return result
}

/** Render inline **bold** and *italic* markers as JSX spans */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|([^*]+))/g
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      parts.push(<strong key={key++} className="font-semibold text-gray-900">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={key++} className="italic text-gray-700">{match[3]}</em>)
    } else if (match[4]) {
      const clean = match[4].replace(/_/g, '')
      if (clean.trim()) parts.push(<React.Fragment key={key++}>{clean}</React.Fragment>)
    }
  }

  return parts.length > 0 ? parts : [<React.Fragment key={0}>{text.replace(/[*_]/g, '')}</React.Fragment>]
}

/**
 * parseAndRenderJSX
 *
 * Converts strategy text into an array of React elements.
 * Supports: uppercase headers, bullets, metadata labels, bold/italic inline.
 */
export function parseAndRenderJSX(
  text: unknown,
  placeholder = '(Pendiente de completar)',
): React.ReactElement[] {
  const raw = extractText(text).trim()
  if (!raw) {
    return placeholder
      ? [<p key="placeholder" className="text-sm text-gray-400 italic">{placeholder}</p>]
      : []
  }

  const lines  = preSplit(raw)
  const result : React.ReactElement[] = []
  let   keyIdx = 0

  for (const line of lines) {
    const k = keyIdx++

    // CASE 0: Paragraph break
    if (line === '') {
      result.push(<div key={k} className="h-3" />)
      continue
    }

    // CASE 1: Uppercase header — "BLOQUE 1 — X" or "INSTAGRAM — FEED:"
    if (
      /^[A-ZÁÉÍÓÚÑ\s]+\s*[—–-]\s*[A-ZÁÉÍÓÚÑ\s]+:?$/.test(line) ||
      /^(BLOQUE|PILAR|HORIZONTE|NIVEL|KPI|FASE)\s+\d/i.test(line)
    ) {
      result.push(
        <p key={k} className="text-sm font-bold text-blue-800 mt-4 mb-1.5 uppercase tracking-wide">
          {line.replace(/[*_]/g, '').replace(/:$/, '')}
        </p>,
      )
      continue
    }

    // CASE 2: Line starting with * or ** (format name / styled item)
    if (line.startsWith('**') || (line.startsWith('*') && !line.startsWith('* '))) {
      result.push(
        <p key={k} className="text-sm font-semibold text-gray-800 mt-2 mb-0.5 pl-3">
          {renderInline(line)}
        </p>,
      )
      continue
    }

    // CASE 3: Bullet "- item" or "• item"
    if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('\u2022 ')) {
      const cleanText = line.replace(/^[-•\u2022]\s+/, '').replace(/[*_]/g, '')
      result.push(
        <div key={k} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed pl-2">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
          <span>{cleanText}</span>
        </div>,
      )
      continue
    }

    // CASE 4: Metadata label "Función:", "Objetivo:", etc.
    if (/^(Función|Frecuencia|Cadencia|Objetivo|Plataforma|Formato|Target|KPI|Indicador):/i.test(line)) {
      const colon = line.indexOf(':')
      const label = line.slice(0, colon)
      const value = line.slice(colon + 1).trim().replace(/[*_]/g, '')
      result.push(
        <div key={k} className="flex gap-1.5 text-sm pl-4 py-0.5">
          <span className="font-semibold text-blue-700 shrink-0">{label}:</span>
          <span className="text-gray-700">{value}</span>
        </div>,
      )
      continue
    }

    // CASE 5: Normal paragraph
    result.push(
      <p key={k} className="text-sm text-gray-700 leading-relaxed">
        {renderInline(line)}
      </p>,
    )
  }

  return result
}
