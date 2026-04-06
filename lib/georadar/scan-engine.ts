import { createAdminClient } from '@/lib/supabase/admin';
import { claudeAdapter } from './llm-adapters/claude-adapter';
import { gpt4Adapter } from './llm-adapters/gpt4-adapter';
import { geminiAdapter } from './llm-adapters/gemini-adapter';
import { perplexityAdapter } from './llm-adapters/perplexity-adapter';
import { analyzeResponse } from './analyzer';
import { calculateScore, calculateGlobalScore } from './scorer';
import type { LLMProvider } from './types';

const LLM_ADAPTERS: Record<LLMProvider, (query: string) => Promise<any>> = {
  claude: claudeAdapter,
  gpt4: gpt4Adapter,
  gemini: geminiAdapter,
  perplexity: perplexityAdapter,
};

export async function executeScan(scanId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: scan } = await supabase
    .from('georadar_scans')
    .select('*, georadar_configs(*, clientes(*))')
    .eq('id', scanId)
    .single();

  if (!scan) throw new Error(`Scan ${scanId} no encontrado`);

  await supabase
    .from('georadar_scans')
    .update({ estado: 'ejecutando' })
    .eq('id', scanId);

  const { data: queries } = await supabase
    .from('georadar_queries')
    .select('*')
    .eq('config_id', scan.config_id)
    .eq('activa', true);

  // Competidores: intentar tabla competitors (competitive intelligence)
  const { data: competidores } = await supabase
    .from('competitors')
    .select('*')
    .eq('client_id', scan.georadar_configs.cliente_id);

  const clienteNombre = scan.georadar_configs.clientes.nombre;
  const llmsActivos = (scan.georadar_configs.llms || []) as LLMProvider[];

  let totalCoste = 0;
  let totalTokens = 0;
  let queriesCompletadas = 0;
  const allScores: number[] = [];

  for (const query of (queries || [])) {
    for (const llm of llmsActivos) {
      try {
        const adapter = LLM_ADAPTERS[llm];
        if (!adapter) continue;

        const llmResponse = await adapter(query.query);

        // Adapter puede devolver null (ej: Gemini no disponible)
        if (!llmResponse) {
          console.log(`[GEORadar] ${llm} devolvio null para "${query.query.substring(0, 40)}" — omitiendo`);
          continue;
        }

        const competidoresFormatted = (competidores || []).map((c: any) => ({
          nombre: c.name || c.nombre || '',
          aliases: c.aliases || [],
        }));

        const analisis = await analyzeResponse(
          llmResponse.respuesta_raw,
          clienteNombre,
          competidoresFormatted,
          query.query
        );

        const score = calculateScore(analisis);
        allScores.push(score);

        const { error: insertError } = await supabase.from('georadar_resultados').insert({
          scan_id: scanId,
          query_id: query.id,
          cliente_id: scan.georadar_configs.cliente_id,
          llm,
          respuesta_completa: llmResponse.respuesta_raw,
          menciona_marca: analisis.marca_mencionada,
          posicion_mencion: analisis.posicion_primera_mencion,
          sentiment: analisis.sentimiento,
          atributos_detectados: analisis.atributos_asociados,
          competidores_mencionados: analisis.competidores_mencionados,
          fuentes_citadas: analisis.fuentes_citadas,
          score: score,
          tokens_entrada: llmResponse.tokens_entrada,
          tokens_salida: llmResponse.tokens_salida,
          coste_usd: llmResponse.coste_usd,
        });

        if (insertError) {
          console.error('[GEORadar] Error insertando resultado:', insertError.message, insertError.details);
        } else {
          console.log('[GEORadar] Resultado guardado:', llm, query.query);
        }

        totalCoste += llmResponse.coste_usd;
        totalTokens += llmResponse.tokens_entrada + llmResponse.tokens_salida;

        // Rate limiting entre llamadas
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        console.error(`[GEORadar] Error scan ${scanId} query ${query.id} llm ${llm}:`, err);
      }
    }

    queriesCompletadas++;
    await supabase
      .from('georadar_scans')
      .update({ queries_completadas: queriesCompletadas })
      .eq('id', scanId);
  }

  // Calcular score global
  const scoreGlobal = calculateGlobalScore(allScores.map(s => ({ score: s })));

  console.log(`[GEORadar] Scan ${scanId} queries completadas. Coste: $${totalCoste.toFixed(4)}. Generando informe...`);

  // Generar informe ANTES de marcar como completado
  // para que el frontend no haga reload sin score_global
  try {
    const { generateReport } = await import('./report-generator');
    const informe = await generateReport(
      scanId,
      scan.georadar_configs.cliente_id,
      new Date().toISOString().slice(0, 7)
    );
    console.log(`[GEORadar] Informe generado. Score global: ${informe.score_global}`);
  } catch (err) {
    console.error('[GEORadar] Error generando informe:', err);
    console.error('[GEORadar] Stack:', err instanceof Error ? err.stack : err);
  }

  // Marcar como completado DESPUES del informe
  await supabase.from('georadar_scans').update({
    estado: 'completado',
    coste_usd: totalCoste,
  }).eq('id', scanId);

  console.log(`[GEORadar] Scan ${scanId} completado`);
}
