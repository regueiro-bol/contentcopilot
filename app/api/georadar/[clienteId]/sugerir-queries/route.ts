import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(
  req: NextRequest,
  { params }: { params: { clienteId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: cliente } = await supabase
    .from('clientes')
    .select('nombre, sector, descripcion')
    .eq('id', params.clienteId)
    .single();

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  const prompt = `Eres un experto en GEO (Generative Engine Optimization).
Genera 10 queries que un usuario podría hacer a ChatGPT, Gemini o Perplexity cuando busca información relacionada con este cliente.

Cliente: ${cliente.nombre}
Sector: ${cliente.sector}
Descripción: ${cliente.descripcion || 'No disponible'}

Las queries deben ser naturales, como las haría un usuario real.
Mezcla queries de: marca directa, categoría/sector, problema que resuelve, comparativas.

Devuelve SOLO JSON sin markdown:
{
  "queries": [
    {"query": "...", "categoria": "marca|categoria|competidor|producto"},
    ...
  ]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  console.log('[GEORadar] sugerir-queries raw:', text.substring(0, 300));
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data = JSON.parse(clean);
    return NextResponse.json(data);
  } catch (e) {
    console.error('[GEORadar] Error parsing sugerir-queries:', e);
    return NextResponse.json({ queries: [] });
  }
}
