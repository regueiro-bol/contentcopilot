import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { leerLead, limpiar } from '@/lib/radar/servidor';
import { avisarLlamada } from '@/lib/radar/correo';

export const maxDuration = 30;

/** POST /api/radar/llamada  (público, con token del contacto): guarda el teléfono de quien pide que le llamen. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const lead = await leerLead(String(body.id || ''), String(body.token || ''));
  if (!lead) return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });

  const telefono = limpiar(body.telefono, 20).replace(/[^\d+ ]/g, '');
  if (telefono.replace(/\D/g, '').length < 9) {
    return NextResponse.json({ error: 'Escribe un teléfono válido.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('radar_leads').update({ telefono, pide_llamada_at: new Date().toISOString() }).eq('id', lead.id);
  if (error) return NextResponse.json({ error: 'No se pudo guardar. Inténtalo de nuevo.' }, { status: 500 });
  await avisarLlamada(lead, telefono);
  return NextResponse.json({ ok: true });
}
