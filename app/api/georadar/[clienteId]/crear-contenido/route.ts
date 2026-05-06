import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: { clienteId: string } }
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }));
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createAdminClient();
  const { gap, accion, tipo_contenido, urgencia } = await req.json();

  const { data: proyecto } = await supabase
    .from('proyectos')
    .select('id')
    .eq('cliente_id', params.clienteId)
    .limit(1)
    .single();

  const slug = `georadar-${Date.now()}`

  const { data: contenido, error } = await supabase
    .from('contenidos')
    .insert({
      cliente_id: params.clienteId,
      proyecto_id: proyecto?.id,
      titulo: `[GEORadar] ${accion}`.substring(0, 200),
      slug,
      estado: 'pendiente',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, contenido_id: contenido.id });
}
