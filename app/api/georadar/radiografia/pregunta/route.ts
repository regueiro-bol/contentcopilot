import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { analizarPregunta } from '@/lib/georadar/radiografia/analizar';
import { normalizarDominio } from '@/lib/georadar/radiografia/preparar';
import { redondear } from '@/lib/georadar/radiografia/precios';
import { guardarRegistroCoste } from '@/lib/costes';
import { MOTORES, type Motor } from '@/lib/georadar/radiografia/types';

// Tres motores con búsqueda web en paralelo + análisis. Suele tardar 20-60 s.
export const maxDuration = 240;

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

  const alias = (Array.isArray(body.alias) ? body.alias : [])
    .map((c: unknown) => String(c).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 5);
  // Opcional: reintentar solo algunos asistentes.
  const motores = (Array.isArray(body.motores) ? body.motores : []).filter((m: unknown): m is Motor =>
    MOTORES.includes(m as Motor),
  );

  if (!dominio || !marca || pregunta.length < 8) {
    return NextResponse.json({ error: 'dominio, marca y pregunta son obligatorios' }, { status: 400 });
  }

  const resultado = await analizarPregunta(
    pregunta,
    marca,
    alias,
    dominio,
    competidores,
    motores.length ? motores : MOTORES,
  );
  // Coste estimado de esta pregunta: consultas a los asistentes + análisis.
  const porMotor: Record<string, number> = {};
  let analisis = 0;
  for (const r of resultado.resultados) {
    porMotor[r.motor] = redondear((porMotor[r.motor] || 0) + r.coste_usd);
    analisis += r.coste_analisis_usd;
  }
  const total = redondear(Object.values(porMotor).reduce((a, b) => a + b, 0) + analisis);
  if (total > 0) {
    await guardarRegistroCoste({
      tipo_operacion: 'radiografia_express',
      agente: 'radiografia_pregunta',
      modelo: 'varios',
      unidades: resultado.resultados.length,
      coste_usd: total,
      metadatos: { dominio, pregunta, por_motor: porMotor, analisis: redondear(analisis) },
    });
  }

  return NextResponse.json(resultado);
}
