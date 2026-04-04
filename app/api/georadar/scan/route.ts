import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeScan } from '@/lib/georadar/scan-engine';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
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

  executeScan(scan.id).catch(console.error);

  return NextResponse.json({
    scan_id: scan.id,
    estado: 'iniciando',
    queries: count
  });
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
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
