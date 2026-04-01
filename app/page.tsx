import Link from 'next/link'
import { Bot, Sparkles, Users, Zap, ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Página de inicio pública (landing page)
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Bot className="h-8 w-8 text-indigo-600" />
          <span className="text-xl font-bold text-gray-900">ContentCopilot</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Link con estilos de botón ghost — sin wrapper Button para evitar conflictos con Slot */}
          <Link href="/sign-in" className={buttonVariants({ variant: 'ghost' })}>
            Iniciar sesión
          </Link>
          <Link href="/sign-up" className={buttonVariants({ variant: 'default' })}>
            Comenzar gratis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-8 pt-20 pb-32">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 rounded-full px-4 py-1.5 text-sm font-medium mb-6 border border-indigo-100">
            <Sparkles className="h-3.5 w-3.5" />
            Potenciado por Claude Opus 4.6
          </div>

          <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
            Tu copiloto de contenido
            <br />
            <span className="text-indigo-600">con inteligencia artificial</span>
          </h1>

          <p className="text-xl text-gray-600 mb-10 leading-relaxed">
            Crea, gestiona y optimiza el contenido de todos tus clientes desde una sola
            plataforma. Agentes de IA especializados que entienden la voz de cada marca.
          </p>

          <div className="flex items-center justify-center gap-4">
            {/* Botón primario hero — Link directo con tamaño lg */}
            <Link
              href="/sign-up"
              className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}
            >
              Empezar ahora
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-in"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              Iniciar sesión
            </Link>
          </div>
        </div>

        {/* Características */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
          {[
            {
              icono: Bot,
              titulo: 'Copiloto IA',
              descripcion:
                'Editor con asistente en tiempo real que genera y mejora tu contenido al instante.',
            },
            {
              icono: Users,
              titulo: 'Multi-cliente',
              descripcion:
                'Gestiona múltiples clientes con perfiles de marca y tono de voz diferenciados.',
            },
            {
              icono: Zap,
              titulo: 'Agentes especializados',
              descripcion:
                'Agentes de IA para blog, redes sociales, email, SEO y más, listos para usar.',
            },
          ].map(({ icono: Icono, titulo, descripcion }) => (
            <div
              key={titulo}
              className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="h-12 w-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                <Icono className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{titulo}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{descripcion}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
