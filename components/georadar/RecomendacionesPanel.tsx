import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const URGENCIA_STYLES: Record<string, string> = {
  alta: 'bg-red-50 border-red-200 text-red-700',
  media: 'bg-amber-50 border-amber-200 text-amber-700',
  baja: 'bg-gray-50 border-gray-200 text-gray-600',
};

const URGENCIA_BADGE: Record<string, string> = {
  alta: 'destructive',
  media: 'warning',
  baja: 'secondary',
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
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Recomendaciones de contenido
          </CardTitle>
          <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
            → conectado al pipeline
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {recomendaciones.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Sin recomendaciones generadas</p>
        )}
        {recomendaciones.map((rec, i) => (
          <div
            key={i}
            className={`border rounded-lg p-3.5 ${URGENCIA_STYLES[rec.urgencia]}`}
          >
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide">
                  Urgencia {rec.urgencia}
                </span>
                <span className="text-xs opacity-70">· {rec.tipo_contenido}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-6 px-2 shrink-0"
                asChild
              >
                <a href={`/contenidos/nuevo?clienteId=${clienteId}&tipo=${rec.tipo_contenido}&gap=${encodeURIComponent(rec.gap)}`}>
                  Crear contenido
                  <ArrowRight className="h-3 w-3 ml-1" />
                </a>
              </Button>
            </div>
            <p className="text-xs leading-relaxed mb-1.5">{rec.gap}</p>
            <p className="text-xs opacity-75">{rec.accion}</p>
            {rec.queries_afectadas?.length > 0 && (
              <p className="text-xs opacity-60 mt-1.5">
                Queries: {rec.queries_afectadas.join(' · ')}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
