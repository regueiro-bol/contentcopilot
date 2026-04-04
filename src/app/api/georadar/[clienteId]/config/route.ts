import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { clienteId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = await createClient();

  const { data: config } = await supabase
    .from('georadar_configs')
    .select('*')
    .eq('cliente_id', params.clienteId)
    .single();

  const { data: queries } = await supabase
    .from('georadar_queries')
    .select('*')
    .eq('cliente_id', params.clienteId)
    .order('prioridad', { ascending: false });

  const { data: competidores } = await supabase
    .from('georadar_competidores')
    .select('*')
    .eq('cliente_id', params.clienteId);

  return NextResponse.json({ config, queries, competidores });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { clienteId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = await createClient();
  const body = await req.json();
  const { tier, frecuencia, llms_activos, queries, competidores } = body;

  const { data: config, error: configError } = await supabase
    .from('georadar_configs')
    .upsert({
      cliente_id: params.clienteId,
      tier,
      frecuencia,
      llms_activos,
      max_queries: queries?.length || 20,
      activo: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cliente_id' })
    .select()
    .single();

  if (configError) {
    return NextResponse.json({ error: configError.message }, { status: 500 });
  }

  if (queries?.length) {
    await supabase
      .from('georadar_queries')
      .delete()
      .eq('cliente_id', params.clienteId);

    await supabase.from('georadar_queries').insert(
      queries.map((q: any) => ({
        config_id: config.id,
        cliente_id: params.clienteId,
        query_texto: q.query_texto,
        categoria: q.categoria || 'sector',
        prioridad: q.prioridad || 5,
        activa: true,
      }))
    );
  }

  if (competidores?.length) {
    await supabase
      .from('georadar_competidores')
      .delete()
      .eq('cliente_id', params.clienteId);

    await supabase.from('georadar_competidores').insert(
      competidores.map((c: any) => ({
        config_id: config.id,
        cliente_id: params.clienteId,
        nombre: c.nombre,
        dominio: c.dominio || null,
        aliases: c.aliases || [],
        activo: true,
      }))
    );
  }

  return NextResponse.json({ ok: true, config });
}
