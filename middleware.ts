import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

/**
 * Rutas que requieren autenticación (Clerk v7 — patrón de protección invertida).
 * Todo lo que NO esté aquí es público por defecto: /, /sign-in, /sign-up.
 */
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/clientes(.*)',
  '/pedidos(.*)',
  '/proyectos(.*)',
  '/copiloto(.*)',
  '/agentes(.*)',
  '/api/claude(.*)',
  '/api/dify(.*)',
  '/api/pedidos(.*)',
])

/**
 * clerkMiddleware — API oficial de Clerk v7 para Next.js App Router.
 *
 * Opciones explícitas para que el middleware sepa:
 *  - dónde están las páginas de auth (signInUrl / signUpUrl)
 *  - dónde redirigir TRAS autenticarse (afterSignInUrl / afterSignUpUrl)
 *
 * Nota: afterSignInUrl por defecto es '/' en Clerk v7, lo que provoca que
 * el usuario aterrice en la portada. Al declararlo explícitamente se fuerza
 * el redireccionamiento a /dashboard.
 */
export default clerkMiddleware(
  async (auth, request) => {
    if (isProtectedRoute(request)) {
      // Redirige a /sign-in si el usuario no está autenticado
      await auth.protect()
    }
  },
  {
    signInUrl: '/sign-in',
    signUpUrl: '/sign-up',
    afterSignInUrl: '/dashboard',
    afterSignUpUrl: '/dashboard',
  }
)

export const config = {
  matcher: [
    // Procesar todas las rutas excepto archivos estáticos y recursos de Next.js
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Incluir siempre las rutas API
    '/(api|trpc)(.*)',
  ],
}
