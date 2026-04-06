import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeScan } from '@/lib/georadar/scan-engine';

export const maxDuration = 120;

/**
 * POST /api/georadar/scan/ejecutar
 *
 * Ejecuta un scan de forma sincrona. El scan ya debe existir en la BD.
 * El frontend dispara esta llamada sin await (fire-and-forget desde el cliente)
 * y hace polling al GET /api/georadar/scan para ver el progreso.
 *
 * maxDuration=120 mantiene la funcion serverless viva.
 *
 * Body: { scanId: string }
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { scanId } = await req.json();
  if (!scanId) return NextResponse.json({ error: 'scanId requerido' }, { status: 400 });

  console.log(`[GEORadar] Ejecutando scan ${scanId} sincrono (maxDuration=120)...`);

  try {
    await executeScan(scanId);
    console.log(`[GEORadar] Scan ${scanId} completado OK`);

    return NextResponse.json({ ok: true, estado: 'completado' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GEORadar] Scan ${scanId} ERROR:`, msg);

    const supabase = createAdminClient();
    await supabase
      .from('georadar_scans')
      .update({ estado: 'error' })
      .eq('id', scanId);

    return NextResponse.json({ ok: false, estado: 'error', error: msg }, { status: 500 });
  }
}
