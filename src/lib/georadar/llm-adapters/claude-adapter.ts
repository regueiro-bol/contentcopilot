import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const COST_IN = 3 / 1_000_000;
const COST_OUT = 15 / 1_000_000;

export async function claudeAdapter(query: string) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: query }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const tokensIn = response.usage.input_tokens;
  const tokensOut = response.usage.output_tokens;

  return {
    respuesta_raw: text,
    tokens_entrada: tokensIn,
    tokens_salida: tokensOut,
    coste_usd: tokensIn * COST_IN + tokensOut * COST_OUT,
  };
}
