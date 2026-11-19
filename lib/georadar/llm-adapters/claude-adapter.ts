import Anthropic from '@anthropic-ai/sdk';

const COST_IN = 3 / 1_000_000;
const COST_OUT = 15 / 1_000_000;
const MODELOS = [process.env.GEORADAR_CLAUDE_MODEL || 'claude-sonnet-5-5', 'claude-opus-4-5'];

export async function claudeAdapter(query: string) {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // claude-sonnet-4-20250514 fue retirado (la API devolvía 404 y Claude no
    // aportaba resultados al scan). Se prueba el modelo actual y, si no está
    // disponible, el que ya usa el analizador.
    let response: Anthropic.Message | null = null;
    let ultimoError: unknown;
    for (const model of MODELOS) {
      try {
        response = await anthropic.messages.create({
          model,
          max_tokens: 1500,
          messages: [{ role: 'user', content: query }],
        });
        break;
      } catch (e) {
        ultimoError = e;
      }
    }
    if (!response) throw ultimoError;

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;

    console.log(`[GEORadar Claude] Query: ${query.substring(0, 60)} | Respuesta: ${text.length} chars`);

    return {
      respuesta_raw: text,
      tokens_entrada: tokensIn,
      tokens_salida: tokensOut,
      coste_usd: tokensIn * COST_IN + tokensOut * COST_OUT,
    };
  } catch (err) {
    console.error(`[GEORadar Claude] ERROR query "${query.substring(0, 60)}":`, err instanceof Error ? err.message : err);
    throw err;
  }
}
