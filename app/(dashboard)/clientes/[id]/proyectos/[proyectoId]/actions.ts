'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DocumentoProyecto, Proyecto } from '@/types'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    + '-' + Date.now().toString(36)
}

function splitCSV(str: string): string[] {
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const path = (clienteId: string, proyectoId: string) =>
  `/clientes/${clienteId}/proyectos/${proyectoId}`

// ─── Configuración ──────────────────────────────────────────────────────────

export async function actualizarConfiguracion(
  proyectoId: string,
  clienteId: string,
  data: {
    nombre: string
    descripcion: string
    tono_voz: string
    etiquetas_tono: string[]
    modo_creativo: boolean
  },
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('proyectos')
    .update({
      nombre: data.nombre.trim(),
      descripcion: data.descripcion.trim(),
      tono_voz: data.tono_voz.trim(),
      etiquetas_tono: data.etiquetas_tono,
      modo_creativo: data.modo_creativo,
    })
    .eq('id', proyectoId)

  if (error) throw new Error(error.message)
  revalidatePath(path(clienteId, proyectoId))
}

// ─── SEO / GEO ───────────────────────────────────────────────────────────────

export async function actualizarSeo(
  proyectoId: string,
  clienteId: string,
  data: {
    keywords_objetivo_csv: string
    keywords_prohibidas_csv: string
    tematicas_autorizadas_csv: string
    tematicas_vetadas_csv: string
    perfil_lector: string
    excel_seo_url: string
  },
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('proyectos')
    .update({
      keywords_objetivo: splitCSV(data.keywords_objetivo_csv),
      keywords_prohibidas: splitCSV(data.keywords_prohibidas_csv),
      tematicas_autorizadas: splitCSV(data.tematicas_autorizadas_csv),
      tematicas_vetadas: splitCSV(data.tematicas_vetadas_csv),
      perfil_lector: data.perfil_lector.trim(),
      excel_seo_url: data.excel_seo_url.trim() || null,
    })
    .eq('id', proyectoId)

  if (error) throw new Error(error.message)
  revalidatePath(path(clienteId, proyectoId))
}

// ─── Accesos documentales ────────────────────────────────────────────────────

export async function actualizarAccesos(
  proyectoId: string,
  clienteId: string,
  data: {
    drive_carpeta_url: string
    wordpress_url: string
  },
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('proyectos')
    .update({
      drive_carpeta_url: data.drive_carpeta_url.trim() || null,
      wordpress_url: data.wordpress_url.trim() || null,
    })
    .eq('id', proyectoId)

  if (error) throw new Error(error.message)
  revalidatePath(path(clienteId, proyectoId))
}

// ─── Entrega ─────────────────────────────────────────────────────────────────

export async function actualizarEntrega(
  proyectoId: string,
  clienteId: string,
  data: {
    modo_entrega: Proyecto['modo_entrega']
    cms_url: string
    contacto_aprobacion_nombre: string
    contacto_aprobacion_email: string
  },
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('proyectos')
    .update({
      modo_entrega: data.modo_entrega,
      cms_url: data.cms_url.trim() || null,
      contacto_aprobacion_nombre: data.contacto_aprobacion_nombre.trim() || null,
      contacto_aprobacion_email: data.contacto_aprobacion_email.trim() || null,
    })
    .eq('id', proyectoId)

  if (error) throw new Error(error.message)
  revalidatePath(path(clienteId, proyectoId))
}

// ─── Nuevo contenido ─────────────────────────────────────────────────────────

export async function crearContenido(
  proyectoId: string,
  clienteId: string,
  data: {
    titulo: string
    keyword_principal: string
    url_destino: string
    tamanyo_texto_min: number | null
    tamanyo_texto_max: number | null
    fecha_entrega: string
    redactor_id: string
    notas_iniciales: string
  },
) {
  const supabase = createAdminClient()
  const slug = slugify(data.titulo)

  const { error } = await supabase.from('contenidos').insert({
    proyecto_id: proyectoId,
    cliente_id: clienteId,
    titulo: data.titulo.trim(),
    slug,
    keyword_principal: data.keyword_principal.trim() || null,
    url_destino: data.url_destino.trim() || null,
    tamanyo_texto_min: data.tamanyo_texto_min ?? null,
    tamanyo_texto_max: data.tamanyo_texto_max ?? null,
    fecha_entrega: data.fecha_entrega || null,
    redactor_id: data.redactor_id.trim() || null,
    notas_iniciales: data.notas_iniciales.trim() || null,
    estado: 'pendiente',
  })

  if (error) throw new Error(error.message)
  revalidatePath(path(clienteId, proyectoId))
}

// ─── Subir documento ─────────────────────────────────────────────────────────

export async function subirDocumento(
  proyectoId: string,
  clienteId: string,
  formData: FormData,
) {
  const supabase = createAdminClient()

  const archivo = formData.get('archivo') as File
  const nombre = (formData.get('nombre') as string) || archivo?.name || 'documento'
  const tipo = formData.get('tipo') as DocumentoProyecto['tipo']
  const descripcion = (formData.get('descripcion') as string) || ''

  if (!archivo || archivo.size === 0) throw new Error('Selecciona un archivo')
  if (!tipo) throw new Error('Selecciona el tipo de documento')

  // Tipos MIME aceptados en el bucket
  const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/csv',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream', // fallback para ZIPs mal etiquetados
  ]

  // Crear el bucket si no existe (idempotente — ignora error de "ya existe")
  await supabase.storage.createBucket('documentos', {
    public: false,
    fileSizeLimit: 52428800, // 50 MB
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })

  // Actualizar el bucket existente con los nuevos tipos permitidos
  // (createBucket no modifica un bucket ya creado)
  await supabase.storage.updateBucket('documentos', {
    public: false,
    fileSizeLimit: 52428800, // 50 MB
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })
  // No comprobamos errores: si falla simplemente continúa con el upload

  // Upload to Supabase Storage
  const ext = archivo.name.split('.').pop() ?? 'bin'
  const safeName = nombre.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '')
  const storagePath = `${proyectoId}/${Date.now()}_${safeName}.${ext}`

  const arrayBuffer = await archivo.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await supabase.storage
    .from('documentos')
    .upload(storagePath, buffer, {
      contentType: archivo.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) throw new Error(`Error al subir: ${uploadError.message}`)

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('documentos')
    .getPublicUrl(storagePath)

  // Fetch current documents array
  const { data: proyecto, error: fetchError } = await supabase
    .from('proyectos')
    .select('documentos_subidos, rag_num_documentos')
    .eq('id', proyectoId)
    .single()

  if (fetchError) throw new Error(fetchError.message)

  const docs = (proyecto.documentos_subidos ?? []) as DocumentoProyecto[]
  const nuevoDoc: DocumentoProyecto = {
    id: randomUUID(),
    nombre: nombre.trim(),
    tipo,
    url: urlData.publicUrl,
    fecha_subida: new Date().toISOString(),
    tamanyo_kb: Math.round(archivo.size / 1024),
    descripcion: descripcion.trim() || undefined,
  }

  const { error: updateError } = await supabase
    .from('proyectos')
    .update({
      documentos_subidos: [...docs, nuevoDoc],
      rag_num_documentos: (proyecto.rag_num_documentos ?? 0) + 1,
      rag_ultima_actualizacion: new Date().toISOString(),
    })
    .eq('id', proyectoId)

  if (updateError) throw new Error(updateError.message)
  revalidatePath(path(clienteId, proyectoId))
}

