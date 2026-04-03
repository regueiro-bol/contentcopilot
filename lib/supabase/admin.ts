import { createClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase con service role key para Server Components y API routes.
 * Bypasea RLS — solo usar en contextos de servidor.
 * La autenticación de usuario la gestiona Clerk por separado.
 *
 * IMPORTANTE: SUPABASE_SERVICE_ROLE_KEY nunca debe exponerse al cliente.
 *
 * Nota: durante el build de Next.js las variables de entorno de servidor
 * (sin prefijo NEXT_PUBLIC_) no están disponibles. Esta función las valida
 * en tiempo de ejecución para evitar errores en el análisis estático de build.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!url || !key) {
    // Durante el build de Next.js esta función puede evaluarse sin que las
    // variables de entorno de servidor estén disponibles. Devolvemos un cliente
    // con credenciales vacías que fallará en la primera llamada real a la API,
    // pero no impide que el módulo cargue correctamente en tiempo de compilación.
    console.warn(
      '[Supabase] NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no definidas. ' +
      'El cliente no funcionará hasta que estén disponibles en runtime.'
    )
  }

  return createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}
