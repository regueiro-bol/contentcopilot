import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resumirRadiografia } from '@/lib/georadar/radiografia/analizar';
import { normalizarDominio } from '@/lib/georadar/radiografia/preparar';

export const maxDuration = 90;

/**
 * POST /api/georadar/radiografia/resumen
 * Diagnóstico y lista priorizada de arreglos a partir de los resultados.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }));
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dominio = normalizarDominio(String(body.dominio || ''));
  const marca = String(body.marca || '').trim().slice(0, 120);
  const preguntas = Array.isArray(body.preguntas) ? body.preguntas.slice(0, 5) : [];

  if (!dominio || !marca || preguntas.length === 0) {
    return NextResponse.json({ error: 'Faltan datos para el resumen' }, { status: 400 });
  }

  const resumen = await resumirRadiografia(
    marca,
    dominio,
    String(body.descripcion || '').slice(0, 300),
    body.web_legible !== false,
    preguntas,
    (Array.isArray(body.dominios) ? body.dominios : [])
      .map((d: unknown) => String(d).toLowerCase().slice(0, 100))
      .filter(Boolean)
      .slice(0, 25),
    (Array.isArray(body.paginas) ? body.paginas : [])
      .slice(0, 40)
      .map((p: { ruta?: unknown; texto?: unknown }) => ({
        ruta: String(p?.ruta || '').slice(0, 120),
        texto: String(p?.texto || '').slice(0, 60),
      }))
      .filter((p: { ruta: string }) => p.ruta.startsWith('/')),
  );
  return NextResponse.json(resumen);
}
