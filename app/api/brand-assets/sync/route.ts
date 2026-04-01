/**
 * POST /api/brand-assets/sync
 *
 * Sincroniza los activos de marca de un cliente desde Google Drive.
 *
 * Estructura de carpetas esperada en Drive:
 *   <carpeta-agencia>/
 *     <nombre-cliente>/
 *       _brand-assets/
 *         logos/
 *         colores/
 *         tipografias/
 *         imagenes-producto/
 *         ads-referencia/
 *
 * Variables de entorno requeridas:
 *   GOOGLE_SERVICE_ACCOUNT_JSON   — JSON completo de la cuenta de servicio
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID   — (opcional) ID de la carpeta raíz de agencia;
 *                                   si no se define, busca en todo el Drive compartido
 *
 * La cuenta de servicio debe tener acceso de lectura a las carpetas de Drive
 * (compartir la carpeta raíz de agencia con el email de la cuenta de servicio).
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { google, drive_v3 } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AssetType } from '@/types/brand-assets'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

/** Nombre de la carpeta raíz de activos de marca dentro de la carpeta del cliente */
const BRAND_ASSETS_FOLDER = '_brand-assets'

/** Mapeo subcarpeta Drive → asset_type de la tabla brand_assets */
const SUBFOLDER_TO_ASSET_TYPE: Record<string, AssetType> = {
  'logos':              'logo',
  'brand-book':         'brand_book',
  'imagenes-producto':  'product_image',
  'ads-referencia':     'reference_ad',
  'plantillas':         'template',
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de Google Drive
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye un cliente autenticado de Drive v3 usando la cuenta de servicio
 * definida en GOOGLE_SERVICE_ACCOUNT_JSON.
 */
function buildDriveClient(): drive_v3.Drive {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error(
      'Variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON no configurada. ' +
      'Añade el JSON de la cuenta de servicio de Google al .env.local'
    )
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
 * Escapa comillas simples en un nombre para usarlo en queries de Drive API.
 * La API acepta \' como escape dentro del valor entre comillas simples.
 */
function escapeDriveQuery(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Busca una carpeta hija por nombre dentro de un folder padre.
 * Devuelve el primer resultado o null si no existe.
 */
async function findChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<drive_v3.Schema$File | null> {
  const res = await drive.files.list({
    q: [
      `'${parentId}' in parents`,
      `name = '${escapeDriveQuery(name)}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `trashed = false`,
    ].join(' and '),
    fields: 'files(id, name)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return res.data.files?.[0] ?? null
}

/**
 * Busca una carpeta por nombre en todo el Drive accesible (sin padre fijo).
 * Se usa cuando GOOGLE_DRIVE_ROOT_FOLDER_ID no está configurado.
 */
async function findFolderByName(
  drive: drive_v3.Drive,
  name: string,
): Promise<drive_v3.Schema$File | null> {
  const res = await drive.files.list({
    q: [
      `name = '${escapeDriveQuery(name)}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `trashed = false`,
    ].join(' and '),
    fields: 'files(id, name)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return res.data.files?.[0] ?? null
}

/**
 * Lista todos los ficheros (no carpetas) dentro de una carpeta, paginando
 * automáticamente para devolver la lista completa.
 */
async function listFolderFiles(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<drive_v3.Schema$File[]> {
  const files: drive_v3.Schema$File[] = []
  let pageToken: string | undefined

  do {
    const res = await drive.files.list({
      q: [
        `'${folderId}' in parents`,
        `mimeType != 'application/vnd.google-apps.folder'`,
        `trashed = false`,
      ].join(' and '),
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink)',
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    files.push(...(res.data.files ?? []))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return files
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
  let body: { client_id?: string; folder_name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { client_id: clientId, folder_name: folderNameOverride } = body
  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── 3. Obtener nombre del cliente desde la BD ──────────────────────────────
  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('id', clientId)
    .single()

  if (clienteError || !cliente) {
    return NextResponse.json(
      { error: `Cliente con id "${clientId}" no encontrado en la base de datos` },
      { status: 404 },
    )
  }

  // ── 4. Construir cliente de Drive ──────────────────────────────────────────
  let drive: drive_v3.Drive
  try {
    drive = buildDriveClient()
  } catch (err) {
    return NextResponse.json(
      { error: `Configuración de Google Drive: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    )
  }

  // ── 5. Localizar la carpeta del cliente en Drive ───────────────────────────
  // El nombre a buscar en Drive puede diferir del nombre canónico en la BD.
  // Si el caller proporciona `folder_name` en el body, se usa ese valor.
  // En caso contrario se usa el nombre del cliente tal como está en la BD.
  const driveSearchName = folderNameOverride?.trim() || cliente.nombre

  let clientFolderId: string
  try {
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim()
    const clientFolder = rootFolderId
      ? await findChildFolder(drive, rootFolderId, driveSearchName)
      : await findFolderByName(drive, driveSearchName)

    if (!clientFolder?.id) {
      return NextResponse.json(
        {
          error:
            `No se encontró la carpeta "${driveSearchName}" en Google Drive. ` +
            `Si el nombre de la carpeta difiere del cliente en la BD, ` +
            `pasa folder_name en el body para sobreescribirlo.`,
        },
        { status: 404 },
      )
    }
    clientFolderId = clientFolder.id
  } catch (err) {
    return NextResponse.json(
      { error: `Error buscando carpeta del cliente en Drive: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  // ── 6. Localizar la carpeta _brand-assets ─────────────────────────────────
  let brandFolderId: string
  try {
    const brandFolder = await findChildFolder(drive, clientFolderId, BRAND_ASSETS_FOLDER)
    if (!brandFolder?.id) {
      return NextResponse.json(
        {
          error:
            `No se encontró la subcarpeta "${BRAND_ASSETS_FOLDER}" dentro de ` +
            `"${cliente.nombre}". Créala en Drive con las subcarpetas: ` +
            Object.keys(SUBFOLDER_TO_ASSET_TYPE).join(', ') + '.',
        },
        { status: 404 },
      )
    }
    brandFolderId = brandFolder.id
  } catch (err) {
    return NextResponse.json(
      { error: `Error buscando "${BRAND_ASSETS_FOLDER}": ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  // ── 7. Descubrir qué subcarpetas existen (no falla si faltan algunas) ──────
  type SubfolderEntry = { assetType: AssetType; folderId: string; folderName: string }
  const subfolders: SubfolderEntry[] = []

  await Promise.allSettled(
    Object.entries(SUBFOLDER_TO_ASSET_TYPE).map(async ([folderName, assetType]) => {
      try {
        const folder = await findChildFolder(drive, brandFolderId, folderName)
        if (folder?.id) {
          subfolders.push({ assetType, folderId: folder.id, folderName })
        }
      } catch {
        // Subcarpeta inaccesible — se omite silenciosamente
      }
    }),
  )

  // ── 8. Cargar activos existentes de este cliente para deduplicación ────────
  const { data: existingRows, error: fetchError } = await supabase
    .from('brand_assets')
    .select('id, drive_file_id')
    .eq('client_id', clientId)

  if (fetchError) {
    return NextResponse.json(
      { error: `Error consultando brand_assets: ${fetchError.message}` },
      { status: 500 },
    )
  }

  // drive_file_id → row UUID en Supabase
  const existingByDriveId = new Map<string, string>()
  for (const row of existingRows ?? []) {
    existingByDriveId.set(row.drive_file_id, row.id)
  }

  // ── 9. Iterar ficheros y hacer INSERT / UPDATE ─────────────────────────────
  const errors: string[] = []
  let newCount = 0
  let updatedCount = 0
  const syncedAt = new Date().toISOString()

  for (const { assetType, folderId, folderName } of subfolders) {
    // Listar ficheros de la subcarpeta
    let files: drive_v3.Schema$File[]
    try {
      files = await listFolderFiles(drive, folderId)
    } catch (err) {
      errors.push(
        `Error listando "${folderName}/": ${err instanceof Error ? err.message : String(err)}`,
      )
      continue
    }

    // Procesar cada fichero individualmente (errores aislados)
    for (const file of files) {
      const driveFileId = file.id
      const fileName = file.name ?? null
      const mimeType = file.mimeType ?? null
      const driveUrl = file.webViewLink ?? ''

      if (!driveFileId) {
        errors.push(`Fichero sin ID en "${folderName}/" — omitido`)
        continue
      }

      const existingRowId = existingByDriveId.get(driveFileId)

      try {
        if (existingRowId) {
          // ACTUALIZAR — solo toca metadatos de sync, preserva approved y metadata
          const { error } = await supabase
            .from('brand_assets')
            .update({
              drive_url:  driveUrl,
              file_name:  fileName,
              mime_type:  mimeType,
              synced_at:  syncedAt,
            })
            .eq('id', existingRowId)

          if (error) throw error
          updatedCount++
        } else {
          // INSERTAR nuevo activo — pendiente de aprobación por defecto
          const { error } = await supabase
            .from('brand_assets')
            .insert({
              client_id:     clientId,
              asset_type:    assetType,
              drive_file_id: driveFileId,
              drive_url:     driveUrl,
              file_name:     fileName,
              mime_type:     mimeType,
              metadata:      {},
              approved:      false,
              active:        true,
              synced_at:     syncedAt,
            })

          if (error) throw error
          newCount++
          // Registrar en el mapa para que un duplicado en Drive no genere doble INSERT
          existingByDriveId.set(driveFileId, driveFileId)
        }
      } catch (err) {
        const label = fileName ? `"${fileName}"` : `[id: ${driveFileId}]`
        errors.push(
          `Error procesando ${label} (${assetType}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }
  }

  // ── 10. Respuesta ──────────────────────────────────────────────────────────
  return NextResponse.json({
    synced:  newCount + updatedCount,
    new:     newCount,
    updated: updatedCount,
    errors,
  })
}
