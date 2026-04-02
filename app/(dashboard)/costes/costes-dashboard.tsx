'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Calculator, TrendingUp, FileText, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CostesDashboardData } from './page'
import { colorEstadoContenido, etiquetaEstadoContenido, formatearFecha } from '@/lib/utils'
import type { EstadoContenido } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  return `$${(n ?? 0).toFixed(4)}`
}

function fmtUSDCorto(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${(n ?? 0).toFixed(4)}`
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  titulo, valor, subtitulo, icono: Icono, color = 'indigo',
}: {
  titulo    : string
  valor     : string
  subtitulo?: string
  icono     : React.ElementType
  color?    : 'indigo' | 'green' | 'violet' | 'amber'
}) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green : 'bg-green-50  text-green-600',
    violet: 'bg-violet-50 text-violet-600',
    amber : 'bg-amber-50  text-amber-600',
  }
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</p>
            <p className="mt-1.5 text-2xl font-bold text-gray-900 truncate">{valor}</p>
            {subtitulo && <p className="mt-0.5 text-xs text-gray-400">{subtitulo}</p>}
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
            <Icono className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Barra horizontal CSS ─────────────────────────────────────────────────────

function BarraHorizontal({
  label, valor, maximo, indice,
}: {
  label  : string
  valor  : number
  maximo : number
  indice : number
}) {
  const pct = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 2
  const colores = [
    'bg-indigo-500', 'bg-violet-500', 'bg-blue-500', 'bg-sky-500',
    'bg-cyan-500',   'bg-teal-500',   'bg-emerald-500', 'bg-green-500',
  ]
  const color = colores[indice % colores.length]

  return (
    <div className="flex items-center gap-3">
      <div className="w-36 text-xs text-gray-700 truncate text-right shrink-0">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-24 text-xs font-semibold text-gray-700 text-right shrink-0">
        {fmtUSD(valor)}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CostesDashboard({ data }: { data: CostesDashboardData }) {
  const router = useRouter()

  function navegar(params: Record<string, string>) {
    const sp = new URLSearchParams({
      mes    : String(data.mes),
      anyo   : String(data.anyo),
      pagina : '1',
      ...(data.filtroCliente ? { cliente: data.filtroCliente } : {}),
      ...params,
    })
    router.push(`/costes?${sp.toString()}`)
  }

  function cambiarMes(delta: number) {
    let nuevoMes  = data.mes  + delta
    let nuevoAnyo = data.anyo
    if (nuevoMes < 1) { nuevoMes = 12; nuevoAnyo-- }
    if (nuevoMes > 12) { nuevoMes = 1;  nuevoAnyo++ }
    navegar({ mes: String(nuevoMes), anyo: String(nuevoAnyo) })
  }

  const maxCosteCliente = Math.max(...data.costesPorCliente.map(c => c.coste_total), 0.0001)

  const hayCostes = data.totalMes > 0

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Cabecera con selector de mes ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Calculator className="h-5 w-5 text-indigo-600" />
            Calculadora de costes IA
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Seguimiento del gasto en Claude, embeddings RAG e imágenes FLUX
          </p>
        </div>

        {/* Selector de mes/año */}
        <div className="flex items-center gap-2">
          {/* Filtro cliente */}
          <select
            value={data.filtroCliente ?? ''}
            onChange={(e) => navegar({ cliente: e.target.value })}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todos los clientes</option>
            {data.clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 border border-gray-200 rounded-lg bg-white px-2 py-1">
            <button
              onClick={() => cambiarMes(-1)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <span className="text-sm font-semibold text-gray-800 px-2 min-w-[130px] text-center">
              {MESES[data.mes - 1]} {data.anyo}
            </span>
            <button
              onClick={() => cambiarMes(+1)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          titulo="Total del mes"
          valor={fmtUSDCorto(data.totalMes)}
          subtitulo={`${MESES[data.mes - 1]} ${data.anyo}`}
          icono={Calculator}
          color="indigo"
        />
        <KpiCard
          titulo="Coste medio / contenido"
          valor={fmtUSD(data.costeMedioContenido)}
          subtitulo={`${data.numContenidos} contenido${data.numContenidos !== 1 ? 's' : ''} con actividad`}
          icono={FileText}
          color="violet"
        />
        <KpiCard
          titulo="Contenidos activos"
          valor={String(data.numContenidos)}
          subtitulo="con al menos una operación"
          icono={BarChart2}
          color="green"
        />
        <KpiCard
          titulo="Proyección fin de mes"
          valor={fmtUSDCorto(data.proyeccionFinMes)}
          subtitulo="basado en la media diaria"
          icono={TrendingUp}
          color="amber"
        />
      </div>

      {/* Estado vacío */}
      {!hayCostes && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Calculator className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-gray-700 font-semibold">Sin registros de coste este mes</p>
            <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
              Los costes se registran automáticamente cada vez que se usa Claude, RAG o FLUX.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Tabla de costes por contenido ──────────────────────────────────── */}
      {hayCostes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Costes por contenido
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.tablaContenidos.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Sin contenidos con costes en este período.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                          Contenido
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">
                          Cliente › Proyecto
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">
                          Fecha
                        </th>
                        <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                          Texto
                        </th>
                        <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                          Imágenes
                        </th>
                        <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                          Total
                        </th>
                        <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.tablaContenidos.map((fila) => (
                        <tr key={fila.contenido_id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900 truncate max-w-[220px]">
                              {fila.titulo}
                            </p>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <p className="text-xs text-gray-500 truncate max-w-[180px]">
                              {fila.cliente_nombre} › {fila.proyecto_nombre}
                            </p>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <p className="text-xs text-gray-400">
                              {fila.fecha ? formatearFecha(fila.fecha) : '—'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs font-mono text-gray-700">
                              {fmtUSD(fila.coste_texto)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right hidden sm:table-cell">
                            <span className="text-xs font-mono text-gray-700">
                              {fmtUSD(fila.coste_imagenes)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs font-mono font-bold text-gray-900">
                              {fmtUSD(fila.coste_total)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center hidden sm:table-cell">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colorEstadoContenido(fila.estado as EstadoContenido)}`}>
                              {etiquetaEstadoContenido(fila.estado as EstadoContenido)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginación */}
                {data.totalPaginas > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      Página {data.pagina} de {data.totalPaginas}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={data.pagina <= 1}
                        onClick={() => navegar({ pagina: String(data.pagina - 1) })}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={data.pagina >= data.totalPaginas}
                        onClick={() => navegar({ pagina: String(data.pagina + 1) })}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Fila inferior: Gráfico + Desglose ──────────────────────────────── */}
      {hayCostes && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Gráfico de costes por cliente */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Coste por cliente</CardTitle>
            </CardHeader>
            <CardContent>
              {data.costesPorCliente.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Sin datos</p>
              ) : (
                <div className="space-y-3">
                  {data.costesPorCliente.map((item, i) => (
                    <BarraHorizontal
                      key={item.cliente_id}
                      label={item.nombre}
                      valor={item.coste_total}
                      maximo={maxCosteCliente}
                      indice={i}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Desglose por tipo de operación */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Desglose por operación</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.desglosePorTipo.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Sin datos</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                        Operación
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                        Llamadas
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                        Coste
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.desglosePorTipo.map((item) => (
                      <tr key={item.tipo} className="hover:bg-gray-50/60">
                        <td className="px-4 py-2.5">
                          <p className="text-xs font-medium text-gray-800">{item.label}</p>
                          {item.tokens > 0 && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {item.tokens.toLocaleString('es-ES')} tokens
                            </p>
                          )}
                          {item.tipo === 'imagen_flux' || item.tipo === 'ad_creative' ? (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {item.unidades} imágen{item.unidades !== 1 ? 'es' : ''}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-xs text-gray-600">
                            {item.llamadas}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-xs font-mono font-semibold text-gray-900">
                            {fmtUSD(item.coste_total)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-4 py-2.5 text-xs font-bold text-gray-700">Total</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-600">
                        {data.desglosePorTipo.reduce((s, r) => s + r.llamadas, 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-mono font-bold text-gray-900">
                        {fmtUSD(data.totalMes)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Nota de precios */}
      <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
        <span className="shrink-0 mt-0.5">ℹ️</span>
        <p>
          Precios de referencia: Claude Sonnet $3/M tokens entrada · $15/M salida ·
          OpenAI Embeddings $0.02/M tokens · FLUX Pro Ultra ~$0.06/imagen.
          Los costes son estimaciones. Consulta las facturas reales de cada proveedor para totales exactos.
        </p>
      </div>

    </div>
  )
}
