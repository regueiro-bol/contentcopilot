'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Loader2, XCircle } from 'lucide-react';

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
  const [cancelando, setCancelando] = useState(false);

  // Polling de progreso cada 3s mientras ejecutando
  useEffect(() => {
    if (!scanId || (estado !== 'ejecutando' && estado !== 'pendiente')) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/georadar/scan?scanId=${scanId}`);
        const data = await res.json();

        if (data.estado) setEstado(data.estado);
        setProgreso({
          completadas: data.queries_completadas ?? 0,
          total: data.total_queries ?? 0,
        });

        if (data.estado === 'completado' || data.estado === 'error') {
          clearInterval(interval);
          if (data.estado === 'completado') {
            setTimeout(() => window.location.reload(), 3000);
          }
        }
      } catch {
        // Ignorar errores de red en polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [scanId, estado]);

  async function lanzarScan() {
    const periodo = new Date().toISOString().slice(0, 7);

    // Paso 1: Crear scan (rapido — devuelve scan_id inmediatamente)
    const res = await fetch('/api/georadar/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId, periodo }),
    });

    const data = await res.json();
    if (!data.scan_id) return;

    setScanId(data.scan_id);
    setEstado('ejecutando');
    setProgreso({ completadas: 0, total: data.queries || 0 });

    // Paso 2: Disparar ejecucion sin await (fire-and-forget desde el cliente)
    // La funcion serverless tiene maxDuration=120 y ejecuta las queries
    // El polling del useEffect arriba muestra el progreso en tiempo real
    fetch('/api/georadar/scan/ejecutar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanId: data.scan_id }),
    }).catch(console.error);
  }

  async function handleCancelar() {
    if (!scanId) return;
    setCancelando(true);
    try {
      await fetch('/api/georadar/scan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId }),
      });
      setEstado('error');
    } catch {
      // ignore
    } finally {
      setCancelando(false);
    }
  }

  if (estado === 'ejecutando' || estado === 'pendiente') {
    return (
      <div className="flex items-center gap-3">
        <div className="text-sm text-gray-500">
          {progreso.completadas}/{progreso.total} queries
        </div>
        <Button disabled variant="outline" size="sm">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Escaneando...
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancelar}
          disabled={cancelando}
          className="text-red-600 border-red-200 hover:bg-red-50 px-2"
          title="Cancelar scan"
        >
          {cancelando
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <XCircle className="h-3.5 w-3.5" />}
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
