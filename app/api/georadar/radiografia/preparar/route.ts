import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { normalizarDominio, prepararRadiografia } from '@/lib/georadar/radiografia/preparar';

export const maxDuration = 60;

/**
 * POST /api/georadar/radiografia/preparar
 * Lee la portada del dominio y propone la marca y 5 preguntas de comprador.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }));
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dominio = normalizarDominio(String(body.dominio || ''));
  if (!dominio) {
    return NextResponse.json({ error: 'Escribe un dominio válido, por ejemplo tunegocio.es' }, { status: 400 });
  }

  const sector = String(body.sector || '').slice(0, 120);
  const zona = String(body.zona || '').slice(0, 120);

  const preparacion = await prepararRadiografia(dominio, sector, zona);
  if (preparacion.preguntas.length === 0) {
    return NextResponse.json(
      { error: 'No se pudieron generar las preguntas. Indica el sector y la zona y vuelve a intentarlo.' },
      { status: 502 },
    );
  }
  return NextResponse.json(preparacion);
}
