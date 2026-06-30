import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import ExcelJS from 'exceljs'
import mammoth from 'mammoth'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

const BATCH_SIZE = 10   // filas por llamada — limita el output a ~4-5k tokens por batch

// ─── ExcelJS cell → string ─────────────────────────────────────────────────────
// ExcelJS returns rich objects for hyperlink/richText/date cells;
// cell.text does NOT reliably flatten these — we must handle each type.
type RichTextItem = { text: string }
type RichTextValue = { richText: RichTextItem[] }
type HyperlinkValue = { text: string | RichTextValue; hyperlink: string }
type FormulaValue = { formula: string; result: unknown }

function extractCellText(cell: ExcelJS.Cell): string {
  const val = cell.value
  if (val === null || val === undefined) return ''

  if (val instanceof Date) {
    // Return YYYY-MM-DD so Claude can parse dates consistently
    return val.toISOString().split('T')[0]
  }

  if (typeof val === 'object') {
    // Hyperlink cell: { text: string | RichTextValue, hyperlink: string }
    if ('hyperlink' in val) {
      const hv = val as HyperlinkValue
      if (typeof hv.text === 'string') return hv.text
      if (hv.text && typeof hv.text === 'object' && 'richText' in hv.text) {
        return (hv.text as RichTextValue).richText.map((r) => r.text).join('')
      }
      return hv.hyperlink
    }
    // Pure rich text cell: { richText: [...] }
    if ('richText' in val) {
      return (val as RichTextValue).richText.map((r) => r.text).join('')
    }
    // Formula: { formula: '...', result: value }
    if ('result' in val) {
      const r = (val as FormulaValue).result
      return r instanceof Date ? r.toISOString().split('T')[0] : String(r ?? '')
    }
  }

  return String(val)
}
const MAX_TOKENS = 16000 // Claude Sonnet 4.6 soporta hasta 64k; 16k cubre batches de 10 filas densas

interface PedidoDetectado {
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
  proyecto_nombre: string | null
}

const SYSTEM_PROMPT = `Eres un asistente que analiza archivos de planificación editorial y extrae pedidos de contenido.
Devuelve SOLO JSON válido, sin explicaciones ni bloques de markdown.`

const SCHEMA_FIELDS = `{
  "titulo": string,
  "url_destino": string|null,
  "tipo": "nuevo"|"actualizacion",
  "keyword_principal": string,
  "volumen_estimado": number|null,
  "keywords_secundarias": string[],
  "title_seo": string|null,
  "meta_description": string|null,
  "estructura_hs": string|null,
  "observaciones_seo": string|null,
  "enlaces_internos": [{"anchor": string, "url": string}],
  "fuentes_competencia": string[],
  "fecha_entrega": string|null,
  "estado": string,
  "proyecto_nombre": string|null
}`

function buildPromptExcel(
  headers: string[],
  rows: Record<string, string>[],
  proyectoForzado: boolean,
): string {
  const proyectoRegla = proyectoForzado
    ? '- proyecto_nombre: devuelve siempre null (el proyecto ya está asignado externamente)'
    : '- proyecto_nombre: extrae el nombre del proyecto/vertical si aparece en la fila, o null'

  return `Analiza estas columnas y filas de un Excel editorial. Mapea cada fila válida a un pedido con este formato JSON:
${SCHEMA_FIELDS}

REGLAS:
- La columna Tema puede contener "Título\\n\\nURL" — extrae ambos como titulo y url_destino
- Keywords secundarias separadas por saltos de línea → array
- Estructura Hs: conserva jerarquía H1/H2/H3 completa
- "Curación" o "Actualización" = tipo:"actualizacion" (url_destino obligatoria)
- "Nuevo" = tipo:"nuevo"
- Estados: Backlog/Pendiente → "pendiente", Revisión → "revision", Aprobación → "aprobado"
- Si no hay fecha, devuelve null; si no hay volumen, devuelve null
- Ignora filas completamente vacías
- La columna "Anchor" contiene los textos ancla de enlaces internos. La columna "Enlaces" contiene las URLs internas correspondientes en el MISMO ORDEN. Combínalos en pares {anchor, url} en el campo "enlaces_internos". Si los valores son listas separadas por saltos de línea, emparéjalos posicionalmente (anchor[0] con url[0], etc.).
- La columna "Contenido ideal" son URLs EXTERNAS de referencia/competencia que el redactor debe leer como contexto, pero NUNCA deben enlazarse ni citarse en el texto final. Guárdalas en "fuentes_competencia".
${proyectoRegla}
- Si no hay anchors ni enlaces, devuelve "enlaces_internos": []
- Si no hay contenido ideal, devuelve "fuentes_competencia": []

Headers: ${JSON.stringify(headers)}
Filas: ${JSON.stringify(rows)}

Devuelve SOLO un array JSON. Sin texto adicional.`
}

function buildPromptDocx(texto: string, proyectoForzado: boolean): string {
  const proyectoRegla = proyectoForzado
    ? '- proyecto_nombre: devuelve siempre null (el proyecto ya está asignado externamente)'
    : '- proyecto_nombre: extrae el nombre del proyecto/vertical si aparece, o null'

  return `Analiza este texto de un documento Word de planificación editorial. Identifica cada artículo individual.

Para cada artículo, devuelve:
${SCHEMA_FIELDS}

"Curación" o "Actualización" = tipo:"actualizacion". "Nuevo" = tipo:"nuevo".
${proyectoRegla}
Si hay textos ancla y URLs de enlaces internos, combínalos en pares en "enlaces_internos". Contenido externo de referencia va en "fuentes_competencia".
Devuelve SOLO un array JSON.

Texto:
${texto.slice(0, 15000)}`
}

