'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Resultado {
  llm: string;
  respuesta_completa: string;
  menciona_marca: boolean;
  score: number | null;
}

interface QueryGroup {
  query: string;
  categoria?: string | null;
  resultados: Resultado[];
}

interface Props {
  grupos: QueryGroup[];
}

const LLM_LABEL: Record<string, string> = {
  claude: 'Claude',
  gpt4: 'GPT-4',
  'gpt-4': 'GPT-4',
  openai: 'GPT-4',
  perplexity: 'Perplexity',
  gemini: 'Gemini',
};

function llmLabel(llm: string) {
  return LLM_LABEL[llm.toLowerCase()] ?? llm;
}

export function RespuestasPanel({ grupos }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (!grupos || grupos.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Respuestas de los LLMs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">Sin respuestas registradas para este scan.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Respuestas de los LLMs
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-gray-100">
          {grupos.map((grupo, i) => {
            const isOpen = openIdx === i;
            const menciones = grupo.resultados.filter(r => r.menciona_marca).length;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    )}
                    <span className="text-sm text-gray-800 truncate">{grupo.query}</span>
                  </div>
                  <span className="text-xs text-gray-500 shrink-0 ml-3">
                    {menciones}/{grupo.resultados.length} mencionan
                  </span>
                </button>
                {isOpen && <QueryDetail resultados={grupo.resultados} />}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function QueryDetail({ resultados }: { resultados: Resultado[] }) {
  const [activeLlm, setActiveLlm] = useState(resultados[0]?.llm ?? '');
  const active = resultados.find(r => r.llm === activeLlm) ?? resultados[0];
  if (!active) return null;

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-4 py-4">
      <div className="flex gap-1 mb-3 border-b border-gray-200">
        {resultados.map(r => {
          const isActive = r.llm === activeLlm;
          return (
            <button
              key={r.llm}
              type="button"
              onClick={() => setActiveLlm(r.llm)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-violet-500 text-violet-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {llmLabel(r.llm)}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            active.menciona_marca
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          {active.menciona_marca ? 'Menciona la marca' : 'No menciona'}
        </span>
        {active.score != null && (
          <span className="text-xs text-gray-500">
            Score: <span className="font-medium text-gray-700">{Number(active.score).toFixed(1)}</span>
          </span>
        )}
      </div>

      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-white border border-gray-200 rounded-md p-3 max-h-96 overflow-y-auto">
        {active.respuesta_completa || <span className="text-gray-400 italic">Sin respuesta</span>}
      </div>
    </div>
  );
}
