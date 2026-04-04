import { GoogleGenerativeAI } from '@google/generative-ai';

const COST_IN = 1.25 / 1_000_000;
const COST_OUT = 5 / 1_000_000;

export async function geminiAdapter(query: string) {
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY no configurada');
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const result = await model.generateContent(query);
  const text = result.response.text();
  const usage = result.response.usageMetadata;

  const tokensIn = usage?.promptTokenCount || 0;
  const tokensOut = usage?.candidatesTokenCount || 0;

  return {
    respuesta_raw: text,
    tokens_entrada: tokensIn,
    tokens_salida: tokensOut,
    coste_usd: tokensIn * COST_IN + tokensOut * COST_OUT,
  };
}