async function callClaude(anthropic: Anthropic, prompt: string): Promise<PedidoDetectado[]> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const respuestaTexto = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
  console.log('[IMPORTAR] Respuesta Claude (primeros 500 chars):', respuestaTexto.substring(0, 500))
  console.log('[IMPORTAR] stop_reason:', response.stop_reason, '| output tokens:', response.usage.output_tokens)

  const match = respuestaTexto.match(/\[[\s\S]*\]/)
  if (!match) {
    console.warn('[IMPORTAR] No se encontró JSON array en la respuesta')
    console.log('[IMPORTAR] Texto completo recibido:', respuestaTexto)
    return []
  }

  try {
    const parsed = JSON.parse(match[0]) as PedidoDetectado[]
    const validos = parsed.filter((p) => p?.titulo?.trim())
    console.log('[IMPORTAR] Pedidos parseados:', parsed.length, '| con título válido:', validos.length)
    return validos
  } catch (err) {
    console.log('[IMPORTAR] Error parseando JSON:', err)
    console.log('[IMPORTAR] Texto completo recibido:', respuestaTexto)
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const formData = await req.formData()
    const archivo = formData.get('archivo') as File | null
    const clienteId = formData.get('cliente_id') as string | null
    const proyectoId = (formData.get('proyecto_id') as string | null) || null

    if (!archivo) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
    if (!clienteId) return NextResponse.json({ error: 'cliente_id requerido' }, { status: 400 })

    const nombre = archivo.name.toLowerCase()
    const arrayBuffer = await archivo.arrayBuffer()
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    let pedidosDetectados: PedidoDetectado[] = []

    // ── Excel ─────────────────────────────────────────────────────────────────
    if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls')) {
      const workbook = new ExcelJS.Workbook()
      // ExcelJS declares its own Buffer as `interface Buffer extends ArrayBuffer {}`
      // so ArrayBuffer is structurally compatible
      await workbook.xlsx.load(arrayBuffer)
      const sheet = workbook.worksheets[0]
      if (!sheet) {
        return NextResponse.json({ error: 'El Excel está vacío o no tiene hojas' }, { status: 400 })
      }

      // Extract headers; deduplicate repeated names (e.g. "Volume search" x2)
      const headers: string[] = []
      const headerCount: Record<string, number> = {}
      sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
        const raw = extractCellText(cell).trim()
        if (!raw) { headers[col - 1] = ''; return }
        if (!headerCount[raw]) {
          headerCount[raw] = 1
          headers[col - 1] = raw
        } else {
          headerCount[raw]++
          headers[col - 1] = `${raw}_${headerCount[raw]}`
        }
      })

      const rows: Record<string, string>[] = []
      sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum === 1) return
        const data: Record<string, string> = {}
        headers.forEach((header, idx) => {
          if (!header) return
          data[header] = extractCellText(row.getCell(idx + 1)).trim()
        })
        if (Object.values(data).some((v) => v)) rows.push(data)
      })

      console.log('[IMPORTAR] Hoja leída, filas:', rows.length)
      console.log('[IMPORTAR] Headers detectados:', JSON.stringify(headers))
      if (rows.length > 0) console.log('[IMPORTAR] Primera fila ejemplo:', JSON.stringify(rows[0]))
      console.log('[IMPORTAR] Filas completas extraídas:', JSON.stringify(rows, null, 2).substring(0, 2000))

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        console.log('[IMPORTAR] Enviando batch a Claude, filas:', batch.length)
        const userPrompt = buildPromptExcel(headers, batch, !!proyectoId)
        console.log('[IMPORTAR] Prompt enviado a Claude (primeros 1000 chars):', userPrompt.substring(0, 1000))
        const result = await callClaude(anthropic, userPrompt)
        pedidosDetectados.push(...result)
      }

    // ── Word ──────────────────────────────────────────────────────────────────
    } else if (nombre.endsWith('.docx') || nombre.endsWith('.doc')) {
      const buffer = Buffer.from(arrayBuffer)
      const { value: texto } = await mammoth.extractRawText({ buffer })
      if (!texto.trim()) {
        return NextResponse.json({ error: 'El documento está vacío' }, { status: 400 })
      }
      console.log(`[Analizar] DOCX: ${texto.length} chars`)
      pedidosDetectados = await callClaude(anthropic, buildPromptDocx(texto, !!proyectoId))

    } else {
      return NextResponse.json(
        { error: 'Formato no soportado. Usa .xlsx o .docx' },
        { status: 400 },
      )
    }

    console.log('[IMPORTAR] Total pedidos detectados:', pedidosDetectados.length)

    if (pedidosDetectados.length === 0) {
      return NextResponse.json(
        { error: 'No se detectaron pedidos válidos. Verifica el formato del archivo.' },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('importaciones_pedidos')
      .insert({
        cliente_id: clienteId,
        usuario_id: userId,
        pedidos_detectados: pedidosDetectados,
        archivo_nombre: archivo.name,
        estado: 'pendiente_revision',
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[Analizar] Error guardando:', error?.message)
      return NextResponse.json({ error: 'Error guardando los datos' }, { status: 500 })
    }

    return NextResponse.json({
      importacion_id: data.id,
      total_pedidos: pedidosDetectados.length,
      ...(proyectoId ? { proyecto_id: proyectoId } : {}),
    })
  } catch (err) {
    console.error('[Analizar]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
