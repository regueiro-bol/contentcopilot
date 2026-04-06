const COST_IN = 1 / 1_000_000;
const COST_OUT = 5 / 1_000_000;
const COST_PER_REQUEST = 0.005;

export async function perplexityAdapter(query: string) {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY no configurada');
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        max_tokens: 1500,
        messages: [{ role: 'user', content: query }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Perplexity HTTP ${response.status}: ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const tokensIn = data.usage?.prompt_tokens || 0;
    const tokensOut = data.usage?.completion_tokens || 0;

    console.log(`[GEORadar Perplexity] Query: ${query.substring(0, 60)} | Respuesta: ${text.length} chars`);

    return {
      respuesta_raw: text,
      tokens_entrada: tokensIn,
      tokens_salida: tokensOut,
      coste_usd: tokensIn * COST_IN + tokensOut * COST_OUT + COST_PER_REQUEST,
    };
  } catch (err) {
    console.error(`[GEORadar Perplexity] ERROR query "${query.substring(0, 60)}":`, err instanceof Error ? err.message : err);
    throw err;
  }
}
