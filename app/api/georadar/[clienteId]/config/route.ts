import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Carga los competidores disponibles desde referencias_externas
 * (tipo=competidor_editorial, activo=true) con su URL web (si existe)
 * desde referencia_presencias (plataforma='web').
 */
async function loadCompetidoresDisponibles(
  supabase: ReturnType<typeof createAdminClient>,
  clienteId: string
) {
  const { data: refs } = await supabase
    .from('referencias_externas')
    .select('id, nombre, categoria, created_at, referencia_presencias(url, handle, plataforma, activo)')
    .eq('client_id', clienteId)
    .eq('tipo', 'competidor_editorial')
    .eq('activo', true)
    .order('created_at', { ascending: true });

  return (refs || []).map((r: any) => {
    const webPres = (r.referencia_presencias || []).find(
      (p: any) => p.plataforma === 'web' && p.activo && p.url
    );
    let dominio = '';
    if (webPres?.url) {
      try {
        dominio = new URL(webPres.url).hostname.replace(/^www\./, '');
      } catch { /* skip */ }
    }
    return {
      id: r.id,
      nombre: r.nombre,
      categoria: r.categoria ?? null,
      dominio,
      web_url: webPres?.url ?? null,
    };
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { clienteId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createAdminClient();

  const [clienteRes, configRes, queriesRes, disponibles, seleccionRes, keywordsRes] = await Promise.all([
    supabase.from('clientes').select('id, nombre, sector, descripcion').eq('id', params.clienteId).single(),
    supabase.from('georadar_configs').select('*').eq('cliente_id', params.clienteId).single(),
    supabase.from('georadar_queries').select('*').eq('cliente_id', params.clienteId).eq('activa', true),
    loadCompetidoresDisponibles(supabase, params.clienteId),
    supabase.from('georadar_competidores_seleccion').select('referencia_id').eq('cliente_id', params.clienteId),
    supabase.from('proyectos').select('keywords_objetivo').eq('cliente_id', params.clienteId).limit(1).single(),
  ]);

  const keywords = keywordsRes.data?.keywords_objetivo || [];

  // Si no hay seleccion guardada aún → null (el front pre-marcará todos).
  // Si hay al menos una fila → devolver el array (puede ser subset o vacío si deseleccionó todos).
  const seleccionIds = seleccionRes.data ? (seleccionRes.data as any[]).map(s => s.referencia_id) : null;
  const virgen = seleccionRes.data === null || (seleccionRes.data as any[]).length === 0;

  return NextResponse.json({
    cliente: clienteRes.data,
    config: configRes.data,
    queries: queriesRes.data || [],
    competidores_disponibles: disponibles,
    competidores_seleccionados: seleccionIds ?? [],
    seleccion_virgen: virgen, // front pre-marca todos si true
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
  const { paquete, llms, max_queries, frecuencia, queries, competidores_seleccionados } = body;

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
    await supabase
      .from('georadar_queries')
      .update({ activa: false })
      .eq('cliente_id', params.clienteId);

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

  // Selección de competidores: reemplazo completo de la pivote
  if (Array.isArray(competidores_seleccionados)) {
    await supabase
      .from('georadar_competidores_seleccion')
      .delete()
      .eq('cliente_id', params.clienteId);

    const filas = competidores_seleccionados
      .filter((refId: any) => typeof refId === 'string' && refId.length)
      .map((refId: string) => ({
        cliente_id: params.clienteId,
        referencia_id: refId,
      }));

    if (filas.length) {
      const { error: selErr } = await supabase
        .from('georadar_competidores_seleccion')
        .insert(filas);
      if (selErr) {
        console.error('[GEORadar Config] Error guardando selección de competidores:', selErr.message);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
