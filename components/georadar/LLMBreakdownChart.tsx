import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const LLM_COLORS: Record<string, string> = {
  claude: 'bg-violet-500',
  gpt4: 'bg-blue-500',
  gemini: 'bg-emerald-500',
  perplexity: 'bg-amber-500',
};

const LLM_LABELS: Record<string, string> = {
  claude: 'Claude',
  gpt4: 'GPT-4o',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

interface Props {
  scoresPorLLM: Record<string, number>;
}

export function LLMBreakdownChart({ scoresPorLLM }: Props) {
  const entries = Object.entries(scoresPorLLM).filter(([, v]) => v > 0);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Presencia por LLM
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.map(([llm, score]) => (
          <div key={llm} className="flex items-center gap-3">
            <div className="w-20 text-sm text-gray-600 shrink-0">
              {LLM_LABELS[llm] || llm}
            </div>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${LLM_COLORS[llm] || 'bg-gray-400'}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <div className="w-8 text-sm font-semibold text-right">{score}</div>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Sin datos</p>
        )}
      </CardContent>
    </Card>
  );
}
