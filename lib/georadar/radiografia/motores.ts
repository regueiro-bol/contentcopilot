/**
 * Radiografía Express — conectores CON búsqueda web.
 *
 * Los adaptadores de lib/georadar/llm-adapters preguntan al modelo sin búsqueda:
 * sirven para marcas conocidas, pero una pyme local no está en la memoria del
 * modelo. Estos conectores activan la búsqueda de cada proveedor, que es lo que
 * usa la gente en las apps. Van aparte para no alterar el histórico de los
 * informes de clientes.
 *
 * Los modelos se pueden cambiar sin tocar código con variables de entorno:
 *   RADIOGRAFIA_OPENAI_MODEL, RADIOGRAFIA_GEMINI_MODEL, RADIOGRAFIA_PERPLEXITY_MODEL
 * Si el modelo principal falla se prueba uno de reserva.
 */

import type { Fuente, Motor, RespuestaMotor } from './types';

const TIMEOUT_MS = 90_000;

const OPENAI_MODELOS = [process.env.RADIOGRAFIA_OPENAI_MODEL || 'gpt-6.2-astra'];
const OPENAI_RESERVA_CHAT = 'gpt-5-search-api';
const GEMINI_MODELOS = [
  process.env.RADIOGRAFIA_GEMINI_MODEL || 'gemini-3.8-flash',
  'gemini-2.5-flash',
];
const PERPLEXITY_MODELOS = [process.env.RADIOGRAFIA_PERPLEXITY_MODEL || 'sonar-pro', 'sonar'];

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${txt.substring(0, 300)}`);
  }
  return res.json();
}

function dedupe(fuentes: Fuente[]): Fuente[] {
  const vistos = new Set<string>();
  return fuentes.filter((f) => {
    if (!f.url || vistos.has(f.url)) return false;
    vistos.add(f.url);
    return true;
  });
}

type Parcial = Pick<RespuestaMotor, 'modelo' | 'respuesta' | 'fuentes' | 'tokens_entrada' | 'tokens_salida'>;

// ─── ChatGPT ────────────────────────────────────────────────────────────────

async function chatgptResponses(pregunta: string, modelo: string): Promise<Parcial> {
  const data = await postJson(
    'https://api.openai.com/v1/responses',
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    { model: modelo, input: pregunta, tools: [{ type: 'web_search' }] },
  );

  let texto = '';
  const fuentes: Fuente[] = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const parte of item.content || []) {
      if (parte.type !== 'output_text') continue;
      texto += parte.text || '';
      for (const a of parte.annotations || []) {
        if (a.type === 'url_citation' && a.url) fuentes.push({ url: a.url, titulo: a.title });
      }
    }
  }
  return {
    modelo,
    respuesta: texto,
    fuentes: dedupe(fuentes),
    tokens_entrada: data.usage?.input_tokens || 0,
    tokens_salida: data.usage?.output_tokens || 0,
  };
}

async function chatgptChatSearch(pregunta: string): Promise<Parcial> {
  const data = await postJson(
    'https://api.openai.com/v1/chat/completions',
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    { model: OPENAI_RESERVA_CHAT, messages: [{ role: 'user', content: pregunta }] },
  );
  const msg = data.choices?.[0]?.message || {};
  const fuentes: Fuente[] = (msg.annotations || [])
    .filter((a: any) => a.type === 'url_citation' && a.url_citation?.url)
    .map((a: any) => ({ url: a.url_citation.url, titulo: a.url_citation.title }));
  return {
    modelo: OPENAI_RESERVA_CHAT,
    respuesta: msg.content || '',
    fuentes: dedupe(fuentes),
    tokens_entrada: data.usage?.prompt_tokens || 0,
    tokens_salida: data.usage?.completion_tokens || 0,
  };
}

async function chatgpt(pregunta: string): Promise<Parcial> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');
  let ultimo: unknown;
  for (const modelo of OPENAI_MODELOS) {
    try {
      return await chatgptResponses(pregunta, modelo);
    } catch (e) {
      ultimo = e;
    }
  }
  try {
    return await chatgptChatSearch(pregunta);
  } catch {
    throw ultimo;
  }
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

async function geminiCon(pregunta: string, modelo: string): Promise<Parcial> {
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    { 'x-goog-api-key': process.env.GOOGLE_AI_API_KEY as string },
    { contents: [{ role: 'user', parts: [{ text: pregunta }] }], tools: [{ google_search: {} }] },
  );
  const cand = data.candidates?.[0];
  const texto = (cand?.content?.parts || []).map((p: any) => p.text || '').join('');
  const fuentes: Fuente[] = (cand?.groundingMetadata?.groundingChunks || [])
    .filter((c: any) => c.web?.uri)
    // Gemini devuelve una URL de redirección; el dominio real viene en `title`.
    .map((c: any) => ({ url: c.web.uri, titulo: c.web.title }));
  return {
    modelo,
    respuesta: texto,
    fuentes: dedupe(fuentes),
    tokens_entrada: data.usageMetadata?.promptTokenCount || 0,
    tokens_salida: data.usageMetadata?.candidatesTokenCount || 0,
  };
}

async function gemini(pregunta: string): Promise<Parcial> {
  if (!process.env.GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY no configurada');
  let ultimo: unknown;
  for (const modelo of GEMINI_MODELOS) {
    try {
      return await geminiCon(pregunta, modelo);
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo;
}

// ─── Perplexity ─────────────────────────────────────────────────────────────

async function perplexityCon(pregunta: string, modelo: string): Promise<Parcial> {
  const data = await postJson(
    'https://api.perplexity.ai/chat/completions',
    { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
    { model: modelo, messages: [{ role: 'user', content: pregunta }] },
  );
  const fuentes: Fuente[] = Array.isArray(data.search_results) && data.search_results.length
    ? data.search_results.map((r: any) => ({ url: r.url, titulo: r.title }))
    : (data.citations || []).map((url: string) => ({ url }));
  return {
    modelo,
    respuesta: data.choices?.[0]?.message?.content || '',
    fuentes: dedupe(fuentes),
    tokens_entrada: data.usage?.prompt_tokens || 0,
    tokens_salida: data.usage?.completion_tokens || 0,
  };
}

async function perplexity(pregunta: string): Promise<Parcial> {
  if (!process.env.PERPLEXITY_API_KEY) throw new Error('PERPLEXITY_API_KEY no configurada');
  let ultimo: unknown;
  for (const modelo of PERPLEXITY_MODELOS) {
    try {
      return await perplexityCon(pregunta, modelo);
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo;
}

// ─── Entrada común ──────────────────────────────────────────────────────────

const CONECTORES: Record<Motor, (pregunta: string) => Promise<Parcial>> = {
  chatgpt,
  gemini,
  perplexity,
};

/** Pregunta a un motor con búsqueda web. Nunca lanza: devuelve `error` si falla. */
export async function preguntarMotor(motor: Motor, pregunta: string): Promise<RespuestaMotor> {
  const inicio = Date.now();
  try {
    const r = await CONECTORES[motor](pregunta);
    if (!r.respuesta.trim()) throw new Error('Respuesta vacía');
    return { motor, ...r, duracion_ms: Date.now() - inicio };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[Radiografía ${motor}] ERROR "${pregunta.substring(0, 60)}": ${msg}`);
    return {
      motor,
      modelo: '',
      respuesta: '',
      fuentes: [],
      tokens_entrada: 0,
      tokens_salida: 0,
      duracion_ms: Date.now() - inicio,
      error: msg.substring(0, 300),
    };
  }
}
