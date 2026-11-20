import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { guardarRegistroCoste } from '@/lib/costes';
import { agregarRadar, leerLead, leerRespuestas } from '@/lib/radar/servidor';
import { enviarInforme, htmlInforme, textoInforme, tresArreglos } from '@/lib/radar/correo';

export const maxDuration = 60;

/**
 * POST /api/radar/finalizar  (público, con token del contacto)
 * Calcula la nota, envía el informe completo por correo y devuelve el veredicto para la pantalla.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const lead = await leerLead(String(body.id || ''), String(body.token || ''));
  if (!lead) return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });

  const respuestas = (await leerRespuestas(lead.id)).map((r) => r.resultado);
  if (respuestas.length === 0) {
    return NextResponse.json({ error: 'Los asistentes no han respondido. Inténtalo de nuevo en unos minutos.' }, { status: 502 });
  }

  const agg = agregarRadar(lead, respuestas);
  const veredicto = {
    nota: agg.notaGlobal,
    titular: agg.titular,
    subtitular: agg.subtitular,
    apariciones: agg.apariciones,
    total: agg.totalValidas,
  };

  // El informe se envía una sola vez, aunque se recargue la página.
  if (lead.email_enviado) return NextResponse.json({ ...veredicto, email_enviado: true });

  const { arreglos, coste_usd } = await tresArreglos(lead, agg);
  const buzon = process.env.RADAR_SMTP_USER || 'local@locallyfy.com';
  const urlContacto = `mailto:${buzon}?subject=${encodeURIComponent(`Quiero que me llaméis (${lead.negocio})`)}`;
  const asunto = `${lead.negocio}: la IA te recomienda en ${agg.apariciones} de ${agg.totalValidas} respuestas`;
  const fallo = await enviarInforme(lead, asunto, htmlInforme(lead, respuestas, agg, arreglos, urlContacto), textoInforme(lead, agg, arreglos));

  const supabase = createAdminClient();
  await supabase
    .from('radar_leads')
    .update({ nota: agg.notaGlobal, email_enviado: !fallo, email_error: fallo, arreglos })
    .eq('id', lead.id);
  if (coste_usd > 0) {
    await guardarRegistroCoste({ tipo_operacion: 'radiografia_express', agente: 'radar_local_informe', coste_usd, metadatos: { lead: lead.id } });
  }
  if (fallo) console.error(`[Radar Local] Informe sin enviar (${lead.id}): ${fallo}`);

  return NextResponse.json({ ...veredicto, email_enviado: !fallo });
}
