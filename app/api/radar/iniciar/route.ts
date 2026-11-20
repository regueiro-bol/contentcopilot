import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizarDominio, plantillasGenericas, preguntasGenericas } from '@/lib/georadar/radiografia/preparar';
import { guardarRegistroCoste } from '@/lib/costes';
import { emailValido, hashIp, ipDe, limiteSuperado, limpiar, nuevoToken } from '@/lib/radar/servidor';

export const maxDuration = 30;

/**
 * POST /api/radar/iniciar  (público)
 * Registra el contacto, comprueba los límites de uso y devuelve las 3 preguntas genéricas.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Campo trampa: las personas no lo ven; si llega relleno es un robot.
  if (limpiar(body.empresa, 50)) return NextResponse.json({ error: 'No se pudo procesar la petición.' }, { status: 400 });

  const negocio = limpiar(body.negocio, 100);
  const sector = limpiar(body.sector, 60);
  const ciudad = limpiar(body.ciudad, 60);
  const email = limpiar(body.email, 160).toLowerCase();
  const web = normalizarDominio(limpiar(body.web, 120)) || null;

  if (negocio.length < 2 || sector.length < 3 || ciudad.length < 2) {
    return NextResponse.json({ error: 'Indica el nombre del negocio, a qué te dedicas y la ciudad.' }, { status: 400 });
  }
  if (!emailValido(email)) return NextResponse.json({ error: 'Escribe un email válido.' }, { status: 400 });
  if (body.consentimiento !== true) {
    return NextResponse.json({ error: 'Necesitamos que aceptes la política de privacidad.' }, { status: 400 });
  }

  const ipHash = hashIp(ipDe(req));
  const limite = await limiteSuperado(email, ipHash);
  if (limite) return NextResponse.json({ error: limite }, { status: 429 });

  const generadas = await preguntasGenericas(sector, ciudad).catch(() => ({ pares: [], coste_usd: 0 }));
  const coste_usd = generadas.coste_usd;
  const pares = generadas.pares.length >= 3 ? generadas.pares : plantillasGenericas(sector, ciudad);

  const token = nuevoToken();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('radar_leads')
    .insert({
      token,
      email,
      negocio,
      sector,
      ciudad,
      web,
      consentimiento: true,
      ip_hash: ipHash,
      preguntas: pares.map((p) => p.pregunta),
      etiquetas: pares.map((p) => p.etiqueta),
      coste_usd,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[Radar Local] No se pudo guardar el contacto:', error?.message);
    return NextResponse.json({ error: 'No se pudo iniciar el análisis. Inténtalo de nuevo.' }, { status: 500 });
  }
  if (coste_usd > 0) {
    await guardarRegistroCoste({ tipo_operacion: 'radiografia_express', agente: 'radar_local_preguntas', coste_usd, metadatos: { lead: data.id } });
  }

  return NextResponse.json({
    id: data.id,
    token,
    preguntas: pares.map((p) => p.pregunta),
    etiquetas: pares.map((p) => p.etiqueta),
  });
}
