import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import Link from 'next/link';
import { ScanLauncher } from '@/components/georadar/ScanLauncher';
import { PresenceScoreCard } from '@/components/georadar/PresenceScoreCard';
import { LLMBreakdownChart } from '@/components/georadar/LLMBreakdownChart';
import { NarrativaPanel } from '@/components/georadar/NarrativaPanel';
import { CompetitorMatrix } from '@/components/georadar/CompetitorMatrix';
import { FuentesPanel } from '@/components/georadar/FuentesPanel';
import { RecomendacionesPanel } from '@/components/georadar/RecomendacionesPanel';
import { Radio } from 'lucide-react';

export default async function GeoRadarClientePage({
  params,
}: {
  params: { clienteId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const supabase = await createClient();

  const { data: cliente } = await supabase
    .from('clientes')
    .select('nombre')
    .eq('id', params.clienteId)
    .single();

  const { data: informes } = await supabase
    .from('georadar_informes')
    .select('*')
    .eq('cliente_id', params.clienteId)
    .order('generado_at', { ascending: false })
    .limit(1);

  const informe = informes?.[0];

  const { data: scanActivo } = await supabase
    .from('georadar_scans')
    .select('*')
    .eq('cliente_id', params.clienteId)
    .eq('estado', 'ejecutando')
    .maybeSingle();

  const evolucion = informe && informe.score_anterior !== null
    ? informe.score_global - informe.score_anterior
    : 0;

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
            {informe && (
              <p className="text-sm text-gray-500">Informe {informe.periodo}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/georadar/${params.clienteId}/config`}>
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

      {!informe && !scanActivo && (
        <div className="text-center py-20 text-gray-400">
          <Radio className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-base mb-1">Sin datos todavía</p>
          <p className="text-sm">Configura las queries y lanza el primer scan</p>
        </div>
      )}

      {informe && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PresenceScoreCard
              score={informe.score_global}
              scoreAnterior={informe.score_anterior}
              evolucion={evolucion}
              periodo={informe.periodo}
            />
            <div className="lg:col-span-2">
              <LLMBreakdownChart scoresPorLLM={informe.scores_por_llm} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <NarrativaPanel
              atributosDominantes={informe.atributos_dominantes}
              atributosAusentes={informe.atributos_ausentes}
              narrativa={informe.narrativa_resumen}
            />
            <CompetitorMatrix
              posicionCompetitiva={informe.posicion_competitiva}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <FuentesPanel topFuentes={informe.top_fuentes} />
            <div className="lg:col-span-2">
              <RecomendacionesPanel
                recomendaciones={informe.recomendaciones}
                clienteId={params.clienteId}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
