import { GoogleGenerativeAI } from '@google/generative-ai';

const COST_IN = 1.25 / 1_000_000;
const COST_OUT = 5 / 1_000_000;

export async function geminiAdapter(query: string) {
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY no configurada');
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  const models = ['gemini-1.5-flash', 'gemini-pro'];

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(query);
      const text = result.response.text();
      const usage = result.response.usageMetadata;

      const tokensIn = usage?.promptTokenCount || 0;
      const tokensOut = usage?.candidatesTokenCount || 0;

      console.log(`[GEORadar Gemini] ${modelName} | Query: ${query.substring(0, 60)} | Respuesta: ${text.length} chars`);

      return {
        respuesta_raw: text,
        tokens_entrada: tokensIn,
        tokens_salida: tokensOut,
        coste_usd: tokensIn * COST_IN + tokensOut * COST_OUT,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is404 = msg.includes('404') || msg.includes('not found') || msg.includes('not available');
      console.warn(`[GEORadar Gemini] ${modelName} fallo: ${msg.substring(0, 100)}`);
      if (!is404 || modelName === models[models.length - 1]) {
        console.error(`[GEORadar Gemini] ERROR definitivo query "${query.substring(0, 60)}":`, msg);
        throw err;
      }
      console.log(`[GEORadar Gemini] Intentando fallback...`);
    }
  }

  throw new Error('Gemini: ningun modelo disponible (gemini-1.5-flash, gemini-pro)');
}
