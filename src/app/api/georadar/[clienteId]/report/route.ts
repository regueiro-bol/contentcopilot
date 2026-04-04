import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@/lib/supabase/server';
import { generateReport } from '@/lib/georadar/report-generator';

export async function GET(
  req: NextRequest,
  { params }: { params: { clienteId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get('periodo');

  const supabase = await createClient();

  const query = supabase
    .from('georadar_scans')
    .select('*')
    .eq('cliente_id', params.clienteId)
    .eq('estado', 'completado')
    .order('completado_at', { ascending: false });

  if (periodo) query.eq('periodo', periodo);

  const { data: scans } = await query.limit(1);
  const scan = scans?.[0];

  if (!scan) {
    return NextResponse.json({ error: 'Sin datos para este periodo' }, { status: 404 });
  }

  const { data: informeExistente } = await supabase
    .from('georadar_informes')
    .select('*')
    .eq('scan_id', scan.id)
    .single();

  if (informeExistente) {
    return NextResponse.json(informeExistente);
  }

  const informe = await generateReport(scan.id, params.clienteId, scan.periodo);
  return NextResponse.json(informe);
}
