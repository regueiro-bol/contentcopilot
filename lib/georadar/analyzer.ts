import Anthropic from '@anthropic-ai/sdk';
import type { AnalisisPresencia } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODELOS = [process.env.GEORADAR_ANALYZER_MODEL || 'claude-sonnet-5-5', 'claude-opus-4-5'];

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
Cuenta como mención cualquier variante razonable del nombre: con o sin "&"/"y", mayúsculas o tildes distintas, una parte reconocible del nombre comercial o su dominio web.
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

  // Se prueba el modelo actual y, si no está disponible, el anterior.
  let text = '{}';
  let ultimoError: unknown;
  let respondio = false;
  for (const model of MODELOS) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });
      const bloque = response.content.find((b) => b.type === 'text');
      text = bloque && bloque.type === 'text' ? bloque.text : '{}';
      respondio = true;
      break;
    } catch (e) {
      ultimoError = e;
    }
  }
  if (!respondio) throw ultimoError;

  // El modelo suele envolver el JSON en ```json ... ``` o añadir una frase.
  // Antes se hacía JSON.parse del texto tal cual: fallaba en silencio y TODOS
  // los resultados se guardaban como "marca no mencionada" con score 0.
  const inicio = text.indexOf('{');
  const fin = text.lastIndexOf('}');

  try {
    if (inicio === -1 || fin <= inicio) throw new Error('sin JSON');
    const parsed = JSON.parse(text.slice(inicio, fin + 1));
    return {
      marca_mencionada: parsed.marca_mencionada === true,
      posicion_primera_mencion: typeof parsed.posicion_primera_mencion === 'number' ? parsed.posicion_primera_mencion : null,
      numero_menciones: Number(parsed.numero_menciones) || 0,
      sentimiento: parsed.sentimiento || 'no_mencionado',
      atributos_asociados: Array.isArray(parsed.atributos_asociados) ? parsed.atributos_asociados : [],
      competidores_mencionados: Array.isArray(parsed.competidores_mencionados) ? parsed.competidores_mencionados : [],
      fuentes_citadas: Array.isArray(parsed.fuentes_citadas) ? parsed.fuentes_citadas : [],
      score: 0,
    };
  } catch {
    // No se puede analizar: se lanza para que el scan NO guarde un falso
    // "no mencionada". scan-engine registra el error y sigue con el resto.
    throw new Error(`[GEORadar analyzer] Respuesta no interpretable: ${text.substring(0, 200)}`);
  }
}
