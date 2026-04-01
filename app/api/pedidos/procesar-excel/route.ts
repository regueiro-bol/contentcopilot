import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import JSZip from 'jszip'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FilaExcelSeo } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Parsers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsea un CSV (texto) y devuelve filas como array de objetos.
 */
function parsearCsv(texto: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  return result.data
}

/**
 * Parsea un archivo XLSX usando JSZip + análisis del XML interno.
 * Soporta el formato xlsx estándar (Office Open XML).
 */
async function parsearXlsx(buffer: ArrayBuffer): Promise<Record<string, string>[]> {
  const zip = await JSZip.loadAsync(buffer)

  // Leer cadenas compartidas (sharedStrings.xml)
  const sharedStringsFile = zip.file('xl/sharedStrings.xml')
  const sharedStrings: string[] = []
  if (sharedStringsFile) {
    const xml = await sharedStringsFile.async('text')
    const siBlocks = xml.match(/<si>([\s\S]*?)<\/si>/g) ?? []
    for (const si of siBlocks) {
      const textos = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []
      sharedStrings.push(
        textos.map((t) => t.replace(/<[^>]+>/g, '')).join('')
      )
    }
  }

  // Leer la primera hoja (sheet1.xml)
  const sheetFile = zip.file('xl/worksheets/sheet1.xml')
  if (!sheetFile) return []

  const sheetXml = await sheetFile.async('text')

  // Extraer filas
  const rows: string[][] = []
  const rowBlocks = sheetXml.match(/<row\b[^>]*>([\s\S]*?)<\/row>/g) ?? []
  for (const row of rowBlocks) {
    const cells: string[] = []
    const cellBlocks = row.match(/<c\b[^>]*>([\s\S]*?)<\/c>/g) ?? []
    for (const cell of cellBlocks) {
      const typeMatch = cell.match(/t="([^"]*)"/)
      const valueMatch = cell.match(/<v>([\s\S]*?)<\/v>/)
      const value = valueMatch ? valueMatch[1] : ''
      if (typeMatch && typeMatch[1] === 's') {
        // Shared string
        cells.push(sharedStrings[parseInt(value)] ?? '')
      } else {
        cells.push(value)
      }
    }
    rows.push(cells)
  }

  if (rows.length < 2) return []

  // Primera fila = cabeceras
  const headers = rows[0].map((h) => h.trim().toLowerCase())
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? ''
    })
    return obj
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalización de cabeceras SEO
// ─────────────────────────────────────────────────────────────────────────────

const ALIAS_TITULO = ['titulo', 'title', 'título', 'nombre', 'name', 'articulo', 'artículo']
const ALIAS_KEYWORD = ['keyword', 'kw', 'palabra clave', 'palabra_clave', 'keywords', 'main keyword']
const ALIAS_URL = ['url', 'url destino', 'url_destino', 'slug', 'permalink', 'link']
const ALIAS_ESTRUCTURA = ['estructura', 'estructura h', 'estructura_h', 'headings', 'h1', 'h structure']

function encontrarColumna(headers: string[], aliases: string[]): string | undefined {
  return headers.find((h) => aliases.some((a) => h.includes(a)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/pedidos/procesar-excel
 * Recibe un CSV o XLSX y devuelve las filas detectadas con
 * indicador de si el contenido ya existe en la BD.
 *
 * Body (FormData):
 *   file        — archivo .csv o .xlsx
 *   cliente_id  — UUID del cliente (para comprobar duplicados)
 *   proyecto_id — UUID del proyecto
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const proyectoId = formData.get('proyecto_id') as string | null

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(extension ?? '')) {
      return NextResponse.json(
        { error: 'Formato no soportado. Usa CSV o Excel (.xlsx)' },
        { status: 400 }
      )
    }

    // ── Parsear el archivo ─────────────────────────────────────────────────
    let filas: Record<string, string>[] = []

    if (extension === 'csv') {
      const texto = await file.text()
      filas = parsearCsv(texto)
    } else {
      const buffer = await file.arrayBuffer()
      filas = await parsearXlsx(buffer)
    }

    if (filas.length === 0) {
      return NextResponse.json({ error: 'El archivo está vacío o no tiene datos' }, { status: 400 })
    }

    // ── Detectar columnas ──────────────────────────────────────────────────
    const headers = Object.keys(filas[0])
    const colTitulo = encontrarColumna(headers, ALIAS_TITULO)
    const colKeyword = encontrarColumna(headers, ALIAS_KEYWORD)
    const colUrl = encontrarColumna(headers, ALIAS_URL)
    const colEstructura = encontrarColumna(headers, ALIAS_ESTRUCTURA)

    // ── Cargar contenidos existentes del proyecto ──────────────────────────
    const urlsExistentes = new Set<string>()
    const titulosExistentes = new Set<string>()

    if (proyectoId) {
      const supabase = createAdminClient()
      const { data: contenidosExistentes } = await supabase
        .from('contenidos')
        .select('titulo, url_destino')
        .eq('proyecto_id', proyectoId)

      for (const c of contenidosExistentes ?? []) {
        if (c.url_destino) urlsExistentes.add(c.url_destino.toLowerCase().trim())
        if (c.titulo) titulosExistentes.add(c.titulo.toLowerCase().trim())
      }
    }

    // ── Mapear filas a FilaExcelSeo ────────────────────────────────────────
    const resultado: FilaExcelSeo[] = filas
      .filter((fila) => {
        const titulo = colTitulo ? fila[colTitulo]?.trim() : ''
        return titulo && titulo.length > 0
      })
      .map((fila) => {
        const titulo = colTitulo ? (fila[colTitulo] ?? '').trim() : ''
        const keyword = colKeyword ? (fila[colKeyword] ?? '').trim() : ''
        const url = colUrl ? (fila[colUrl] ?? '').trim() : ''
        const estructuraH = colEstructura ? (fila[colEstructura] ?? '').trim() : ''

        const yaExiste =
          (url && urlsExistentes.has(url.toLowerCase())) ||
          titulosExistentes.has(titulo.toLowerCase())

        return { titulo, keyword, url, estructuraH, yaExiste }
      })

    return NextResponse.json({
      filas: resultado,
      columnas_detectadas: { colTitulo, colKeyword, colUrl, colEstructura },
    })
  } catch (error) {
    console.error('[procesar-excel] Error:', error)
    return NextResponse.json({ error: 'Error al procesar el archivo' }, { status: 500 })
  }
}
