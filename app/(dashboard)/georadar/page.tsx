import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Radio } from 'lucide-react';

export default async function GeoRadarPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const supabase = await createClient();

  const { data: configs } = await supabase
    .from('georadar_configs')
    .select(`
      *,
      clientes(id, nombre, slug, sector),
      georadar_scans(
        id, periodo, estado, completado_at,
        georadar_informes(score_global, score_anterior)
      )
    `)
    .eq('activo', true)
    .order('created_at');

  const clientesConRadar = (configs || []).map(config => {
    const ultimoScan = (config.georadar_scans || [])
      .filter((s: any) => s.estado === 'completado')
      .sort((a: any, b: any) =>
        new Date(b.completado_at).getTime() - new Date(a.completado_at).getTime()
      )[0];

    const informe = ultimoScan?.georadar_informes?.[0];
    const evolucion = informe
      ? informe.score_global - (informe.score_anterior || informe.score_global)
      : null;

    return {
      ...config.clientes,
      config,
      score: informe?.score_global ?? null,
      evolucion,
      ultimoPeriodo: ultimoScan?.periodo || null,
    };
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-lg">
            <Radio className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">GEORadar</h1>
            <p className="text-sm text-gray-500">
              Monitor de presencia de marca en LLMs
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/georadar/nuevo">
            Añadir cliente
          </Link>
        </Button>
      </div>

      {clientesConRadar.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Radio className="h-10 w-10 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-1">Ningún cliente tiene GEORadar configurado</p>
            <p className="text-sm text-gray-400">Añade un cliente para empezar a monitorizar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientesConRadar.map(cliente => (
            <Link key={cliente.id} href={`/georadar/${cliente.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base font-medium">
                      {cliente.nombre}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs capitalize">
                      {cliente.config.tier}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400">{cliente.sector}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-3 mb-3">
                    <div>
                      <p className="text-3xl font-bold text-gray-900">
                        {cliente.score !== null ? cliente.score : '—'}
                      </p>
                      <p className="text-xs text-gray-400">Score GEO</p>
                    </div>
                    {cliente.evolucion !== null && cliente.evolucion !== 0 && (
                      <div className={`flex items-center gap-1 text-sm mb-1 ${
                        cliente.evolucion > 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {cliente.evolucion > 0
                          ? <TrendingUp className="h-4 w-4" />
                          : <TrendingDown className="h-4 w-4" />
                        }
                        {cliente.evolucion > 0 ? '+' : ''}{cliente.evolucion}
                      </div>
                    )}
                    {cliente.evolucion === 0 && (
                      <div className="flex items-center gap-1 text-sm mb-1 text-gray-400">
                        <Minus className="h-4 w-4" />
                        0
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1 flex-wrap mb-2">
                    {cliente.config.llms_activos.map((llm: string) => (
                      <Badge key={llm} variant="secondary" className="text-xs">
                        {llm}
                      </Badge>
                    ))}
                  </div>

                  {cliente.ultimoPeriodo && (
                    <p className="text-xs text-gray-400">
                      Último scan: {cliente.ultimoPeriodo}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
