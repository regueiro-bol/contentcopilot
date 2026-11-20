import { createHash, randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { agregar } from '@/lib/georadar/radiografia/agregar';
import { MOTORES_CAPTACION, type Motor, type ResultadoPregunta } from '@/lib/georadar/radiografia/types';

/**
 * Radar Local: versión pública de la radiografía (3 preguntas genéricas a 4 asistentes).
 * Cada análisis cuesta dinero, así que todo pasa por un lead con token y por límites de uso.
 */

export const MOTORES_RADAR: Motor[] = MOTORES_CAPTACION;

/** Límites por día. Se pueden ajustar con variables de entorno sin tocar el código. */
const LIMITE_EMAIL = Number(process.env.RADAR_LIMITE_EMAIL || 2);
const LIMITE_IP = Number(process.env.RADAR_LIMITE_IP || 5);
const LIMITE_GLOBAL = Number(process.env.RADAR_LIMITE_DIARIO || 60);

export interface Lead {
  id: string;
  token: string;
  email: string;
  negocio: string;
  sector: string;
  ciudad: string;
  web: string | null;
  preguntas: string[];
  etiquetas: string[];
  nota: number | null;
  email_enviado: boolean;
}

export function ipDe(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida';
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`${ip}|${process.env.RADAR_SAL || 'radar-local'}`).digest('hex').slice(0, 32);
}

export function nuevoToken(): string {
  return randomBytes(24).toString('hex');
}

export function limpiar(valor: unknown, max: number): string {
  return String(valor ?? '')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 160;
}

/** Devuelve un mensaje para el usuario si se ha superado algún límite; null si puede seguir. */
export async function limiteSuperado(email: string, ipHash: string): Promise<string | null> {
  const supabase = createAdminClient();
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const contar = async (columna: 'email' | 'ip_hash' | null, valor?: string) => {
    let q = supabase.from('radar_leads').select('id', { count: 'exact', head: true }).gte('created_at', desde);
    if (columna && valor) q = q.eq(columna, valor);
    const { count } = await q;
    return count || 0;
  };
  const [porEmail, porIp, total] = await Promise.all([contar('email', email), contar('ip_hash', ipHash), contar(null)]);
  if (porEmail >= LIMITE_EMAIL) return 'Ya has hecho tu radar hoy. Revisa tu correo: ahí tienes el informe.';
  if (porIp >= LIMITE_IP) return 'Has alcanzado el máximo de análisis por hoy. Vuelve mañana o escríbenos.';
  if (total >= LIMITE_GLOBAL) return 'Hoy hemos recibido muchas peticiones. Vuelve a intentarlo mañana.';
  return null;
}

export async function leerLead(id: string, token: string): Promise<Lead | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{48}$/i.test(token)) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('radar_leads')
    .select('id, token, email, negocio, sector, ciudad, web, preguntas, etiquetas, nota, email_enviado')
    .eq('id', id)
    .maybeSingle();
  if (!data || data.token !== token) return null;
  return data as Lead;
}

export async function leerRespuestas(leadId: string): Promise<Array<{ i: number; resultado: ResultadoPregunta }>> {
  const supabase = createAdminClient();
  const { data } = await supabase.from('radar_respuestas').select('i, resultado').eq('lead_id', leadId).order('i');
  return (data || []) as Array<{ i: number; resultado: ResultadoPregunta }>;
}

/** Lo único que ve el navegador de cada respuesta: si sale el negocio y en qué puesto. */
export interface CeldaPublica {
  motor: Motor;
  estado: 'sale' | 'no_sale' | 'sin_respuesta';
  posicion: number | null;
}

export function celdasPublicas(r: ResultadoPregunta): CeldaPublica[] {
  return MOTORES_RADAR.map((motor) => {
    const x = r.resultados.find((y) => y.motor === motor);
    if (!x || x.error) return { motor, estado: 'sin_respuesta', posicion: null };
    return { motor, estado: x.marca_mencionada ? 'sale' : 'no_sale', posicion: x.marca_mencionada ? x.posicion : null };
  });
}

export function agregarRadar(lead: Lead, respuestas: ResultadoPregunta[]) {
  return agregar(respuestas, lead.negocio, [], lead.web || '', {}, MOTORES_RADAR);
}
