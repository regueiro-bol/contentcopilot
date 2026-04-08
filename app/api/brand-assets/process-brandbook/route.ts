/**
 * POST /api/brand-assets/process-brandbook
 *
 * Descarga el brand book aprobado del cliente desde Drive,
 * lo procesa con Claude (visión de documento PDF) para extraer
 * colores, tipografías, tono de voz y restricciones,
 * y guarda/actualiza el resultado en brand_context.
 *
 * Body: { client_id: string }
 *
 * Respuesta exitosa:
 *   { success: true, context: BrandContextRow }
 *
 * Variables de entorno requeridas:
 *   GOOGLE_SERVICE_ACCOUNT_JSON   — JSON de cuenta de servicio
 *   ANTHROPIC_API_KEY             — Clave de API de Anthropic
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { google, drive_v3 } from 'googleapis'
import Anthropic from '@anthropic-ai/sdk'
import type { DocumentBlockParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────────────────────

interface ColorEntry {
  name: string
  hex: string
  role?: string  // e.g. "primary", "secondary", "accent", "neutral"
}

interface FontEntry {
  name: string
  role?: string  // e.g. "headings", "body", "accent"
  weights?: string[]
}

interface ExtractedBrandContext {
  colors: ColorEntry[]
  typography: FontEntry[]
  tone_of_voice: string
  style_keywords: string[]
  restrictions: string
  raw_summary: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildDriveClient(): drive_v3.Drive {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error('Variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON no configurada')
  }
  let credentials: object
  try {
    credentials = JSON.parse(raw)
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido')
  }
  const authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  return google.drive({ version: 'v3', auth: authClient })
}

/**
 * Descarga un fichero de Drive y devuelve su contenido como Buffer.
 * Para Google Docs/Slides/Sheets usa la exportación; para el resto, alt=media.
 */
