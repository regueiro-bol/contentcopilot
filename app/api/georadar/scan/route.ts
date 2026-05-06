import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/georadar/scan
 * Crea el registro del scan y devuelve el scan_id inmediatamente.
 * La ejecucion la dispara el frontend llamando a POST /ejecutar.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }));
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { clienteId, periodo } = await req.json();

  if (!clienteId || !periodo) {
    return NextResponse.json({ error: 'clienteId y periodo requeridos' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: config } = await supabase
    .from('georadar_configs')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('activo', true)
    .single();

  if (!config) {
    return NextResponse.json({ error: 'Cliente sin configuración GEORadar' }, { status: 404 });
  }

  const { count } = await supabase
    .from('georadar_queries')
    .select('*', { count: 'exact', head: true })
    .eq('config_id', config.id)
    .eq('activa', true);

  const { data: scan, error } = await supabase
    .from('georadar_scans')
    .insert({
      cliente_id: clienteId,
      config_id: config.id,
      llms_usados: config.llms,
      total_queries: count || 0,
      estado: 'pendiente',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    scan_id: scan.id,
    estado: 'pendiente',
    queries: count,
  });
}

/**
 * GET /api/georadar/scan?scanId=...
 * Polling de progreso.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }));
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scanId = searchParams.get('scanId');

  if (!scanId) return NextResponse.json({ error: 'scanId requerido' }, { status: 400 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('georadar_scans')
    .select('estado, total_queries, queries_completadas, coste_usd')
    .eq('id', scanId)
    .single();

  return NextResponse.json(data);
}

/**
 * PATCH /api/georadar/scan
 * Cancelar un scan bloqueado.
 * Body: { scanId: string }
 */
export async function PATCH(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }));
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { scanId } = await req.json();
  if (!scanId) return NextResponse.json({ error: 'scanId requerido' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('georadar_scans')
    .update({ estado: 'error' })
    .eq('id', scanId)
    .in('estado', ['pendiente', 'ejecutando']);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log(`[GEORadar] Scan ${scanId} cancelado`);
  return NextResponse.json({ ok: true });
}
