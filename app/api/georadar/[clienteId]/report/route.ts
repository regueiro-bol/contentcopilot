import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateReport } from '@/lib/georadar/report-generator';

export async function GET(
  req: NextRequest,
  { params }: { params: { clienteId: string } }
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }));
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

  // ?raw=1 → devolver resultados raw del último scan agrupados por query
  if (req.nextUrl.searchParams.get('raw') === '1') {
    const { data: resultados } = await supabase
      .from('georadar_resultados')
      .select('llm, respuesta_completa, menciona_marca, posicion_mencion, sentiment, atributos_detectados, competidores_mencionados, fuentes_citadas, score, query_id, georadar_queries(query, categoria)')
      .eq('scan_id', scan.id);

    const map = new Map<string, { query_id: string; query: string; categoria: string | null; resultados: any[] }>();
    for (const r of resultados ?? []) {
      const q: any = (r as any).georadar_queries;
      const key = (r as any).query_id ?? q?.query ?? 'sin-query';
      if (!map.has(key)) {
        map.set(key, {
          query_id: (r as any).query_id,
          query: q?.query ?? 'Query sin título',
          categoria: q?.categoria ?? null,
          resultados: [],
        });
      }
      map.get(key)!.resultados.push({
        llm: (r as any).llm,
        respuesta_completa: (r as any).respuesta_completa ?? '',
        menciona_marca: !!(r as any).menciona_marca,
        posicion_mencion: (r as any).posicion_mencion,
        sentiment: (r as any).sentiment,
        atributos_detectados: (r as any).atributos_detectados ?? [],
        competidores_mencionados: (r as any).competidores_mencionados ?? [],
        fuentes_citadas: (r as any).fuentes_citadas ?? [],
        score: (r as any).score != null ? Number((r as any).score) : null,
      });
    }

    return NextResponse.json({
      scan_id: scan.id,
      fecha_scan: scan.fecha_scan,
      cliente_id: params.clienteId,
      grupos: Array.from(map.values()),
    });
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
