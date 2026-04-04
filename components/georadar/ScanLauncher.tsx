'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';

interface ScanLauncherProps {
  clienteId: string;
  scanActivo: any;
}

export function ScanLauncher({ clienteId, scanActivo }: ScanLauncherProps) {
  const [estado, setEstado] = useState<string>(scanActivo?.estado || 'idle');
  const [scanId, setScanId] = useState<string | null>(scanActivo?.id || null);
  const [progreso, setProgreso] = useState({
    completadas: scanActivo?.queries_completadas || 0,
    total: scanActivo?.total_queries || 0,
  });

  useEffect(() => {
    if (!scanId || estado !== 'ejecutando') return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/georadar/scan?scanId=${scanId}`);
      const data = await res.json();

      setEstado(data.estado);
      setProgreso({
        completadas: data.queries_completadas,
        total: data.total_queries,
      });

      if (data.estado === 'completado' || data.estado === 'error') {
        clearInterval(interval);
        if (data.estado === 'completado') {
          window.location.reload();
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [scanId, estado]);

  async function lanzarScan() {
    const periodo = new Date().toISOString().slice(0, 7);
    const res = await fetch('/api/georadar/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId, periodo }),
    });

    const data = await res.json();
    if (data.scan_id) {
      setScanId(data.scan_id);
      setEstado('ejecutando');
      setProgreso({ completadas: 0, total: data.queries || 0 });
    }
  }

  if (estado === 'ejecutando') {
    return (
      <div className="flex items-center gap-3">
        <div className="text-sm text-gray-500">
          {progreso.completadas}/{progreso.total} queries
        </div>
        <Button disabled variant="outline">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Escaneando...
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={lanzarScan}>
      <Play className="h-4 w-4 mr-2" />
      Lanzar scan
    </Button>
  );
}
