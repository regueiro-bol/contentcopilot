import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import {
  AlertTriangle,
  Calendar,
  Clock,
  Inbox,
  FileText,
  Users,
  Sparkles,
  CheckCircle,
  ArrowRight,
  PenLine,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { colorEstadoContenido, etiquetaEstadoContenido } from '@/lib/utils'

const LIMIT = 20

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------
type ContenidoCola = {
  id: string
  titulo: string
  estado: string
  fecha_entrega: string | null
  keyword_principal: string | null
  tamanyo_texto_min: number | null
  tamanyo_texto_max: number | null
  proyectos: { nombre: string } | null
  clientes: { nombre: string } | null
}

function diasRestantes(fecha: string): number {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const entrega = new Date(fecha)
  entrega.setHours(0, 0, 0, 0)
  return Math.ceil((entrega.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

function FechaTag({ fecha }: { fecha: string }) {
  const dias = diasRestantes(fecha)
  if (dias < 0)
    return (
      <span className="text-xs font-semibold text-red-600 whitespace-nowrap">
        Vencido {Math.abs(dias)}d
      </span>
    )
  if (dias === 0)
    return <span className="text-xs font-semibold text-red-600">Hoy</span>
  if (dias === 1)
    return <span className="text-xs font-semibold text-orange-500">Mañana</span>
  return (
    <span className="text-xs text-gray-400 whitespace-nowrap">
      {new Date(fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// ContenidoRow — card con toda la info requerida
// ---------------------------------------------------------------------------
function ContenidoRow({
  c,
  esUrgente = false,
}: {
  c: ContenidoCola
  esUrgente?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors group border-b border-gray-100 last:border-0">
      {/* Icono urgencia — solo en urgentes */}
      {esUrgente ? (
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
      ) : (
        <div className="w-4 shrink-0" />
      )}

      {/* Bloque de texto */}
      <div className="min-w-0 flex-1">
        {/* Cliente › Proyecto */}
        <p className="text-xs text-gray-400 truncate leading-tight">
          {c.clientes?.nombre ?? 'Sin cliente'}{' '}
          <span className="text-gray-300">›</span>{' '}
          {c.proyectos?.nombre ?? 'Sin proyecto'}
        </p>
        {/* Título */}
        <p className="text-sm font-bold text-gray-900 truncate group-hover:text-indigo-600 transition-colors leading-snug mt-0.5">
          {c.titulo}
        </p>
        {/* Keyword + extensión */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {c.keyword_principal && (
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
              {c.keyword_principal}
            </span>
          )}
          {c.tamanyo_texto_min && c.tamanyo_texto_max && (
            <span className="text-xs text-gray-400">
              {c.tamanyo_texto_min}–{c.tamanyo_texto_max} pal.
            </span>
          )}
        </div>
      </div>

      {/* Badge estado + fecha + botón */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorEstadoContenido(c.estado)}`}
        >
          {etiquetaEstadoContenido(c.estado)}
        </span>
        <span className="text-xs text-gray-400 w-14 text-right">
          {c.fecha_entrega ? <FechaTag fecha={c.fecha_entrega} /> : (
            <span className="text-gray-300">Sin fecha</span>
          )}
        </span>
        <Link
          href={`/contenidos/${c.id}`}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
        >
          <PenLine className="h-3 w-3" />
          Redactar
        </Link>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SeccionCola — solo renderiza si hay items
// ---------------------------------------------------------------------------
function SeccionCola({
  titulo,
  colorClass,
  icono,
  items,
  esUrgente = false,
}: {
  titulo: string
  colorClass: string
  icono: React.ReactNode
  items: ContenidoCola[]
  esUrgente?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div className="mb-1">
      {/* Cabecera de sección */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-lg mx-1 mb-0.5 ${colorClass}`}>
        {icono}
        <span className="text-xs font-bold uppercase tracking-wider">{titulo}</span>
        <span className="ml-auto text-xs font-semibold opacity-60">{items.length}</span>
      </div>
      {/* Filas */}
      <div>
        {items.map((c) => (
          <ContenidoRow key={c.id} c={c} esUrgente={esUrgente} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function DashboardPage() {
  const supabase = createAdminClient()

  const [
    { data: contenidosRaw },
    { count: totalClientes },
    { count: totalPublicados },
    { count: totalActivos },
  ] = await Promise.all([
    supabase
      .from('contenidos')
      .select(`
        id, titulo, estado, fecha_entrega, keyword_principal,
        tamanyo_texto_min, tamanyo_texto_max,
        proyectos (nombre),
        clientes (nombre)
      `)
      .not('estado', 'in', '("aprobado","publicado")')
      .order('fecha_entrega', { ascending: true, nullsFirst: false }),
    supabase
      .from('clientes')
      .select('id', { count: 'exact', head: true })
      .eq('activo', true),
    supabase
      .from('contenidos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'publicado'),
    supabase
      .from('contenidos')
      .select('id', { count: 'exact', head: true })
      .not('estado', 'in', '("aprobado","publicado")'),
  ])

  const lista: ContenidoCola[] = (contenidosRaw ?? []) as unknown as ContenidoCola[]

  // ── Clasificar por urgencia (lista completa para conteos y stats) ──
  const urgente: ContenidoCola[] = []
  const estaSemana: ContenidoCola[] = []
  const proximamente: ContenidoCola[] = []
  const sinFecha: ContenidoCola[] = []

  for (const c of lista) {
    if (c.estado === 'devuelto') { urgente.push(c); continue }
    if (!c.fecha_entrega)        { sinFecha.push(c); continue }
    const dias = diasRestantes(c.fecha_entrega)
    if (dias <= 2)       urgente.push(c)
    else if (dias <= 7)  estaSemana.push(c)
    else if (dias <= 30) proximamente.push(c)
    else                 sinFecha.push(c)
  }

  // ── Aplicar límite de 20 priorizando por urgencia ──
  const listaOrdenada = [...urgente, ...estaSemana, ...proximamente, ...sinFecha]
  const hayMas = listaOrdenada.length > LIMIT
  const visibles = new Set(listaOrdenada.slice(0, LIMIT).map((c) => c.id))

  const urgenteV     = urgente.filter((c) => visibles.has(c.id))
  const estaSemanaV  = estaSemana.filter((c) => visibles.has(c.id))
  const proximamenteV = proximamente.filter((c) => visibles.has(c.id))
  const sinFechaV    = sinFecha.filter((c) => visibles.has(c.id))

  // ── Stats panel ──
  const panelStats = [
    {
      titulo: 'En cola',
      valor: totalActivos ?? lista.length,
      icono: <FileText className="h-5 w-5 text-indigo-600" />,
      fondo: 'bg-indigo-50',
      sub: `${urgente.length} urgente${urgente.length !== 1 ? 's' : ''}`,
    },
    {
      titulo: 'Urgentes',
      valor: urgente.length,
      icono: <AlertTriangle className="h-5 w-5 text-red-500" />,
      fondo: 'bg-red-50',
      sub: 'Entrega ≤ 2 días o devuelto',
    },
    {
      titulo: 'Clientes activos',
      valor: totalClientes ?? 0,
      icono: <Users className="h-5 w-5 text-blue-600" />,
      fondo: 'bg-blue-50',
      sub: 'En la plataforma',
    },
    {
      titulo: 'Publicados',
      valor: totalPublicados ?? 0,
      icono: <CheckCircle className="h-5 w-5 text-green-600" />,
      fondo: 'bg-green-50',
      sub: 'Total histórico',
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Cola de trabajo</h2>
        <p className="text-gray-500 mt-1 text-sm">
          {lista.length === 0
            ? 'No hay contenidos pendientes. ¡Todo al día!'
            : `${lista.length} contenido${lista.length !== 1 ? 's' : ''} pendiente${lista.length !== 1 ? 's' : ''} · ${urgente.length} urgente${urgente.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Cola — 2/3 ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-2">
              {lista.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
                    <CheckCircle className="h-7 w-7 text-green-500" />
                  </div>
                  <p className="font-semibold text-gray-800">Todo al día</p>
                  <p className="text-sm text-gray-400 mt-1">
                    No hay contenidos pendientes en este momento.
                  </p>
                </div>
              ) : (
                <>
                  <SeccionCola
                    titulo="Urgente"
                    colorClass="bg-red-50 text-red-700"
                    icono={<AlertTriangle className="h-3.5 w-3.5" />}
                    items={urgenteV}
                    esUrgente
                  />
                  <SeccionCola
                    titulo="Esta semana"
                    colorClass="bg-orange-50 text-orange-700"
                    icono={<Clock className="h-3.5 w-3.5" />}
                    items={estaSemanaV}
                  />
                  <SeccionCola
                    titulo="Próximamente"
                    colorClass="bg-blue-50 text-blue-700"
                    icono={<Calendar className="h-3.5 w-3.5" />}
                    items={proximamenteV}
                  />
                  <SeccionCola
                    titulo="Sin fecha"
                    colorClass="bg-gray-100 text-gray-600"
                    icono={<Inbox className="h-3.5 w-3.5" />}
                    items={sinFechaV}
                  />

                  {/* Footer: Ver todos si hay más de 20 */}
                  {hayMas && (
                    <div className="px-4 py-3 mt-1 border-t border-gray-100">
                      <Link
                        href="/contenidos"
                        className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        Ver todos los contenidos
                        <ArrowRight className="h-3.5 w-3.5" />
                        <span className="ml-1 text-xs text-gray-400 font-normal">
                          ({lista.length - LIMIT} más)
                        </span>
                      </Link>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Panel stats — 1/3 ── */}
        <div className="space-y-3">
          {panelStats.map(({ titulo, valor, icono, fondo, sub }) => (
            <Card key={titulo}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`${fondo} p-2.5 rounded-xl shrink-0`}>{icono}</div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{valor}</p>
                    <p className="text-xs font-semibold text-gray-600">{titulo}</p>
                    <p className="text-xs text-gray-400">{sub}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Acceso rápido */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Acceso rápido</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1">
              {[
                {
                  label: 'Abrir Copiloto',
                  href: '/copiloto',
                  icono: <Sparkles className="h-4 w-4 text-indigo-600" />,
                  colorClass: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
                },
                {
                  label: 'Clientes',
                  href: '/clientes',
                  icono: <Users className="h-4 w-4 text-blue-600" />,
                  colorClass: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                },
                {
                  label: 'Todos los contenidos',
                  href: '/contenidos',
                  icono: <FileText className="h-4 w-4 text-gray-600" />,
                  colorClass: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                },
              ].map(({ label, href, icono, colorClass }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${colorClass}`}
                >
                  {icono}
                  {label}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
