import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const COST_IN = 2.50 / 1_000_000;
const COST_OUT = 10 / 1_000_000;

export async function gpt4Adapter(query: string) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1500,
    messages: [{ role: 'user', content: query }],
  });

  const text = response.choices[0].message.content || '';
  const tokensIn = response.usage?.prompt_tokens || 0;
  const tokensOut = response.usage?.completion_tokens || 0;

  return {
    respuesta_raw: text,
    tokens_entrada: tokensIn,
    tokens_salida: tokensOut,
    coste_usd: tokensIn * COST_IN + tokensOut * COST_OUT,
  };
}
