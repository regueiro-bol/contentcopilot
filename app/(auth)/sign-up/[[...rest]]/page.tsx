import { SignUp } from '@clerk/nextjs'
import { Bot } from 'lucide-react'

/**
 * Página de registro de nuevos usuarios
 * Utiliza el componente preconstruido de Clerk
 */
export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo y nombre */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Bot className="h-8 w-8 text-indigo-600" />
          <span className="text-2xl font-bold text-gray-900">ContentCopilot</span>
        </div>

        {/* Componente de registro de Clerk */}
        <div className="flex justify-center">
          {/* fallbackRedirectUrl: a dónde ir tras registrarse (si no hay returnBackUrl en la URL) */}
          <SignUp
            fallbackRedirectUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'shadow-sm border border-gray-200 rounded-xl',
                headerTitle: 'text-gray-900',
                headerSubtitle: 'text-gray-500',
                formButtonPrimary:
                  'bg-indigo-600 hover:bg-indigo-700 text-white',
                footerActionLink: 'text-indigo-600 hover:text-indigo-700',
              },
            }}
          />
        </div>
      </div>
    </div>
  )
}
