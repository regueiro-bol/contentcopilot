'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Loader2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  clienteId: string;
  clienteNombre: string;
  keywords: string[];
  competidores: string[];
  llms: string[];
  scanActivo: {
    id: string;
    estado: string;
    queries_completadas?: number | null;
    total_queries?: number | null;
  } | null;
}

const LLM_LABEL: Record<string, string> = {
  claude: 'Claude',
  gpt4: 'GPT-4',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

export function ScanStatusZone({
  clienteId,
  clienteNombre,
  keywords,
  competidores,
  llms,
  scanActivo: scanActivoInicial,
}: Props) {
  const router = useRouter();
  const [scan, setScan] = useState(scanActivoInicial);
  const [lanzando, setLanzando] = useState(false);

  const queriesTotales = keywords.length * llms.length;
  const costeEst = queriesTotales * 0.002;
  const estaActivo = scan && (scan.estado === 'ejecutando' || scan.estado === 'pendiente');

  useEffect(() => {
    if (!estaActivo || !scan) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/georadar/scan?scanId=${scan.id}`);
        const data = await res.json();
        setScan({
          id: scan.id,
          estado: data.estado ?? scan.estado,
          queries_completadas: data.queries_completadas ?? 0,
          total_queries: data.total_queries ?? 0,
        });
        if (data.estado === 'completado' || data.estado === 'error') {
          clearInterval(interval);
          if (data.estado === 'completado') {
            setTimeout(() => router.refresh(), 1500);
          }
        }
      } catch {
        /* ignorar */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [estaActivo, scan, router]);

  async function lanzarScan() {
    setLanzando(true);
    try {
      const periodo = new Date().toISOString().slice(0, 7);
      const res = await fetch('/api/georadar/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, periodo }),
      });
      const data = await res.json();
      if (data.scan_id) {
        setScan({
          id: data.scan_id,
          estado: 'ejecutando',
          queries_completadas: 0,
          total_queries: data.queries || queriesTotales,
        });
        fetch('/api/georadar/scan/ejecutar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanId: data.scan_id }),
        }).catch(console.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLanzando(false);
    }
  }

  const completadas = scan?.queries_completadas ?? 0;
  const total = scan?.total_queries || queriesTotales || 1;
  const pct = Math.min(100, Math.round((completadas / total) * 100));

  return (
    <Card className="border-violet-200 bg-violet-50/40">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold text-gray-900">{clienteNombre}</p>
              {estaActivo && (
                <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Scan en curso
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <span className="text-gray-500">Keywords ({keywords.length})</span>
              <span className="text-gray-800 truncate">
                {keywords.length > 0
                  ? keywords.slice(0, 3).join(', ') + (keywords.length > 3 ? '...' : '')
                  : '—'}
              </span>

              <span className="text-gray-500">Competidores ({competidores.length})</span>
              <span className={competidores.length === 0 ? 'text-amber-700' : 'text-gray-800 truncate'}>
                {competidores.length > 0
                  ? competidores.slice(0, 3).join(', ') + (competidores.length > 3 ? '...' : '')
                  : 'Sin competidores — el análisis no podrá comparar presencia'}
              </span>

              <span className="text-gray-500">LLMs activos</span>
              <span className="text-gray-800">
                {llms.map((l) => LLM_LABEL[l] ?? l).join(', ') || '—'}
              </span>

              <span className="text-gray-500">Queries totales</span>
              <span className="text-gray-800 font-medium">
                {queriesTotales}{' '}
                <span className="font-normal text-gray-400">({keywords.length} × {llms.length} LLMs)</span>
              </span>

              <span className="text-gray-500">Coste estimado</span>
              <span className="text-gray-800 font-medium">~${costeEst.toFixed(2)}</span>
            </div>

            {competidores.length === 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Sin competidores configurados
              </div>
            )}
          </div>

          <div className="shrink-0">
            {!estaActivo && (
              <Button
                onClick={lanzarScan}
                disabled={lanzando || keywords.length === 0}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {lanzando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Lanzar scan
              </Button>
            )}
          </div>
        </div>

        {estaActivo && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 font-medium">
                {completadas}/{total} queries completadas
              </span>
              <span className="text-gray-500">{pct}%</span>
            </div>
            <div className="w-full h-2 bg-violet-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-600 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
