/**
 * Radiografía Express — agregados para la pantalla de resultado.
 * Funciones puras (sin red ni estado): se usan en el cliente.
 */

import { MOTORES, MOTOR_LABEL, SIN_RESUMEN_IA } from './types';
import type { Motor, ResultadoMotor, ResultadoPregunta, TipoFuente } from './types';

export interface DatosMotor {
  motor: Motor;
  /** null si el asistente no dio ninguna respuesta */
  nota: number | null;
  respondidas: number;
  mencionadas: number;
  primeras: number;
  /** Fallos reales (sin saldo, saturación, caída) */
  fallidas: number;
  /** Búsquedas en las que Google respondió pero no mostró resumen de IA (no es un fallo) */
  sinResumen: number;
  error: string | null;
}

export interface FilaRanking {
  nombre: string;
  veces: number;
  propio: boolean;
  indicado: boolean;
}

export interface GrupoFuentes {
  tipo: TipoFuente;
  citas: number;
  dominios: Array<{ dominio: string; citas: number }>;
}

export interface Agregado {
  notaGlobal: number;
  apariciones: number;
  totalValidas: number;
  sinObtener: number;
  motores: DatosMotor[];
  ranking: FilaRanking[];
  /** Puesto de la marca en el ranking (1 = la más citada); null si no aparece */
  puestoPropio: number | null;
  fuentes: Array<{ dominio: string; citas: number }>;
  grupos: GrupoFuentes[];
  titular: string;
  subtitular: string;
}

function media(valores: number[]): number {
  return valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0;
}

/**
 * Clave para reconocer el mismo negocio escrito de formas distintas:
 * "Estrellas & Huellas", "Estrellas&Huellas (galicia.pet)" y "Estrellas y Huellas S.L."
 * dan la misma clave.
 */
