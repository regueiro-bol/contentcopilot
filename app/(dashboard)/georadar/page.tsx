import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Radio, Settings, BarChart2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function GeoRadarPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const supabase = createAdminClient();

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre, sector')
    .eq('activo', true)
    .order('nombre');

  const { data: configs } = await supabase
    .from('georadar_configs')
    .select('cliente_id, paquete, llms, frecuencia');

  const { data: scans } = await supabase
    .from('georadar_scans')
    .select('cliente_id, score_global, fecha_scan, estado')
    .eq('estado', 'completado')
    .order('fecha_scan', { ascending: false });

  const configMap = new Map((configs || []).map(c => [c.cliente_id, c]));

  const ultimoScanPorCliente = new Map<string, any>();
  for (const scan of (scans || [])) {
    if (!ultimoScanPorCliente.has(scan.cliente_id)) {
      ultimoScanPorCliente.set(scan.cliente_id, scan);
    }
  }

  const clientesConEstado = (clientes || []).map(cliente => ({
    ...cliente,
    config: configMap.get(cliente.id) || null,
    ultimoScan: ultimoScanPorCliente.get(cliente.id) || null,
  }));

  const configurados = clientesConEstado.filter(c => c.config);
  const sinConfigurar = clientesConEstado.filter(c => !c.config);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-violet-100 rounded-lg">
          <Radio className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">GEORadar</h1>
          <p className="text-sm text-gray-500">Monitor de presencia de marca en LLMs</p>
        </div>
      </div>

      {configurados.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Clientes monitorizados ({configurados.length})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {configurados.map(cliente => {
              const scan = cliente.ultimoScan;
              return (
                <Card key={cliente.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium text-gray-900">{cliente.nombre}</p>
                        <p className="text-xs text-gray-400">{cliente.sector}</p>
                      </div>
                      <Badge className="bg-violet-100 text-violet-700 border-0 text-xs">
                        Activo
                      </Badge>
                    </div>

                    <div className="flex items-end gap-2 mb-3">
                      <p className="text-3xl font-bold text-gray-900">
                        {scan ? Math.round(scan.score_global) : '—'}
                      </p>
                      {scan && (
                        <p className="text-xs text-gray-400 mb-1">/100</p>
                      )}
                    </div>

                    {scan && (
                      <p className="text-xs text-gray-400 mb-3">
                        Último scan: {new Date(scan.fecha_scan).toLocaleDateString('es-ES')}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 text-xs" asChild>
                        <Link href={`/georadar/${cliente.id}/configurar`}>
                          <Settings className="h-3 w-3 mr-1" />
                          Configurar
                        </Link>
                      </Button>
                      <Button size="sm" className="flex-1 text-xs bg-violet-600 hover:bg-violet-700" asChild>
                        <Link href={`/georadar/${cliente.id}`}>
                          <BarChart2 className="h-3 w-3 mr-1" />
                          Ver informe
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {sinConfigurar.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Sin configurar ({sinConfigurar.length})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sinConfigurar.map(cliente => (
              <Card key={cliente.id} className="border-dashed hover:border-violet-300 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-700">{cliente.nombre}</p>
                      <p className="text-xs text-gray-400">{cliente.sector}</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs" asChild>
                      <Link href={`/georadar/${cliente.id}/configurar`}>
                        Configurar
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
