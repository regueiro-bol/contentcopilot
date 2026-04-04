import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  score: number;
  scoreAnterior: number | null;
  evolucion: number;
  periodo: string;
}

export function PresenceScoreCard({ score, scoreAnterior, evolucion, periodo }: Props) {
  const circumference = 2 * Math.PI * 50;
  const offset = circumference - (score / 100) * circumference;

  return (
    <Card>
      <CardContent className="py-6 flex flex-col items-center text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">
          Score GEO global · {periodo}
        </p>
        <div className="relative w-32 h-32 mb-4">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r="50" fill="none" stroke="#ede9fe" strokeWidth="10" />
            <circle
              cx="60" cy="60" r="50"
              fill="none"
              stroke="#7c3aed"
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-violet-700">{score}</span>
            <span className="text-xs text-gray-400">/100</span>
          </div>
        </div>

        {evolucion !== 0 ? (
          <div className={`flex items-center gap-1 text-sm font-medium ${
            evolucion > 0 ? 'text-green-600' : 'text-red-500'
          }`}>
            {evolucion > 0
              ? <TrendingUp className="h-4 w-4" />
              : <TrendingDown className="h-4 w-4" />
            }
            {evolucion > 0 ? '+' : ''}{evolucion} vs periodo anterior
          </div>
        ) : (
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <Minus className="h-4 w-4" />
            Sin variación
          </div>
        )}

        {scoreAnterior !== null && (
          <p className="text-xs text-gray-400 mt-1">
            Anterior: {scoreAnterior}/100
          </p>
        )}
      </CardContent>
    </Card>
  );
}
