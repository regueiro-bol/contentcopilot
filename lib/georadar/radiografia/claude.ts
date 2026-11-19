import Anthropic from '@anthropic-ai/sdk';
import { costeTokens, redondear } from './precios';

// Redacción (preguntas y diagnóstico): modelo principal, cambiable con
// RADIOGRAFIA_CLAUDE_MODEL. El de reserva es el que ya usa el resto de GEORadar.
export const MODELOS_REDACCION = [process.env.RADIOGRAFIA_CLAUDE_MODEL || 'claude-sonnet-5-5', 'claude-sonnet-4-5'];

// Análisis de cada respuesta: es una tarea sencilla de extracción, así que se
// usa el modelo económico (unas 20 veces más barato). Si no está disponible,
// se cae al de redacción.
export const MODELOS_ANALISIS = [
  process.env.RADIOGRAFIA_ANALISIS_MODEL || 'claude-haiku-5-5',
  ...MODELOS_REDACCION,
];

export interface RespuestaJson<T> {
  json: T | null;
  coste_usd: number;
  modelo: string;
}

/** Llama a Claude y devuelve el JSON de la respuesta (o null si no se puede leer) y su coste. */
export async function claudeJson<T>(
  prompt: string,
  maxTokens = 1200,
  modelos: string[] = MODELOS_REDACCION,
): Promise<RespuestaJson<T>> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let ultimo: unknown;

  for (const model of modelos) {
    try {
      const res = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      const coste_usd = redondear(costeTokens(model, res.usage?.input_tokens || 0, res.usage?.output_tokens || 0));
      const bloque = res.content.find((b) => b.type === 'text');
      const texto = bloque && bloque.type === 'text' ? bloque.text : '';
      const inicio = texto.indexOf('{');
      const fin = texto.lastIndexOf('}');
      if (inicio === -1 || fin <= inicio) return { json: null, coste_usd, modelo: model };
      try {
        return { json: JSON.parse(texto.slice(inicio, fin + 1)) as T, coste_usd, modelo: model };
      } catch {
        return { json: null, coste_usd, modelo: model };
      }
    } catch (e) {
      ultimo = e;
    }
  }
  console.error('[Radiografía] Claude no disponible:', ultimo instanceof Error ? ultimo.message : ultimo);
  return { json: null, coste_usd: 0, modelo: '' };
}
