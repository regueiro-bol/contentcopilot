import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  atributosDominantes: string[];
  atributosAusentes: string[];
  narrativa: string;
}

export function NarrativaPanel({ atributosDominantes, atributosAusentes, narrativa }: Props) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Narrativa de marca en LLMs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {narrativa && (
          <p className="text-sm text-gray-600 italic leading-relaxed border-l-2 border-violet-200 pl-3">
            {narrativa}
          </p>
        )}

        {atributosDominantes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">
              Atributos presentes
            </p>
            <div className="flex flex-wrap gap-2">
              {atributosDominantes.map(attr => (
                <span
                  key={attr}
                  className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full"
                >
                  {attr}
                </span>
              ))}
            </div>
          </div>
        )}

        {atributosAusentes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-2">
              Atributos ausentes (oportunidades)
            </p>
            <div className="flex flex-wrap gap-2">
              {atributosAusentes.map(attr => (
                <span
                  key={attr}
                  className="text-xs bg-red-50 text-red-600 px-2.5 py-1 rounded-full"
                >
                  {attr}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
