import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { analizarPregunta } from '@/lib/georadar/radiografia/analizar';
import { redondear } from '@/lib/georadar/radiografia/precios';
import { guardarRegistroCoste } from '@/lib/costes';
import { celdasPublicas, leerLead, MOTORES_RADAR } from '@/lib/radar/servidor';
import type { ResultadoPregunta } from '@/lib/georadar/radiografia/types';

export const maxDuration = 240;

/**
 * POST /api/radar/pregunta  (público, con token del contacto)
 * Lanza UNA de las preguntas guardadas a los asistentes. El texto de la pregunta nunca viene
 * del navegador: solo el número, para que nadie pueda usar esto con preguntas propias.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const lead = await leerLead(String(body.id || ''), String(body.token || ''));
  if (!lead) return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });

  const i = Number(body.i);
  if (!Number.isInteger(i) || i < 0 || i >= lead.preguntas.length) {
    return NextResponse.json({ error: 'Pregunta no válida.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: previa } = await supabase
    .from('radar_respuestas')
    .select('resultado')
    .eq('lead_id', lead.id)
    .eq('i', i)
    .maybeSingle();
  if (previa?.resultado) {
    return NextResponse.json({ i, celdas: celdasPublicas(previa.resultado as ResultadoPregunta) });
  }

  const resultado = await analizarPregunta(lead.preguntas[i], lead.negocio, [], lead.web || '', [], MOTORES_RADAR);
  const coste = redondear(resultado.resultados.reduce((n, r) => n + (r.coste_usd || 0) + (r.coste_analisis_usd || 0), 0));

  // Si dos peticiones coinciden, se queda la primera que llegó.
  await supabase.from('radar_respuestas').upsert({ lead_id: lead.id, i, resultado, coste_usd: coste }, { onConflict: 'lead_id,i', ignoreDuplicates: true });
  if (coste > 0) {
    await guardarRegistroCoste({
      tipo_operacion: 'radiografia_express',
      agente: 'radar_local_pregunta',
      modelo: 'varios',
      unidades: resultado.resultados.length,
      coste_usd: coste,
      metadatos: { lead: lead.id, pregunta: lead.preguntas[i] },
    });
  }

  return NextResponse.json({ i, celdas: celdasPublicas(resultado) });
}