async function downloadDriveFileAsBuffer(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string | null,
): Promise<Buffer> {
  // Si es un documento de Google (Docs, Slides…) exportamos como PDF
  if (mimeType === 'application/vnd.google-apps.document') {
    const res = await drive.files.export(
      { fileId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' },
    )
    return Buffer.from(res.data as ArrayBuffer)
  }
  if (mimeType === 'application/vnd.google-apps.presentation') {
    const res = await drive.files.export(
      { fileId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' },
    )
    return Buffer.from(res.data as ArrayBuffer)
  }

  // Para PDFs u otros ficheros binarios usamos alt=media
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude — extracción de contexto de marca
// ─────────────────────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `Eres un experto en identidad de marca y branding.
Tu tarea es analizar el brand book que se te proporciona y extraer la información de marca de forma estructurada.
Responde EXCLUSIVAMENTE con un objeto JSON válido (sin comentarios, sin markdown, sin texto adicional).`

const EXTRACTION_USER_PROMPT = `Analiza este brand book y extrae la información de marca en el siguiente formato JSON exacto:

{
  "colors": [
    { "name": "nombre del color", "hex": "#RRGGBB", "role": "primary|secondary|accent|neutral|background|text" }
  ],
  "typography": [
    { "name": "nombre de la fuente", "role": "headings|body|accent|display", "weights": ["Regular", "Bold"] }
  ],
  "tone_of_voice": "Descripción del tono de voz de la marca en 2-4 oraciones. Incluye adjetivos clave, estilo de comunicación y cómo debe sonar la marca.",
  "style_keywords": ["palabra1", "palabra2", "palabra3"],
  "restrictions": "Lista de cosas que NO se deben hacer: colores prohibidos, estilos a evitar, mensajes inadecuados, etc.",
  "raw_summary": "Resumen general de la marca en 3-5 oraciones: quiénes son, qué ofrecen, cuál es su propuesta de valor y qué los diferencia."
}

Reglas:
- Extrae TODOS los colores que aparezcan en el brand book con su código hexadecimal exacto. Si solo hay nombre (ej. Pantone), conviértelo al HEX más cercano.
- Para tipografías, incluye solo las fuentes explícitamente definidas en el brand book.
- El tone_of_voice debe ser descriptivo y accionable para un copywriter.
- style_keywords: entre 5 y 12 palabras clave que capturen la esencia visual y verbal de la marca.
- restrictions: sé específico con las prohibiciones reales del brand book. Si no hay restricciones explícitas, indica "No se especifican restricciones explícitas".
- Si un campo no tiene información clara en el documento, usa un valor vacío ("" para strings, [] para arrays).
- Responde SOLO con el JSON, sin texto antes ni después.`

async function extractBrandContextWithClaude(
  pdfBuffer: Buffer,
): Promise<ExtractedBrandContext> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  const base64Pdf = pdfBuffer.toString('base64')

  const docBlock: DocumentBlockParam = {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: base64Pdf,
    },
  }

  const promptBlock: TextBlockParam = {
    type: 'text',
    text: EXTRACTION_USER_PROMPT,
  }

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [docBlock, promptBlock],
      },
    ],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude no devolvió ningún bloque de texto')
  }

  // Limpiar la respuesta: a veces Claude añade ```json … ``` aunque se le pide que no
  const raw = textBlock.text.trim()
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? null
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw

  let parsed: ExtractedBrandContext
  try {
    parsed = JSON.parse(jsonStr) as ExtractedBrandContext
  } catch {
    throw new Error(`JSON inválido de Claude: ${jsonStr.slice(0, 200)}`)
  }

  // Normalizar campos ausentes para no guardar undefined
  parsed.colors         = Array.isArray(parsed.colors)         ? parsed.colors         : []
  parsed.typography     = Array.isArray(parsed.typography)     ? parsed.typography     : []
  parsed.tone_of_voice  = parsed.tone_of_voice  ?? ''
  parsed.style_keywords = Array.isArray(parsed.style_keywords) ? parsed.style_keywords : []
  parsed.restrictions   = parsed.restrictions   ?? ''
  parsed.raw_summary    = parsed.raw_summary    ?? ''

  return parsed
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracción con Gemini 2.5 Flash (soporta PDFs hasta 2 GB vía inlineData)
// ─────────────────────────────────────────────────────────────────────────────

async function extractBrandContextWithGemini(
  pdfBuffer: Buffer,
): Promise<ExtractedBrandContext> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY no configurada')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: EXTRACTION_SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
      temperature: 0.2,
    },
  })

  const base64Pdf = pdfBuffer.toString('base64')

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: base64Pdf,
      },
    },
    { text: EXTRACTION_USER_PROMPT },
  ])

  const raw = result.response.text().trim()
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? null
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw

  let parsed: ExtractedBrandContext
  try {
    parsed = JSON.parse(jsonStr) as ExtractedBrandContext
  } catch {
    throw new Error(`JSON inválido de Gemini: ${jsonStr.slice(0, 200)}`)
  }

  parsed.colors         = Array.isArray(parsed.colors)         ? parsed.colors         : []
  parsed.typography     = Array.isArray(parsed.typography)     ? parsed.typography     : []
  parsed.tone_of_voice  = parsed.tone_of_voice  ?? ''
  parsed.style_keywords = Array.isArray(parsed.style_keywords) ? parsed.style_keywords : []
  parsed.restrictions   = parsed.restrictions   ?? ''
  parsed.raw_summary    = parsed.raw_summary    ?? ''

  return parsed
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Autenticación ───────────────────────────────────────────────────────
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // ── 2. Validar body ────────────────────────────────────────────────────────
  let body: { client_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.client_id || typeof body.client_id !== 'string') {
    return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 })
  }

  const clientId = body.client_id
  const supabase = createAdminClient()

  // ── 3. Obtener el brand book aprobado del cliente ──────────────────────────
  const { data: brandBookAssets, error: assetsError } = await supabase
    .from('brand_assets')
    .select('id, drive_file_id, file_name, mime_type, approved')
    .eq('client_id', clientId)
    .eq('asset_type', 'brand_book')
    .eq('active', true)
    .order('approved', { ascending: false }) // aprobados primero

  if (assetsError) {
    return NextResponse.json(
      { error: `Error consultando brand assets: ${assetsError.message}` },
      { status: 500 },
    )
  }

  if (!brandBookAssets || brandBookAssets.length === 0) {
    return NextResponse.json(
      { error: 'No hay ningún brand book sincronizado para este cliente. Sincroniza primero desde Drive.' },
      { status: 404 },
    )
  }

  // Preferir el aprobado; si no hay ninguno, usar el primero disponible
  const brandBook = brandBookAssets.find((a) => a.approved) ?? brandBookAssets[0]

  if (!brandBook.drive_file_id) {
    return NextResponse.json(
      { error: 'El brand book no tiene un ID de fichero en Drive' },
      { status: 422 },
    )
  }

  // ── 4. Descargar el PDF desde Drive ────────────────────────────────────────
  let drive: drive_v3.Drive
  try {
    drive = buildDriveClient()
  } catch (err) {
    return NextResponse.json(
      { error: `Error configurando Google Drive: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    )
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await downloadDriveFileAsBuffer(drive, brandBook.drive_file_id, brandBook.mime_type)
  } catch (err) {
    return NextResponse.json(
      { error: `Error descargando el brand book desde Drive: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  if (pdfBuffer.length === 0) {
    return NextResponse.json(
      { error: 'El fichero descargado de Drive está vacío' },
      { status: 422 },
    )
  }

  // Límite conservador. Gemini 2.5 Flash acepta hasta 2 GB vía inlineData
  // (base64), pero el tamaño razonable para un brand book es 100 MB.
  const MAX_PDF_BYTES = 100 * 1024 * 1024
  if (pdfBuffer.length > MAX_PDF_BYTES) {
    return NextResponse.json(
      {
        error:
          `El brand book pesa ${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB. ` +
          `El máximo soportado es 100 MB. Comprime el PDF antes de volver a procesarlo.`,
      },
      { status: 413 },
    )
  }

  // ── 5. Procesar con IA (Gemini 2.5 Flash primero, Claude como fallback) ──
  let extracted: ExtractedBrandContext
  let modelUsed = 'gemini-2.5-flash'
  try {
    extracted = await extractBrandContextWithGemini(pdfBuffer)
  } catch (geminiErr) {
    console.warn(
      '[process-brandbook] Gemini falló, intentando con Claude:',
      geminiErr instanceof Error ? geminiErr.message : geminiErr,
    )
    // Claude solo acepta hasta 32 MB
    if (pdfBuffer.length > 32 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            `Gemini no pudo procesar el PDF y el fallback de Claude no acepta PDFs > 32 MB. ` +
            `Error original: ${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)}`,
        },
        { status: 500 },
      )
    }
    try {
      extracted = await extractBrandContextWithClaude(pdfBuffer)
      modelUsed = 'claude-opus-4-5'
    } catch (claudeErr) {
      return NextResponse.json(
        {
          error:
            `Error procesando el brand book con IA. ` +
            `Gemini: ${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)}. ` +
            `Claude: ${claudeErr instanceof Error ? claudeErr.message : String(claudeErr)}.`,
        },
        { status: 500 },
      )
    }
  }

  // ── 6. Guardar en brand_context (UPSERT por client_id) ────────────────────
  const now = new Date().toISOString()

  const { data: contextData, error: upsertError } = await supabase
    .from('brand_context')
    .upsert(
      {
        client_id:      clientId,
        colors:         extracted.colors,
        typography:     extracted.typography,
        tone_of_voice:  extracted.tone_of_voice,
        style_keywords: extracted.style_keywords,
        restrictions:   extracted.restrictions,
        raw_summary:    extracted.raw_summary,
        processed_at:   now,
        source_file_id: brandBook.drive_file_id,
        updated_at:     now,
      },
      {
        onConflict: 'client_id',
      },
    )
    .select()
    .single()

  if (upsertError) {
    return NextResponse.json(
      { error: `Error guardando el contexto de marca: ${upsertError.message}` },
      { status: 500 },
    )
  }

  // Invalidar el caché del server component para que la página
  // refleje inmediatamente el nuevo has_context = true
  revalidatePath(`/clientes/${clientId}/brand-assets`)
  revalidatePath(`/clientes/${clientId}`)

  return NextResponse.json({
    success: true,
    context: contextData,
    stats: {
      colors:         extracted.colors.length,
      typography:     extracted.typography.length,
      style_keywords: extracted.style_keywords.length,
      pdf_size_kb:    Math.round(pdfBuffer.length / 1024),
      model:          modelUsed,
    },
  })
}
