import { createClient } from '@/lib/supabase/server';
import { claudeAdapter } from './llm-adapters/claude-adapter';
import { gpt4Adapter } from './llm-adapters/gpt4-adapter';
import { geminiAdapter } from './llm-adapters/gemini-adapter';
import { perplexityAdapter } from './llm-adapters/perplexity-adapter';
import { analyzeResponse } from './analyzer';
import { calculateScore } from './scorer';
import type { LLMProvider } from './types';

const LLM_ADAPTERS: Record<LLMProvider, (query: string) => Promise<any>> = {
  claude: claudeAdapter,
  gpt4: gpt4Adapter,
  gemini: geminiAdapter,
  perplexity: perplexityAdapter,
};

export async function executeScan(scanId: string): Promise<void> {
  const supabase = await createClient();

  const { data: scan } = await supabase
    .from('georadar_scans')
    .select('*, georadar_configs(*, clientes(*))')
    .eq('id', scanId)
    .single();

  if (!scan) throw new Error(`Scan ${scanId} no encontrado`);

  await supabase
    .from('georadar_scans')
    .update({ estado: 'ejecutando', iniciado_at: new Date().toISOString() })
    .eq('id', scanId);

  const { data: queries } = await supabase
    .from('georadar_queries')
    .select('*')
    .eq('config_id', scan.config_id)
    .eq('activa', true);

  const { data: competidores } = await supabase
    .from('georadar_competidores')
    .select('*')
    .eq('config_id', scan.config_id)
    .eq('activo', true);

  const clienteNombre = scan.georadar_configs.clientes.nombre;
  const llmsActivos = scan.georadar_configs.llms_activos as LLMProvider[];

  let totalCoste = 0;
  let totalTokens = 0;
  let queriesCompletadas = 0;

  for (const query of (queries || [])) {
    for (const llm of llmsActivos) {
      try {
        const adapter = LLM_ADAPTERS[llm];
        const llmResponse = await adapter(query.query_texto);

        const analisis = await analyzeResponse(
          llmResponse.respuesta_raw,
          clienteNombre,
          competidores || [],
          query.query_texto
        );

        const score = calculateScore(analisis);

        await supabase.from('georadar_resultados').insert({
          scan_id: scanId,
          query_id: query.id,
          cliente_id: scan.georadar_configs.cliente_id,
          llm,
          respuesta_raw: llmResponse.respuesta_raw,
          marca_mencionada: analisis.marca_mencionada,
          posicion_primera_mencion: analisis.posicion_primera_mencion,
          numero_menciones: analisis.numero_menciones,
          sentimiento: analisis.sentimiento,
          atributos_asociados: analisis.atributos_asociados,
          competidores_mencionados: analisis.competidores_mencionados,
          fuentes_citadas: analisis.fuentes_citadas,
          score,
          tokens_entrada: llmResponse.tokens_entrada,
          tokens_salida: llmResponse.tokens_salida,
          coste_usd: llmResponse.coste_usd,
        });

        totalCoste += llmResponse.coste_usd;
        totalTokens += llmResponse.tokens_entrada + llmResponse.tokens_salida;

        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        console.error(`Error scan ${scanId} query ${query.id} llm ${llm}:`, err);
      }
    }

    queriesCompletadas++;
    await supabase
      .from('georadar_scans')
      .update({ queries_completadas: queriesCompletadas })
      .eq('id', scanId);
  }

  await supabase.from('georadar_scans').update({
    estado: 'completado',
    completado_at: new Date().toISOString(),
    coste_usd: totalCoste,
    tokens_total: totalTokens,
  }).eq('id', scanId);
}
