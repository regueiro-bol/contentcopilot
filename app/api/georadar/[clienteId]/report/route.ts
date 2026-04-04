import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateReport } from '@/lib/georadar/report-generator';

export async function GET(
  req: NextRequest,
  { params }: { params: { clienteId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createAdminClient();

  // Buscar último scan completado
  const { data: scan } = await supabase
    .from('georadar_scans')
    .select('*')
    .eq('cliente_id', params.clienteId)
    .eq('estado', 'completado')
    .order('fecha_scan', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!scan) {
    return NextResponse.json({ error: 'Sin datos para este cliente' }, { status: 404 });
  }

  // Si ya tiene narrativa generada, devolver directamente
  if (scan.narrativa_resumen) {
    return NextResponse.json(scan);
  }

  // Si no, generar el informe
  const periodo = new Date(scan.fecha_scan).toISOString().slice(0, 7);
  const informe = await generateReport(scan.id, params.clienteId, periodo);
  return NextResponse.json(informe);
}
