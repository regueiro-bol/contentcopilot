import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { normalizarDominio, prepararRadiografia } from '@/lib/georadar/radiografia/preparar';
import { guardarRegistroCoste } from '@/lib/costes';

export const maxDuration = 60;

/**
 * POST /api/georadar/radiografia/preparar
 * Lee la portada del dominio y propone la marca y las preguntas de comprador:
 * 3 genéricas (modo captación, por defecto) o 5 a medida de la web (modo completa).
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

  const modo = body.modo === 'completa' ? 'completa' : 'captacion';

  const preparacion = await prepararRadiografia(dominio, sector, zona, modo);
  if (preparacion.coste_usd > 0) {
    await guardarRegistroCoste({
      tipo_operacion: 'radiografia_express',
      agente: 'radiografia_preparar',
      coste_usd: preparacion.coste_usd,
      metadatos: { dominio, modo },
    });
  }
  if (preparacion.preguntas.length === 0) {
    return NextResponse.json(
      { error: 'No se pudieron generar las preguntas. Indica a qué se dedica el negocio y la ciudad, y vuelve a intentarlo.' },
      { status: 502 },
    );
  }
  return NextResponse.json(preparacion);
}
