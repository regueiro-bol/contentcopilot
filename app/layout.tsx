import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ContentCopilot — Plataforma de contenido IA para agencias',
  description:
    'Crea, gestiona y optimiza el contenido de tus clientes con inteligencia artificial. Potenciado por Claude AI.',
}

/**
 * Layout raíz de la aplicación
 * Envuelve todo con el proveedor de autenticación de Clerk
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
    >
      <html lang="es">
        <body className={`${inter.className} antialiased bg-gray-50`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
