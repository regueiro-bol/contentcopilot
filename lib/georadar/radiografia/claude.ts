import Anthropic from '@anthropic-ai/sdk';

// El modelo principal se puede cambiar con RADIOGRAFIA_CLAUDE_MODEL.
// El de reserva es el que ya usa el resto de GEORadar.
const MODELOS = [process.env.RADIOGRAFIA_CLAUDE_MODEL || 'claude-sonnet-5-5', 'claude-sonnet-4-5'];

/** Llama a Claude y devuelve el JSON de la respuesta, o `null` si no se puede leer. */
export async function claudeJson<T>(prompt: string, maxTokens = 1200): Promise<T | null> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let ultimo: unknown;

  for (const model of MODELOS) {
    try {
      const res = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      const bloque = res.content.find((b) => b.type === 'text');
      const texto = bloque && bloque.type === 'text' ? bloque.text : '';
      const inicio = texto.indexOf('{');
      const fin = texto.lastIndexOf('}');
      if (inicio === -1 || fin <= inicio) return null;
      try {
        return JSON.parse(texto.slice(inicio, fin + 1)) as T;
      } catch {
        return null;
      }
    } catch (e) {
      ultimo = e;
    }
  }
  console.error('[Radiografía] Claude no disponible:', ultimo instanceof Error ? ultimo.message : ultimo);
  return null;
}
