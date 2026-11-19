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
 * Si el modelo principal falla se prueba uno de reserva. Los errores de límite
 * de peticiones (429) se reintentan con espera.
 */

import { CARGOS, costeTokens, redondear } from './precios';
import { SIN_RESUMEN_IA } from './types';
import type { Fuente, Motor, RespuestaMotor } from './types';

const TIMEOUT_MS = 90_000;

// Modelo de búsqueda por Chat Completions: es el que respondió en las pruebas reales.
const OPENAI_CHAT_SEARCH = process.env.RADIOGRAFIA_OPENAI_MODEL || 'gpt-5-search-api';
// Reserva opcional por Responses API + web_search (solo si se define la variable).
const OPENAI_RESPONSES = process.env.RADIOGRAFIA_OPENAI_RESPONSES_MODEL || '';
const GEMINI_MODELOS = [
  process.env.RADIOGRAFIA_GEMINI_MODEL || 'gemini-3.8-flash',
  'gemini-2.5-flash',
];
const PERPLEXITY_MODELOS = [process.env.RADIOGRAFIA_PERPLEXITY_MODEL || 'sonar-pro', 'sonar'];

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 429 (límite de peticiones) y 503 se reintentan con espera creciente: la
// radiografía lanza varias preguntas casi a la vez y Perplexity rechazaba parte.
const ESPERAS_REINTENTO_MS = [2500, 6000, 11000];

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  for (let intento = 0; ; intento++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return res.json();
    const txt = await res.text().catch(() => '');
    if ((res.status === 429 || res.status === 503) && intento < ESPERAS_REINTENTO_MS.length) {
      await esperar(ESPERAS_REINTENTO_MS[intento] + Math.random() * 1500);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${txt.substring(0, 300)}`);
  }
}

function dedupe(fuentes: Fuente[]): Fuente[] {
  const vistos = new Set<string>();
  return fuentes.filter((f) => {
    if (!f.url || vistos.has(f.url)) return false;
    vistos.add(f.url);
    return true;
  });
}

type Parcial = Pick<RespuestaMotor, 'modelo' | 'respuesta' | 'fuentes' | 'tokens_entrada' | 'tokens_salida' | 'coste_usd'>;

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
    coste_usd: costeTokens(modelo, data.usage?.input_tokens || 0, data.usage?.output_tokens || 0) + CARGOS.openai_busqueda,
  };
}

async function chatgptChatSearch(pregunta: string): Promise<Parcial> {
  const data = await postJson(
    'https://api.openai.com/v1/chat/completions',
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    { model: OPENAI_CHAT_SEARCH, messages: [{ role: 'user', content: pregunta }] },
  );
  const msg = data.choices?.[0]?.message || {};
  const fuentes: Fuente[] = (msg.annotations || [])
    .filter((a: any) => a.type === 'url_citation' && a.url_citation?.url)
    .map((a: any) => ({ url: a.url_citation.url, titulo: a.url_citation.title }));
  return {
    modelo: OPENAI_CHAT_SEARCH,
    respuesta: msg.content || '',
    fuentes: dedupe(fuentes),
    tokens_entrada: data.usage?.prompt_tokens || 0,
    tokens_salida: data.usage?.completion_tokens || 0,
    coste_usd:
      costeTokens(OPENAI_CHAT_SEARCH, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0) +
      CARGOS.openai_busqueda,
  };
}

async function chatgpt(pregunta: string): Promise<Parcial> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');
  try {
    return await chatgptChatSearch(pregunta);
  } catch (e) {
    if (!OPENAI_RESPONSES) throw e;
    return chatgptResponses(pregunta, OPENAI_RESPONSES);
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
    coste_usd:
      costeTokens(modelo, data.usageMetadata?.promptTokenCount || 0, data.usageMetadata?.candidatesTokenCount || 0) +
      (cand?.groundingMetadata?.webSearchQueries?.length || 1) * CARGOS.gemini_busqueda,
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
    // Perplexity suele devolver el coste real de la llamada; si no, se estima.
    coste_usd:
      typeof data.usage?.cost?.total_cost === 'number'
        ? data.usage.cost.total_cost
        : costeTokens(modelo, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0) +
          CARGOS.perplexity_peticion,
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

// ─── Claude ─────────────────────────────────────────────────────────────────

const CLAUDE_MODELOS = [process.env.RADIOGRAFIA_CLAUDE_SEARCH_MODEL || 'claude-sonnet-5-5', 'claude-sonnet-4-5'];

async function claudeCon(pregunta: string, modelo: string): Promise<Parcial> {
  const data = await postJson(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01' },
    {
      model: modelo,
      max_tokens: 2000,
      messages: [{ role: 'user', content: pregunta }],
      // Una sola búsqueda por pregunta: es lo que más encarece la consulta.
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
    },
  );
  let texto = '';
  const fuentes: Fuente[] = [];
  for (const bloque of data.content || []) {
    if (bloque.type === 'text') {
      texto += bloque.text || '';
      for (const c of bloque.citations || []) {
        if (c.url) fuentes.push({ url: c.url, titulo: c.title });
      }
    }
  }
  return {
    modelo,
    respuesta: texto,
    fuentes: dedupe(fuentes),
    tokens_entrada: data.usage?.input_tokens || 0,
    tokens_salida: data.usage?.output_tokens || 0,
    coste_usd:
      costeTokens(modelo, data.usage?.input_tokens || 0, data.usage?.output_tokens || 0) +
      (data.usage?.server_tool_use?.web_search_requests || 0) * CARGOS.claude_busqueda,
  };
}

async function claude(pregunta: string): Promise<Parcial> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no configurada');
  let ultimo: unknown;
  for (const modelo of CLAUDE_MODELOS) {
    try {
      return await claudeCon(pregunta, modelo);
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo;
}

// ─── Google (Modo IA y AI Overviews) vía DataForSEO ─────────────────────────
// Google no ofrece API para sus respuestas de IA; DataForSEO las captura del
// buscador. Ubicación España (2724), idioma español.

/** Google respondió pero sin resumen de IA: la consulta se cobra igual. */
class SinResumenIA extends Error {
  constructor(mensaje: string, public coste_usd: number) {
    super(mensaje);
  }
}

const DFS_BASE = 'https://api.dataforseo.com/v3';
const DFS_LOCATION = Number(process.env.RADIOGRAFIA_GOOGLE_LOCATION_CODE) || 2724;

async function dataforseo(ruta: string, cuerpo: Record<string, unknown>) {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD no configuradas');
  const auth = Buffer.from(`${login}:${password}`).toString('base64');
  const data = await postJson(`${DFS_BASE}${ruta}`, { Authorization: `Basic ${auth}` }, [cuerpo]);
  const tarea = data.tasks?.[0];
  if (!tarea || tarea.status_code !== 20000) {
    throw new Error(`DataForSEO ${tarea?.status_code || data.status_code}: ${tarea?.status_message || data.status_message || 'sin detalle'}`);
  }
  return {
    items: (tarea.result?.[0]?.items || []) as any[],
    coste: typeof tarea.cost === 'number' ? (tarea.cost as number) : null,
  };
}

/** Texto y fuentes de un elemento ai_overview de DataForSEO (la forma varía según el caso) */
function leerResumenIA(item: any): { texto: string; fuentes: Fuente[] } {
  const fuentes: Fuente[] = [];
  const partes: string[] = [];
  const recorrer = (nodo: any, nivel: number) => {
    if (!nodo || typeof nodo !== 'object') return;
    for (const r of nodo.references || []) {
      if (r?.url) fuentes.push({ url: r.url, titulo: r.title || r.source || r.domain });
    }
    if (nivel > 0) {
      const t = nodo.markdown || nodo.text;
      if (typeof t === 'string' && t.trim()) partes.push(t.trim());
    }
    for (const hijo of nodo.items || []) recorrer(hijo, nivel + 1);
  };
  recorrer(item, 0);
  const propio = typeof item.markdown === 'string' && item.markdown.trim() ? item.markdown.trim() : '';
  return { texto: propio || partes.join('\n\n'), fuentes: dedupe(fuentes) };
}

async function googleIA(pregunta: string): Promise<Parcial> {
  const { items, coste } = await dataforseo('/serp/google/ai_mode/live/advanced', {
    keyword: pregunta,
    location_code: DFS_LOCATION,
    language_code: 'es',
    device: 'desktop',
  });
  const item = items.find((i) => i.type === 'ai_overview');
  const { texto, fuentes } = item ? leerResumenIA(item) : { texto: '', fuentes: [] };
  const coste_usd = coste ?? CARGOS.google_modo_ia;
  if (!texto) throw new SinResumenIA(`${SIN_RESUMEN_IA} respuesta del Modo IA para esta búsqueda`, coste_usd);
  return { modelo: 'Modo IA', respuesta: texto, fuentes, tokens_entrada: 0, tokens_salida: 0, coste_usd };
}

async function googleAIO(pregunta: string): Promise<Parcial> {
  const base = { keyword: pregunta, location_code: DFS_LOCATION, language_code: 'es', device: 'desktop', depth: 10 };
  let items: any[];
  let coste: number | null;
  try {
    // Con carga del resumen de IA cuando Google lo muestra en diferido.
    ({ items, coste } = await dataforseo('/serp/google/organic/live/advanced', { ...base, load_async_ai_overview: true }));
  } catch (e) {
    // DataForSEO devolvía "Internal SE Server Error" con esa opción: se reintenta sin ella.
    console.warn(`[Radiografía google_aio] Reintento sin carga diferida: ${e instanceof Error ? e.message : e}`);
    ({ items, coste } = await dataforseo('/serp/google/organic/live/advanced', base));
  }
  const item = items.find((i) => i.type === 'ai_overview');
  const { texto, fuentes } = item ? leerResumenIA(item) : { texto: '', fuentes: [] };
  const coste_usd = coste ?? CARGOS.google_aio;
  if (!texto) throw new SinResumenIA(`${SIN_RESUMEN_IA} un resumen de IA en los resultados de esta búsqueda`, coste_usd);
  return { modelo: 'AI Overview', respuesta: texto, fuentes, tokens_entrada: 0, tokens_salida: 0, coste_usd };
}

// ─── Entrada común ──────────────────────────────────────────────────────────

const CONECTORES: Record<Motor, (pregunta: string) => Promise<Parcial>> = {
  chatgpt,
  gemini,
  perplexity,
  claude,
  google_ia: googleIA,
  google_aio: googleAIO,
};

/** Pregunta a un motor con búsqueda web. Nunca lanza: devuelve `error` si falla. */
export async function preguntarMotor(motor: Motor, pregunta: string): Promise<RespuestaMotor> {
  const inicio = Date.now();
  try {
    const r = await CONECTORES[motor](pregunta);
    if (!r.respuesta.trim()) throw new Error('Respuesta vacía');
    return { motor, ...r, coste_usd: redondear(r.coste_usd), duracion_ms: Date.now() - inicio };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.startsWith(SIN_RESUMEN_IA)) {
      console.error(`[Radiografía ${motor}] ERROR "${pregunta.substring(0, 60)}": ${msg}`);
    }
    return {
      motor,
      modelo: '',
      respuesta: '',
      fuentes: [],
      tokens_entrada: 0,
      tokens_salida: 0,
      duracion_ms: Date.now() - inicio,
      coste_usd: e instanceof SinResumenIA ? redondear(e.coste_usd) : 0,
      error: msg.substring(0, 300),
    };
  }
}
