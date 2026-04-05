import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: { clienteId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createAdminClient();

  const [clienteRes, configRes, queriesRes, competidoresRes, keywordsRes] = await Promise.all([
    supabase.from('clientes').select('id, nombre, sector, descripcion').eq('id', params.clienteId).single(),
    supabase.from('georadar_configs').select('*').eq('cliente_id', params.clienteId).single(),
    supabase.from('georadar_queries').select('*').eq('cliente_id', params.clienteId).eq('activa', true),
    supabase.from('competitors').select('*').eq('client_id', params.clienteId),
    supabase.from('proyectos').select('keywords_objetivo').eq('cliente_id', params.clienteId).limit(1).single(),
  ]);

  const keywords = keywordsRes.data?.keywords_objetivo || [];

  return NextResponse.json({
    cliente: clienteRes.data,
    config: configRes.data,
    queries: queriesRes.data || [],
    competidores: competidoresRes.data || [],
    keywords,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { clienteId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createAdminClient();
  const body = await req.json();
  const { paquete, llms, max_queries, frecuencia, queries, competidores } = body;

  const { data: config, error } = await supabase
    .from('georadar_configs')
    .upsert({
      cliente_id: params.clienteId,
      paquete,
      llms,
      max_queries,
      frecuencia,
      activo: true,
    }, { onConflict: 'cliente_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (queries?.length) {
    // Primero desactivar todas
    await supabase
      .from('georadar_queries')
      .update({ activa: false })
      .eq('cliente_id', params.clienteId);

    // Luego upsert de las que vienen del formulario
    for (const q of queries.filter((q: any) => q.query.trim())) {
      const { data: existente } = await supabase
        .from('georadar_queries')
        .select('id')
        .eq('cliente_id', params.clienteId)
        .eq('query', q.query.trim())
        .maybeSingle();

      if (existente) {
        await supabase
          .from('georadar_queries')
          .update({ activa: true, categoria: q.categoria || 'marca' })
          .eq('id', existente.id);
      } else {
        await supabase
          .from('georadar_queries')
          .insert({
            config_id: config.id,
            cliente_id: params.clienteId,
            query: q.query.trim(),
            categoria: q.categoria || 'marca',
            activa: true,
          });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
