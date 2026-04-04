import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  posicionCompetitiva: {
    lidera: Array<{ query: string; score: number }>;
    pierde: Array<{ query: string; score: number; lider: string }>;
  };
}

export function CompetitorMatrix({ posicionCompetitiva }: Props) {
  const { lidera, pierde } = posicionCompetitiva;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Análisis competitivo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lidera.length > 0 && (
          <div>
            <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">
              Queries donde lideramos
            </p>
            <div className="space-y-1.5">
              {lidera.map((q, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600 truncate">{q.query}</span>
                  <span className="text-xs font-semibold text-green-600 shrink-0">{q.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {pierde.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-2">
              Queries donde perdemos
            </p>
            <div className="space-y-1.5">
              {pierde.map((q, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs text-gray-600 truncate">{q.query}</span>
                    {q.lider && (
                      <span className="text-xs text-gray-400">lidera: {q.lider}</span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-red-500 shrink-0">{q.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {lidera.length === 0 && pierde.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Sin datos competitivos</p>
        )}
      </CardContent>
    </Card>
  );
}