export function claveNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?|s\.?\s?c\.?)(?=\s|$)/g, ' ')
    .replace(/&|\by\b|\band\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

export function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

const ORDINAL = (n: number) => `${n}.º`;

function titularDe(motores: DatosMotor[], totalValidas: number): string {
  const conDatos = motores.filter((m) => m.respondidas > 0);
  if (conDatos.length === 0) return 'Ningún asistente respondió. Vuelve a intentarlo.';

  const ratio = (m: DatosMotor) => m.mencionadas / m.respondidas;
  const mejor = [...conDatos].sort((a, b) => ratio(b) - ratio(a) || b.respondidas - a.respondidas)[0];
  const peor = [...conDatos].sort((a, b) => ratio(a) - ratio(b) || b.respondidas - a.respondidas)[0];

  if (mejor.mencionadas === 0) {
    return `Ningún asistente te recomienda en las ${totalValidas} respuestas obtenidas.`;
  }

  const frase = (m: DatosMotor) =>
    `${MOTOR_LABEL[m.motor]} te recomienda en ${m.mencionadas} de ${m.respondidas} ${m.respondidas === 1 ? 'pregunta' : 'preguntas'}.`;

  if (conDatos.length === 1 || mejor.motor === peor.motor || ratio(mejor) === ratio(peor)) return frase(mejor);
  if (peor.mencionadas === 0) return `${frase(mejor)} ${MOTOR_LABEL[peor.motor]}, en ninguna.`;
  return `${frase(mejor)} ${MOTOR_LABEL[peor.motor]}, en ${peor.mencionadas} de ${peor.respondidas}.`;
}

export function agregar(
  preguntas: ResultadoPregunta[],
  marca: string,
  alias: string[],
  dominio: string,
  tiposFuente: Record<string, TipoFuente>,
  motoresActivos: Motor[] = MOTORES,
): Agregado {
  const todos: ResultadoMotor[] = preguntas.flatMap((p) => p.resultados);
  const validos = todos.filter((r) => !r.error);

  // ── Por asistente ─────────────────────────────────────────────────────────
  const motores: DatosMotor[] = motoresActivos.map((motor) => {
    const del = todos.filter((r) => r.motor === motor);
    const ok = del.filter((r) => !r.error);
    const sinResumen = del.filter((r) => r.error?.startsWith(SIN_RESUMEN_IA)).length;
    const fallo = del.find((r) => r.error && !r.error.startsWith(SIN_RESUMEN_IA)) || del.find((r) => r.error);
    return {
      motor,
      nota: ok.length ? media(ok.map((r) => r.score)) : null,
      respondidas: ok.length,
      mencionadas: ok.filter((r) => r.marca_mencionada).length,
      primeras: ok.filter((r) => r.marca_mencionada && r.posicion === 1).length,
      fallidas: del.length - ok.length - sinResumen,
      sinResumen,
      error: fallo?.error || null,
    };
  });

  // ── Ranking de negocios, con las variantes del nombre unificadas ──────────
  // No se usa el nombre del dominio como clave: suele ser genérico ("galicia")
  // y confundía a competidores como "PIP Galicia" con la marca.
  const clavesPropias = new Set([marca, ...alias].map(claveNombre).filter((c) => c.length > 2));
  const esPropio = (nombre: string, flag: boolean) => {
    if (flag) return true;
    const c = claveNombre(nombre);
    if (!c) return false;
    for (const p of Array.from(clavesPropias)) {
      if (c === p || (p.length >= 8 && c.includes(p)) || (c.length >= 8 && p.includes(c))) return true;
    }
    return false;
  };

  const apariciones = validos.filter((r) => r.marca_mencionada).length;
  const conteo = new Map<string, FilaRanking & { variantes: Map<string, number> }>();

  for (const r of validos) {
    const vistos = new Set<string>();
    for (const n of r.negocios) {
      if (esPropio(n.nombre, n.es_marca)) continue; // la marca se cuenta aparte, por respuesta
      const clave = claveNombre(n.nombre);
      if (!clave || vistos.has(clave)) continue;
      vistos.add(clave);
      const fila = conteo.get(clave);
      if (fila) {
        fila.veces += 1;
        fila.indicado = fila.indicado || n.es_competidor_indicado;
        fila.variantes.set(n.nombre, (fila.variantes.get(n.nombre) || 0) + 1);
      } else {
        conteo.set(clave, {
          nombre: n.nombre,
          veces: 1,
          propio: false,
          indicado: n.es_competidor_indicado,
          variantes: new Map([[n.nombre, 1]]),
        });
      }
    }
  }

  const ajenos: FilaRanking[] = Array.from(conteo.values()).map((f) => {
    // Se muestra la variante más repetida; a igualdad, la más corta.
    const nombre = Array.from(f.variantes.entries()).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    return { nombre, veces: f.veces, propio: false, indicado: f.indicado };
  });

  const ranking: FilaRanking[] = [
    ...ajenos,
    ...(apariciones > 0 ? [{ nombre: marca, veces: apariciones, propio: true, indicado: false }] : []),
  ]
    .sort((a, b) => b.veces - a.veces || Number(b.propio) - Number(a.propio))
    .slice(0, 8);

  const idxPropio = ranking.findIndex((f) => f.propio);
  const puestoPropio = idxPropio === -1 ? null : ranking.filter((f) => f.veces > ranking[idxPropio].veces).length + 1;

  // ── Fuentes ───────────────────────────────────────────────────────────────
  const citas = new Map<string, number>();
  for (const r of validos) {
    const vistos = new Set<string>();
    for (const f of r.fuentes) {
      // Gemini devuelve URLs de redirección: el dominio real viene en el título.
      const d = r.motor === 'gemini' && f.titulo ? f.titulo.toLowerCase().replace(/^www\./, '') : dominioDe(f.url);
      if (!d || vistos.has(d)) continue;
      vistos.add(d);
      citas.set(d, (citas.get(d) || 0) + 1);
    }
  }
  const fuentes = Array.from(citas.entries())
    .map(([d, n]) => ({ dominio: d, citas: n }))
    .sort((a, b) => b.citas - a.citas);

  const porTipo = new Map<TipoFuente, GrupoFuentes>();
  for (const f of fuentes) {
    const tipo: TipoFuente = f.dominio.includes(dominio.toLowerCase()) ? 'propia' : tiposFuente[f.dominio] || 'otro';
    const g = porTipo.get(tipo) || { tipo, citas: 0, dominios: [] };
    g.citas += f.citas;
    g.dominios.push(f);
    porTipo.set(tipo, g);
  }
  const grupos = Array.from(porTipo.values()).sort((a, b) => b.citas - a.citas);

  // ── Titular ───────────────────────────────────────────────────────────────
  const totalValidas = validos.length;
  let subtitular = '';
  if (totalValidas > 0) {
    subtitular = `Apareces en ${apariciones} de las ${totalValidas} respuestas obtenidas`;
    if (puestoPropio !== null && ranking.length > 1) {
      const delante = ranking.filter((f) => !f.propio && f.veces > apariciones).map((f) => f.nombre);
      subtitular +=
        puestoPropio === 1
          ? ' y eres el negocio más citado.'
          : ` y eres el ${ORDINAL(puestoPropio)} negocio más citado, por detrás de ${delante.slice(0, 2).join(' y ')}.`;
    } else {
      subtitular += '.';
    }
  }

  return {
    notaGlobal: media(validos.map((r) => r.score)),
    apariciones,
    totalValidas,
    sinObtener: motores.reduce((n, m) => n + m.fallidas, 0),
    motores,
    ranking,
    puestoPropio,
    fuentes,
    grupos,
    titular: titularDe(motores, totalValidas),
    subtitular,
  };
}
