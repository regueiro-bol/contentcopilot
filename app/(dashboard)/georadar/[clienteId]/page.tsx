import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
import { Settings, Radio } from 'lucide-react';
import Link from 'next/link';
import { ScanLauncher } from '@/components/georadar/ScanLauncher';
import { PresenceScoreCard } from '@/components/georadar/PresenceScoreCard';
import { LLMBreakdownChart } from '@/components/georadar/LLMBreakdownChart';
import { NarrativaPanel } from '@/components/georadar/NarrativaPanel';
import { CompetitorMatrix } from '@/components/georadar/CompetitorMatrix';
import { FuentesPanel } from '@/components/georadar/FuentesPanel';
import { RecomendacionesPanel } from '@/components/georadar/RecomendacionesPanel';

export const dynamic = 'force-dynamic';

export default async function GeoRadarClientePage({
  params,
}: {
  params: { clienteId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const supabase = createAdminClient();

  const { data: cliente } = await supabase
    .from('clientes')
    .select('nombre')
    .eq('id', params.clienteId)
    .single();

  // Cargar último scan completado directamente de georadar_scans
  const { data: ultimoScan } = await supabase
    .from('georadar_scans')
    .select('*')
    .eq('cliente_id', params.clienteId)
    .eq('estado', 'completado')
    .order('fecha_scan', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log('[GEORadar Page] ultimoScan:', JSON.stringify(ultimoScan)?.slice(0, 300));

  const { data: scanActivo } = await supabase
    .from('georadar_scans')
    .select('*')
    .eq('cliente_id', params.clienteId)
    .eq('estado', 'ejecutando')
    .maybeSingle();

  const score = ultimoScan?.score_global ? Number(ultimoScan.score_global) : null;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-lg">
            <Radio className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {cliente?.nombre || 'GEORadar'}
            </h1>
            {ultimoScan && (
              <p className="text-sm text-gray-500">
                Último scan: {new Date(ultimoScan.fecha_scan).toLocaleDateString('es-ES')}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/georadar/${params.clienteId}/configurar`}>
              <Settings className="h-4 w-4 mr-2" />
              Configurar
            </Link>
          </Button>
          <ScanLauncher
            clienteId={params.clienteId}
            scanActivo={scanActivo}
          />
        </div>
      </div>

      {!ultimoScan && !scanActivo && (
        <div className="text-center py-20 text-gray-400">
          <Radio className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-base mb-1">Sin datos todavía</p>
          <p className="text-sm">Configura las queries y lanza el primer scan</p>
        </div>
      )}

      {ultimoScan && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PresenceScoreCard
              score={score}
              scoreAnterior={null}
              evolucion={0}
              periodo={new Date(ultimoScan.fecha_scan).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            />
            <div className="lg:col-span-2">
              <LLMBreakdownChart scoresPorLLM={ultimoScan.scores_por_llm ?? {}} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <NarrativaPanel
              atributosDominantes={ultimoScan.atributos_dominantes ?? []}
              atributosAusentes={ultimoScan.atributos_ausentes ?? []}
              narrativa={ultimoScan.narrativa_resumen ?? ''}
            />
            <CompetitorMatrix
              posicionCompetitiva={ultimoScan.posicion_competitiva ?? { lidera: [], pierde: [] }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <FuentesPanel topFuentes={ultimoScan.top_fuentes ?? []} />
            <div className="lg:col-span-2">
              <RecomendacionesPanel
                recomendaciones={ultimoScan.recomendaciones ?? []}
                clienteId={params.clienteId}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
