'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { useState } from 'react';

const URGENCIA_STYLES: Record<string, string> = {
  alta: 'bg-red-50 border-red-200',
  media: 'bg-amber-50 border-amber-200',
  baja: 'bg-gray-50 border-gray-200',
};

const URGENCIA_TEXT: Record<string, string> = {
  alta: 'text-red-700',
  media: 'text-amber-700',
  baja: 'text-gray-600',
};

interface Recomendacion {
  gap: string;
  accion: string;
  tipo_contenido: string;
  urgencia: 'alta' | 'media' | 'baja';
  queries_afectadas: string[];
}

interface Props {
  recomendaciones: Recomendacion[];
  clienteId: string;
}

export function RecomendacionesPanel({ recomendaciones, clienteId }: Props) {
  const [creando, setCreando] = useState<number | null>(null);
  const [creados, setCreados] = useState<Record<number, boolean>>({});

  async function crearContenido(rec: Recomendacion, i: number) {
    setCreando(i);
    await fetch(`/api/georadar/${clienteId}/crear-contenido`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gap: rec.gap,
        accion: rec.accion,
        tipo_contenido: rec.tipo_contenido,
        urgencia: rec.urgencia,
      }),
    });
    setCreados(prev => ({ ...prev, [i]: true }));
    setCreando(null);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Recomendaciones de contenido
          </CardTitle>
          <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
            → pipeline ContentCopilot
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {recomendaciones.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Sin recomendaciones</p>
        )}
        {recomendaciones.map((rec, i) => (
          <div
            key={i}
            className={`border rounded-lg p-3.5 ${URGENCIA_STYLES[rec.urgencia]}`}
          >
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className={`text-xs font-medium uppercase tracking-wide ${URGENCIA_TEXT[rec.urgencia]}`}>
                Urgencia {rec.urgencia} · {rec.tipo_contenido}
              </div>
              {creados[i] ? (
                <Button size="sm" variant="outline" disabled className="text-xs h-6 px-2 text-green-600 border-green-200">
                  <Check className="h-3 w-3 mr-1" />
                  Creado
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-6 px-2 shrink-0"
                  onClick={() => crearContenido(rec, i)}
                  disabled={creando === i}
                >
                  {creando === i
                    ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    : <ArrowRight className="h-3 w-3 mr-1" />
                  }
                  Crear contenido
                </Button>
              )}
            </div>
            <p className={`text-xs leading-relaxed mb-1 ${URGENCIA_TEXT[rec.urgencia]}`}>{rec.gap}</p>
            <p className={`text-xs opacity-75 ${URGENCIA_TEXT[rec.urgencia]}`}>{rec.accion}</p>
            {rec.queries_afectadas?.length > 0 && (
              <p className={`text-xs opacity-60 mt-1.5 ${URGENCIA_TEXT[rec.urgencia]}`}>
                Queries: {rec.queries_afectadas.join(' · ')}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
