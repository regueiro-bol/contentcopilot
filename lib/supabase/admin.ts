import { createClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase para Server Components.
 * Usa la service role key para bypasear RLS en consultas de servidor.
 * La autenticación de usuario la gestiona Clerk por separado.
 *
 * IMPORTANTE: SUPABASE_SERVICE_ROLE_KEY nunca debe exponerse al cliente.
 * Solo se usa aquí en Server Components (no tiene prefijo NEXT_PUBLIC_).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Faltan variables de entorno Supabase. ' +
      'Asegúrate de definir NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local'
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