// ─── Eliminar documento ───────────────────────────────────────────────────────

export async function eliminarDocumento(
  proyectoId : string,
  clienteId  : string,
  documentoId: string,   // UUID dentro del array JSONB
) {
  const supabase = createAdminClient()

  // 1. Obtener el proyecto para acceder al array de documentos
  const { data: proyecto, error: fetchError } = await supabase
    .from('proyectos')
    .select('documentos_subidos, rag_num_documentos')
    .eq('id', proyectoId)
    .single()

  if (fetchError) throw new Error(fetchError.message)

  const docs = (proyecto.documentos_subidos ?? []) as DocumentoProyecto[]
  const doc  = docs.find((d) => d.id === documentoId)
  if (!doc) throw new Error('Documento no encontrado')

  // 2. Eliminar el archivo de Storage (no fatal si falla — puede que ya no exista)
  try {
    // La URL pública tiene la forma: .../storage/v1/object/public/documentos/PATH
    const urlParts   = doc.url.split('/documentos/')
    const storagePath = urlParts[1]?.split('?')[0]
    if (storagePath) {
      await supabase.storage.from('documentos').remove([storagePath])
    }
  } catch {
    // Ignorar errores de Storage — seguimos eliminando el registro
  }

  // 3. Eliminar sus embeddings de documentos_rag (no fatal)
  try {
    await supabase
      .from('documentos_rag')
      .delete()
      .eq('proyecto_id', proyectoId)
      .eq('documento_id', documentoId)
  } catch {
    // Ignorar
  }

  // 4. Actualizar el array documentos_subidos quitando el documento
  const docsActualizados = docs.filter((d) => d.id !== documentoId)

  const { error: updateError } = await supabase
    .from('proyectos')
    .update({ documentos_subidos: docsActualizados })
    .eq('id', proyectoId)

  if (updateError) throw new Error(updateError.message)
  revalidatePath(path(clienteId, proyectoId))
}
