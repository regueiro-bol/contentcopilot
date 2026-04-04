import { createAdminClient } from '@/lib/supabase/admin';
import Anthropic from '@anthropic-ai/sdk';
import { calculateGlobalScore } from './scorer';
import type { LLMProvider, InformeData } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateReport(
  scanId: string,
  clienteId: string,
  periodo: string
): Promise<InformeData> {
  const supabase = createAdminClient();

  console.log('[Report] Buscando resultados para scan:', scanId);
  const { data: resultados, error: resError } = await supabase
    .from('georadar_resultados')
    .select('*, georadar_queries(query, categoria)')
    .eq('scan_id', scanId);
  console.log('[Report] Resultados encontrados:', resultados?.length, 'Error:', resError?.message);

  if (!resultados || resultados.length === 0) throw new Error('Sin resultados');

  const { data: cliente } = await supabase
    .from('clientes')
    .select('nombre')
    .eq('id', clienteId)
    .single();

  const scoreGlobal = calculateGlobalScore(resultados);

  const { data: scanAnterior } = await supabase
    .from('georadar_scans')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('estado', 'completado')
    .neq('id', scanId)
    .order('completado_at', { ascending: false })
    .limit(1)
    .single();

  let scoreAnterior = null;
  if (scanAnterior) {
    const { data: resultadosAnteriores } = await supabase
      .from('georadar_resultados')
      .select('score')
      .eq('scan_id', scanAnterior.id);
    scoreAnterior = calculateGlobalScore(resultadosAnteriores || []);
  }

  const llms: LLMProvider[] = ['claude', 'gpt4', 'gemini', 'perplexity'];
  const scoresPorLLM = {} as Record<LLMProvider, number>;
  for (const llm of llms) {
    const llmResults = resultados.filter(r => r.llm === llm);
    scoresPorLLM[llm] = calculateGlobalScore(llmResults);
  }

  const todosAtributos = resultados.flatMap(r => r.atributos_detectados || []);
  const atribFreq = todosAtributos.reduce((acc: Record<string, number>, a) => {
    acc[a] = (acc[a] || 0) + 1;
    return acc;
  }, {});
  const atributosDominantes = Object.entries(atribFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([attr]) => attr);

  const todasFuentes = resultados.flatMap(r => r.fuentes_citadas || []);
  const fuentesFreq = todasFuentes.reduce((acc: Record<string, number>, f) => {
    acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {});
  const topFuentes = Object.entries(fuentesFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([url, frecuencia]) => ({ url, frecuencia }));

  const queriesConScore = resultados.reduce((acc: Record<string, any>, r) => {
    const qId = r.query_id;
    if (!acc[qId]) {
      acc[qId] = {
        query: r.georadar_queries?.query,
        scores: [],
        competidores: [] as string[],
      };
    }
    acc[qId].scores.push(r.score);
    const comps = (r.competidores_mencionados || []).map((c: any) => c.nombre);
    acc[qId].competidores.push(...comps);
    return acc;
  }, {});

  const queriesAnalizadas = Object.values(queriesConScore).map((q: any) => ({
    query: q.query,
    score: calculateGlobalScore(q.scores.map((s: number) => ({ score: s }))),
    lider: q.competidores[0] || null,
  }));

  const lidera = queriesAnalizadas
    .filter(q => q.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const pierde = queriesAnalizadas
    .filter(q => q.score < 30)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const contextoParaIA = `
Cliente: ${cliente?.nombre}
Periodo: ${periodo}
Score global: ${scoreGlobal}/100 (anterior: ${scoreAnterior || 'N/A'})
Scores por LLM: ${JSON.stringify(scoresPorLLM)}
Atributos dominantes: ${atributosDominantes.join(', ')}
Queries donde lidera: ${lidera.map(q => q.query).join(' | ')}
Queries donde pierde: ${pierde.map(q => q.query).join(' | ')}
Fuentes más usadas: ${topFuentes.slice(0, 5).map(f => f.url).join(', ')}
`;

  const iaPrompt = `Eres un consultor de GEO (Generative Engine Optimization) de Raíz, una agencia de contenidos.
Analiza los datos de presencia en LLMs de este cliente y genera:
1. Un párrafo de narrativa resumen (3-4 frases, tono ejecutivo, en español)
2. Una lista de atributos ausentes que debería tener pero no tiene (máx 5)
3. Tres recomendaciones de contenido concretas para mejorar la presencia

Datos:
${contextoParaIA}

Devuelve SOLO JSON sin markdown:
{
  "narrativa": "...",
  "atributos_ausentes": ["...", "..."],
  "recomendaciones": [
    {
      "gap": "descripción del gap detectado",
      "accion": "acción concreta a tomar",
      "tipo_contenido": "artículo SEO / guía / FAQ / caso de éxito / etc",
      "urgencia": "alta | media | baja",
      "queries_afectadas": ["query1", "query2"]
    }
  ]
}`;

  const iaResponse = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: iaPrompt }],
  });

  const iaText = iaResponse.content[0].type === 'text' ? iaResponse.content[0].text : '{}';
  let iaData: any = {};
  try {
    const clean = iaText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    iaData = JSON.parse(clean);
  } catch { /* usar defaults */ }

  // Guardar informe directamente en georadar_scans
  await supabase.from('georadar_scans').update({
    score_global: scoreGlobal,
    scores_por_llm: scoresPorLLM,
    atributos_dominantes: atributosDominantes,
    atributos_ausentes: iaData.atributos_ausentes || [],
    narrativa_resumen: iaData.narrativa || '',
    posicion_competitiva: { lidera, pierde },
    top_fuentes: topFuentes,
    recomendaciones: iaData.recomendaciones || [],
    estado: 'completado',
  }).eq('id', scanId);

  return {
    scan_id: scanId,
    cliente_id: clienteId,
    cliente_nombre: cliente?.nombre || '',
    periodo,
    score_global: scoreGlobal,
    score_anterior: scoreAnterior,
    evolucion: scoreAnterior !== null ? scoreGlobal - scoreAnterior : 0,
    scores_por_llm: scoresPorLLM,
    atributos_dominantes: atributosDominantes,
    atributos_ausentes: iaData.atributos_ausentes || [],
    narrativa_resumen: iaData.narrativa || '',
    posicion_competitiva: { lidera, pierde },
    top_fuentes: topFuentes,
    recomendaciones: iaData.recomendaciones || [],
  } as InformeData;
}
