import { GoogleGenerativeAI } from '@google/generative-ai';

const COST_IN = 1.25 / 1_000_000;
const COST_OUT = 5 / 1_000_000;

export async function geminiAdapter(query: string) {
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.warn('[GEORadar Gemini] GOOGLE_AI_API_KEY no configurada — omitiendo');
    return null;
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(query);
    const text = result.response.text();
    const usage = result.response.usageMetadata;

    const tokensIn = usage?.promptTokenCount || 0;
    const tokensOut = usage?.candidatesTokenCount || 0;

    console.log(`[GEORadar Gemini] gemini-2.0-flash | Query: ${query.substring(0, 60)} | Respuesta: ${text.length} chars`);

    return {
      respuesta_raw: text,
      tokens_entrada: tokensIn,
      tokens_salida: tokensOut,
      coste_usd: tokensIn * COST_IN + tokensOut * COST_OUT,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GEORadar Gemini] ERROR (desactivando para este scan): ${msg.substring(0, 150)}`);
    // Devolver null para que el scan continue sin Gemini
    return null;
  }
}
