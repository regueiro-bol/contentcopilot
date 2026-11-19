import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { analizarPregunta } from '@/lib/georadar/radiografia/analizar';
import { normalizarDominio } from '@/lib/georadar/radiografia/preparar';

// Tres motores con búsqueda web en paralelo + análisis. Suele tardar 20-60 s.
export const maxDuration = 180;

/**
 * POST /api/georadar/radiografia/pregunta
 * Lanza UNA pregunta a ChatGPT, Gemini y Perplexity y analiza las respuestas.
 * El cliente llama a esta ruta una vez por pregunta, en paralelo, para ir
 * pintando el progreso sin una única petición larga.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }));
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dominio = normalizarDominio(String(body.dominio || ''));
  const marca = String(body.marca || '').trim().slice(0, 120);
  const pregunta = String(body.pregunta || '').trim().slice(0, 300);
  const competidores = (Array.isArray(body.competidores) ? body.competidores : [])
    .map((c: unknown) => String(c).trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 3);

  if (!dominio || !marca || pregunta.length < 8) {
    return NextResponse.json({ error: 'dominio, marca y pregunta son obligatorios' }, { status: 400 });
  }

  const resultado = await analizarPregunta(pregunta, marca, dominio, competidores);
  return NextResponse.json(resultado);
}
