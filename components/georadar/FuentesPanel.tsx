import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  topFuentes: Array<{ url: string; frecuencia: number }>;
}

export function FuentesPanel({ topFuentes }: Props) {
  const max = topFuentes[0]?.frecuencia || 1;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Fuentes usadas por los LLMs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {topFuentes.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Sin fuentes detectadas</p>
        )}
        {topFuentes.map((fuente, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 truncate flex-1">{fuente.url}</span>
            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
              <div
                className="h-full bg-violet-400 rounded-full"
                style={{ width: `${(fuente.frecuencia / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-6 text-right shrink-0">
              {fuente.frecuencia}x
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
