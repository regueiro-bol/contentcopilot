import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  Search,
  Map,
  FileText,
  RefreshCw,
  Plus,
  Lock,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Layers,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatearFecha } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
interface SesionResumen {
  id             : string
  client_nombre  : string
  nombre         : string
  status         : string
  created_at     : string
  total_keywords : number
  num_clusters   : number
}

// ─────────────────────────────────────────────────────────────
// Helpers UI
// ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft       : { label: 'Borrador',      cls: 'bg-gray-100 text-gray-600' },
    researching : { label: 'Investigando',  cls: 'bg-blue-100 text-blue-700' },
    clustering  : { label: 'Agrupando',     cls: 'bg-yellow-100 text-yellow-700' },
    completed   : { label: 'Completada',    cls: 'bg-green-100 text-green-700' },
    error       : { label: 'Error',         cls: 'bg-red-100 text-red-700' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Sección de módulo (activa o bloqueada)
// ─────────────────────────────────────────────────────────────
function ModuleSection({
  icon: Icon,
  title,
  description,
  badge,
  locked,
  href,
  color,
}: {
  icon    : React.ElementType
  title   : string
  description: string
  badge?  : string
  locked  : boolean
  href?   : string
  color   : string
}) {
  const inner = (
    <Card className={`relative transition-all duration-200 ${
      locked
        ? 'opacity-60 cursor-not-allowed'
        : 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
    }`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`rounded-xl p-2.5 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              {badge && (
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                  {badge}
                </span>
              )}
              {locked && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-400">
                  <Lock className="h-3 w-3" />
                  Próximamente
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
          </div>
          {!locked && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />}
        </div>
      </CardContent>
    </Card>
  )

  if (!locked && href) {
    return <Link href={href}>{inner}</Link>
  }
  return inner
}

// ─────────────────────────────────────────────────────────────
// Página principal (Server Component)
// ─────────────────────────────────────────────────────────────
export default async function StrategyPage() {
  const supabase = createAdminClient()

  // Últimas sesiones de investigación
  const { data: sesionesRaw } = await supabase
    .from('vista_strategy_sessions')
    .select('id, client_nombre, nombre, status, created_at, total_keywords, num_clusters')
    .order('created_at', { ascending: false })
    .limit(5)

  const sesiones: SesionResumen[] = (sesionesRaw ?? []).map((s) => ({
    id            : String(s.id),
    client_nombre : String(s.client_nombre ?? '—'),
    nombre        : String(s.nombre ?? '—'),
    status        : String(s.status ?? 'draft'),
    created_at    : String(s.created_at),
    total_keywords: Number(s.total_keywords ?? 0),
    num_clusters  : Number(s.num_clusters  ?? 0),
  }))

  // Contadores para el header
  const { count: totalSesiones } = await supabase
    .from('keyword_research_sessions')
    .select('id', { count: 'exact', head: true })

  const { count: totalMapas } = await supabase
    .from('content_maps')
    .select('id', { count: 'exact', head: true })

  const { count: totalKeywords } = await supabase
    .from('keywords')
    .select('id', { count: 'exact', head: true })
    .eq('incluida', true)

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estrategia de Contenidos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Investigación de keywords, clustering y planificación editorial basada en datos.
          </p>
        </div>
        <Button asChild className="gap-2 shrink-0">
          <Link href="/strategy/nueva">
            <Plus className="h-4 w-4" />
            Nueva Estrategia
          </Link>
        </Button>
      </div>

      {/* ── KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: 'Sesiones de research',
            value: totalSesiones ?? 0,
            icon : BarChart3,
            color: 'text-indigo-600',
            bg   : 'bg-indigo-50',
          },
          {
            label: 'Keywords analizadas',
            value: (totalKeywords ?? 0).toLocaleString('es-ES'),
            icon : TrendingUp,
            color: 'text-emerald-600',
            bg   : 'bg-emerald-50',
          },
          {
            label: 'Mapas de contenido',
            value: totalMapas ?? 0,
            icon : Map,
            color: 'text-violet-600',
            bg   : 'bg-violet-50',
          },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Módulos del workflow ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700">
            Flujo de trabajo estratégico
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <ModuleSection
            icon={Search}
            title="Briefing y Research"
            description="Define los tópicos semilla, lanza la investigación de keywords con DataForSEO y analiza el mercado."
            badge="Sprint 2"
            locked={false}
            href="/strategy/nueva"
            color="bg-indigo-100 text-indigo-600"
          />
          <ModuleSection
            icon={Layers}
            title="Clustering y Priorización"
            description="Agrupa keywords por intención y temática. Asigna prioridad editorial basada en volumen y dificultad."
            locked={true}
            color="bg-violet-100 text-violet-600"
          />
          <ModuleSection
            icon={Map}
            title="Mapa de Contenidos"
            description="Genera el plan editorial mensual: artículos, keywords objetivo, clúster y etapa del funnel."
            locked={true}
            color="bg-emerald-100 text-emerald-600"
          />
          <ModuleSection
            icon={RefreshCw}
            title="Mantenimiento y Auditoría"
            description="Monitoriza posiciones, detecta canibalización y actualiza el mapa con nuevas oportunidades."
            locked={true}
            color="bg-amber-100 text-amber-600"
          />
        </CardContent>
      </Card>

      {/* ── Últimas sesiones ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">
              Últimas sesiones de investigación
            </CardTitle>
            {sesiones.length > 0 && (
              <Link
                href="/strategy/sesiones"
                className="text-xs text-indigo-600 hover:underline font-medium"
              >
                Ver todas
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sesiones.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-gray-500">Sin sesiones todavía</p>
              <p className="text-xs mt-1">
                Crea tu primera estrategia con el botón{' '}
                <span className="font-semibold text-indigo-600">Nueva Estrategia</span>
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sesiones.map((s) => (
                <div key={s.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.nombre || '—'}</p>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="text-xs text-gray-400">
                      {s.client_nombre} · {formatearFecha(s.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div className="hidden sm:block">
                      <p className="text-sm font-semibold text-gray-700">
                        {s.total_keywords.toLocaleString('es-ES')}
                      </p>
                      <p className="text-[10px] text-gray-400">keywords</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-sm font-semibold text-gray-700">{s.num_clusters}</p>
                      <p className="text-[10px] text-gray-400">clusters</p>
                    </div>
                    <Link
                      href={`/strategy/${s.id}/keywords`}
                      className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Ver →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Test de integración DataForSEO ─────────────────── */}
      <Card className="border-dashed border-amber-200 bg-amber-50/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2">
              <FileText className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">Verificar integración DataForSEO</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Comprueba que las credenciales DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD están configuradas correctamente.
              </p>
            </div>
            <a
              href="/api/strategy/test-dataforseo"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors border border-amber-200"
            >
              Ejecutar test →
            </a>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
