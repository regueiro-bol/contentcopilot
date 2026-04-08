import Anthropic from '@anthropic-ai/sdk';
import type { AnalisisPresencia } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeResponse(
  respuestaLLM: string,
  clienteNombre: string,
  competidores: Array<{ nombre: string; aliases: string[] }>,
  queryOriginal: string
): Promise<AnalisisPresencia> {

  const competidoresStr = competidores
    .map(c => `- ${c.nombre} (también puede aparecer como: ${c.aliases.join(', ')})`)
    .join('\n');

  const prompt = `Analiza la siguiente respuesta de un LLM y extrae información estructurada.

MARCA A ANALIZAR: "${clienteNombre}"
QUERY ORIGINAL: "${queryOriginal}"
COMPETIDORES A DETECTAR:
${competidoresStr}

RESPUESTA DEL LLM:
---
${respuestaLLM}
---

Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta:
{
  "marca_mencionada": boolean,
  "posicion_primera_mencion": number_or_null,
  "numero_menciones": number,
  "sentimiento": "positivo" | "neutro" | "negativo" | "no_mencionado",
  "atributos_asociados": string[],
  "competidores_mencionados": [
    {"nombre": string, "menciones": number, "sentimiento": "positivo"|"neutro"|"negativo"}
  ],
  "fuentes_citadas": string[]
}

"fuentes_citadas": array de URLs o dominios reales citados en el texto (ejemplo: wikipedia.org, boe.es).
Si el texto usa referencias numéricas como [1], [2] en lugar de URLs, devuelve array vacío [].

No incluyas explicaciones ni markdown. Solo JSON.`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

  try {
    const parsed = JSON.parse(text.trim());
    return { ...parsed, score: 0 };
  } catch {
    return {
      marca_mencionada: false,
      posicion_primera_mencion: null,
      numero_menciones: 0,
      sentimiento: 'no_mencionado',
      atributos_asociados: [],
      competidores_mencionados: [],
      fuentes_citadas: [],
      score: 0,
    };
  }
}
