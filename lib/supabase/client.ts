import { createBrowserClient } from '@supabase/ssr'

/**
 * Cliente de Supabase para uso en el navegador (componentes cliente)
 * Utiliza las variables de entorno públicas para la conexión
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
