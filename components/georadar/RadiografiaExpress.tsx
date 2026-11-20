'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, AlertTriangle, Check, Loader2, Minus, Printer, RotateCcw, ScanSearch, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { agregar } from '@/lib/georadar/radiografia/agregar';
import { MOTOR_LABEL, SIN_RESUMEN_IA, TIPO_FUENTE_LABEL, motoresDe } from '@/lib/georadar/radiografia/types';
import type {
  Modo,
  Motor,
  Preparacion,
  ResultadoMotor,
  ResultadoPregunta,
  Resumen,
  TipoFuente,
} from '@/lib/georadar/radiografia/types';

const SECTORES_EJEMPLO = ['Óptica', 'Clínica dental', 'Centro de estética', 'Inmobiliaria', 'Taller mecánico', 'Fisioterapia'];

// Separación entre el lanzamiento de una pregunta y la siguiente, para no
// chocar con el límite de peticiones simultáneas de los proveedores.
const ESCALON_MS = 1500;

type Paso = 'formulario' | 'preguntas' | 'resultado';
type EstadoPregunta = 'pendiente' | 'ok' | 'error';

const COLOR_TIPO: Record<TipoFuente, string> = {
  prensa: '#1d4ed8',
  propia: '#7c3aed',
  competidor: '#c2410c',
  directorio: '#6b7280',
  otro: '#9ca3af',
};

const RAYADO = 'repeating-linear-gradient(135deg, #e5e7eb 0 6px, #f9fafb 6px 12px)';

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data as T;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function colorNota(n: number): { texto: string; barra: string } {
  if (n >= 60) return { texto: 'text-green-800', barra: '#16a34a' };
  if (n >= 30) return { texto: 'text-amber-800', barra: '#d97706' };
  return { texto: 'text-red-800', barra: '#dc2626' };
}

/** Mensaje corto y sin jerga a partir del error técnico de un asistente */
function motivoFallo(error: string | null): string {
  if (!error) return 'No respondió.';
  if (error.startsWith(SIN_RESUMEN_IA)) return `${error}.`;
  if (error.startsWith('DataForSEO')) return `No se pudo consultar Google (${error.slice(0, 120)}).`;
  if (error.includes('402') || /credit|billing|prepay/i.test(error)) return 'No respondió: la cuenta de la API no tiene saldo.';
  if (error.includes('429') || /rate limit/i.test(error)) return 'Rechazó la petición por exceso de consultas simultáneas.';
  if (/no configurada/i.test(error)) return 'Falta configurar su clave de API.';
  if (/timeout|aborted/i.test(error)) return 'Tardó demasiado en responder.';
  return 'No respondió por un error del proveedor.';
}

/** Quita el ruido de seguimiento de los enlaces para que la respuesta se lea limpia */
function limpiarRespuesta(texto: string): string {
  return texto.replace(/[?&]utm_source=[a-z0-9_.-]+/gi, '');
}

function CeldaMatriz({ estado, r }: { estado: EstadoPregunta | undefined; r: ResultadoMotor | undefined }) {
  const base = 'h-[52px] rounded-[10px] flex items-center justify-center';
  if (!r && estado === 'pendiente') {
    return <div className={`${base} bg-gray-50`}><Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label="Preguntando" /></div>;
  }
  if (r?.error?.startsWith(SIN_RESUMEN_IA)) {
    return <div className={`${base} bg-gray-100 px-1 text-center text-xs font-medium leading-tight text-gray-700`} title={r.error}>Sin resumen de IA</div>;
  }
  if (!r || r.error) {
    return <div className={`${base} text-xs font-medium text-gray-700`} style={{ background: RAYADO }} title={r?.error || undefined}>Sin respuesta</div>;
  }
  if (r.marca_mencionada) {
    return (
      <div className={`${base} text-lg font-bold ${r.posicion === 1 ? 'bg-green-200 text-green-900' : 'bg-green-100 text-green-800'}`}>
        {r.posicion ? `${r.posicion}.º` : 'Sí'}
      </div>
    );
  }
  return <div className={`${base} bg-red-100 text-[13px] font-semibold text-red-800`}>No apareces</div>;
}

function RespuestaMotorCard({ r, fecha }: { r: ResultadoMotor; fecha: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="flex-1 basis-[420px] min-w-0 rounded-xl border border-gray-200 p-4 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-gray-900">{MOTOR_LABEL[r.motor]}</span>
        {r.marca_mencionada ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
            Te recomienda{r.posicion ? `, ${r.posicion}.º` : ''}
          </span>
        ) : (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">No apareces</span>
        )}
        <span className="text-xs text-gray-600">
          {new Date(fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
          {r.modelo ? ` · ${r.modelo}` : ''}
        </span>
      </div>
      {r.resumen && <p className="text-sm leading-relaxed text-gray-700">{r.resumen}</p>}
      {abierta && (
        <div className="rx-respuesta max-w-none overflow-x-auto border-t border-gray-100 pt-3 text-sm leading-relaxed text-gray-700">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: (p) => <p className="mt-3 text-sm font-semibold text-gray-900" {...p} />,
              h2: (p) => <p className="mt-3 text-sm font-semibold text-gray-900" {...p} />,
              h3: (p) => <p className="mt-3 text-sm font-semibold text-gray-900" {...p} />,
              p: (p) => <p className="mt-2" {...p} />,
              ul: (p) => <ul className="mt-2 list-disc space-y-1 pl-5" {...p} />,
              ol: (p) => <ol className="mt-2 list-decimal space-y-1 pl-5" {...p} />,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-700 underline underline-offset-2">
                  {children}
                </a>
              ),
              table: (p) => <table className="mt-3 w-full border-collapse text-xs" {...p} />,
              th: (p) => <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold" {...p} />,
              td: (p) => <td className="border border-gray-200 px-2 py-1 align-top" {...p} />,
              hr: () => <hr className="my-3 border-gray-100" />,
            }}
          >
            {limpiarRespuesta(r.respuesta)}
          </ReactMarkdown>
        </div>
      )}
      <Button variant="outline" size="sm" onClick={() => setAbierta((v) => !v)} className="print:hidden">
        {abierta ? 'Ocultar respuesta completa' : 'Ver respuesta completa'}
      </Button>
    </div>
  );
}

export function RadiografiaExpress() {
  const [paso, setPaso] = useState<Paso>('formulario');
  const [dominio, setDominio] = useState('');
  const [sector, setSector] = useState('');
  const [zona, setZona] = useState('');
  const [modo, setModo] = useState<Modo>('captacion');
  const MOTORES = motoresDe(modo);
  const [competidor1, setCompetidor1] = useState('');
  const [competidor2, setCompetidor2] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prep, setPrep] = useState<Preparacion | null>(null);
  const [marca, setMarca] = useState('');
  const [aliasTexto, setAliasTexto] = useState('');
  const [preguntas, setPreguntas] = useState<string[]>([]);
  const [etiquetas, setEtiquetas] = useState<string[]>([]);

  const [estados, setEstados] = useState<EstadoPregunta[]>([]);
  const [resultados, setResultados] = useState<(ResultadoPregunta | null)[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [resumiendo, setResumiendo] = useState(false);
  const [reintentando, setReintentando] = useState<number | null>(null);

  const competidores = [competidor1, competidor2].map((c) => c.trim()).filter(Boolean);
  const alias = aliasTexto.split(',').map((a) => a.trim()).filter(Boolean).slice(0, 5);
  const hechos = resultados.filter((r): r is ResultadoPregunta => r !== null);
  const enCurso = estados.some((e) => e === 'pendiente');

  const agg = useMemo(
    () => agregar(hechos, marca.trim(), alias, prep?.dominio || '', resumen?.tipos_fuente || {}, MOTORES),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resultados, marca, aliasTexto, prep, resumen, modo],
  );

  async function preparar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const p = await post<Preparacion>('/api/georadar/radiografia/preparar', { dominio, sector, zona, modo });
      setPrep(p);
      setMarca(p.marca);
      setAliasTexto((p.alias || []).join(', '));
      setPreguntas(p.preguntas);
      setEtiquetas(p.etiquetas || []);
      setPaso('preguntas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar la radiografía');
    } finally {
      setCargando(false);
    }
  }

  function cuerpoPregunta(pregunta: string, motores?: Motor[]) {
    return {
      dominio: prep!.dominio,
      marca: marca.trim(),
      alias,
      competidores,
      pregunta,
      motores: motores || MOTORES,
    };
  }

  async function pedirResumen(validos: ResultadoPregunta[]) {
    if (!prep || validos.length === 0) return;
    setResumiendo(true);
    try {
      // Se envían los resultados sin el texto completo de las respuestas para aligerar la petición.
      const compactos = validos.map((p) => ({
        ...p,
        resultados: p.resultados.map((r) => ({ ...r, respuesta: '', resumen: '' })),
      }));
      const dominios = agregar(validos, marca.trim(), alias, prep.dominio, {}, MOTORES).fuentes.map((f) => f.dominio);
      const res = await post<Resumen>('/api/georadar/radiografia/resumen', {
        dominio: prep.dominio,
        marca: marca.trim(),
        descripcion: prep.descripcion,
        web_legible: prep.web_legible,
        preguntas: compactos,
        dominios,
        paginas: prep.paginas || [],
      });
      setResumen(res);
    } catch {
      setResumen(null);
    } finally {
      setResumiendo(false);
    }
  }

  async function lanzar() {
    if (!prep) return;
    const pares = preguntas
      .map((p, i) => ({ p: p.trim(), e: etiquetas[i] || '' }))
      .filter((x) => x.p.length >= 8);
    if (pares.length === 0 || !marca.trim()) {
      setError('Hace falta el nombre de la marca y al menos una pregunta.');
      return;
    }
    const lista = pares.map((x) => x.p);
    setError(null);
    setPreguntas(lista);
    setEtiquetas(pares.map((x) => x.e));
    setResumen(null);
    setEstados(lista.map(() => 'pendiente'));
    setResultados(lista.map(() => null));
    setPaso('resultado');

    const finales = await Promise.all(
      lista.map(async (pregunta, i) => {
        await esperar(i * ESCALON_MS);
        try {
          const r = await post<ResultadoPregunta>('/api/georadar/radiografia/pregunta', cuerpoPregunta(pregunta));
          setResultados((prev) => prev.map((x, j) => (j === i ? r : x)));
          setEstados((prev) => prev.map((x, j) => (j === i ? 'ok' : x)));
          return r;
        } catch {
          setEstados((prev) => prev.map((x, j) => (j === i ? 'error' : x)));
          return null;
        }
      }),
    );

    await pedirResumen(finales.filter((r): r is ResultadoPregunta => r !== null));
  }

  /** Vuelve a preguntar solo a los asistentes que fallaron en una pregunta */
  async function reintentar(i: number) {
    const actual = resultados[i];
    if (!actual || !prep) return;
    const fallidos = actual.resultados
      .filter((r) => r.error && !r.error.startsWith(SIN_RESUMEN_IA))
      .map((r) => r.motor);
    if (fallidos.length === 0) return;
    setReintentando(i);
    try {
      const nuevo = await post<ResultadoPregunta>(
        '/api/georadar/radiografia/pregunta',
        cuerpoPregunta(actual.pregunta, fallidos),
      );
      const fusion: ResultadoPregunta = {
        ...actual,
        resultados: actual.resultados.map((r) => nuevo.resultados.find((n) => n.motor === r.motor && !n.error) || r),
      };
      const siguientes = resultados.map((x, j) => (j === i ? fusion : x));
      setResultados(siguientes);
      await pedirResumen(siguientes.filter((r): r is ResultadoPregunta => r !== null));
    } catch {
      /* se deja como estaba */
    } finally {
      setReintentando(null);
    }
  }

  function reiniciar() {
    setPaso('formulario');
    setPrep(null);
    setResultados([]);
    setEstados([]);
    setResumen(null);
    setError(null);
  }

  // Coste estimado del informe (dato interno: no se imprime en el PDF).
  const coste = useMemo(() => {
    const porMotor = {} as Record<Motor, number>;
    let analisis = 0;
    for (const p of hechos) {
      for (const r of p.resultados) {
        porMotor[r.motor] = (porMotor[r.motor] || 0) + (r.coste_usd || 0);
        analisis += r.coste_analisis_usd || 0;
      }
    }
    const redaccion = (prep?.coste_usd || 0) + (resumen?.coste_usd || 0);
    const total = Object.values(porMotor).reduce((a, b) => a + b, 0) + analisis + redaccion;
    return { porMotor, analisis, redaccion, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultados, prep, resumen]);
  const usd = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: n < 0.1 ? 3 : 2 })} $`;

  const circunferencia = 2 * Math.PI * 50;
  const totalCitas = agg.grupos.reduce((n, g) => n + g.citas, 0);
  const hayTipos = agg.grupos.some((g) => g.tipo !== 'otro' && g.tipo !== 'propia');
  const maxRanking = Math.max(agg.totalValidas, 1);

  return (
    <div className="p-6 space-y-6 max-w-[1168px]">
      <div className="flex items-center gap-3 print:hidden">
        <Link href="/georadar" className="text-gray-500 hover:text-gray-700" aria-label="Volver a GEORadar">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="p-2 bg-violet-100 rounded-lg">
          <ScanSearch className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Radiografía Express</h1>
          <p className="text-sm text-gray-600">
            ¿Recomiendan ChatGPT, Gemini, Perplexity y Google a este negocio, o a su competencia?
          </p>
        </div>
        <Badge variant="warning" className="ml-auto">Demo interna</Badge>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {/* ── Paso 1: datos del negocio ─────────────────────────────────────── */}
      {paso === 'formulario' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <form onSubmit={preparar} className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-gray-900">Tipo de radiografía</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(
                  [
                    ['captacion', 'Demo de captación', '3 preguntas genéricas (solo sector y ciudad) a 4 asistentes: ChatGPT, Gemini, Perplexity y Google Modo IA. Rápida y barata.'],
                    ['completa', 'Informe completo', '5 preguntas a medida de la web a los 6 asistentes, con Claude y Google AI Overviews. Uso interno.'],
                  ] as Array<[Modo, string, string]>
                ).map(([valor, titulo, texto]) => (
                  <label
                    key={valor}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${modo === valor ? 'border-violet-600 bg-violet-50' : 'border-gray-200 bg-white'}`}
                  >
                    <input
                      type="radio"
                      name="rx-modo"
                      value={valor}
                      checked={modo === valor}
                      onChange={() => setModo(valor)}
                      className="mt-1 h-4 w-4 accent-violet-600"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{titulo}</span>
                      <span className="block text-[13px] leading-snug text-gray-600">{texto}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rx-dominio">Dominio *</Label>
                <Input id="rx-dominio" required placeholder="tunegocio.es" value={dominio} onChange={(e) => setDominio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rx-sector">A qué se dedica{modo === 'captacion' ? ' *' : ''}</Label>
                <Input id="rx-sector" required={modo === 'captacion'} placeholder="Óptica" value={sector} onChange={(e) => setSector(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rx-zona">Ciudad o zona</Label>
                <Input id="rx-zona" placeholder="Ourense" value={zona} onChange={(e) => setZona(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-600">Prueba:</span>
              {SECTORES_EJEMPLO.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSector(s)}
                  className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rx-c1">Competidor 1 (opcional)</Label>
                <Input id="rx-c1" placeholder="Nombre del negocio" value={competidor1} onChange={(e) => setCompetidor1(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rx-c2">Competidor 2 (opcional)</Label>
                <Input id="rx-c2" placeholder="Nombre del negocio" value={competidor2} onChange={(e) => setCompetidor2(e.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={cargando}>
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
              {cargando ? 'Leyendo la web…' : 'Preparar preguntas'}
            </Button>
          </form>
        </div>
      )}

      {/* ── Paso 2: revisar marca y preguntas ─────────────────────────────── */}
      {paso === 'preguntas' && prep && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rx-marca">Nombre comercial detectado en {prep.dominio}</Label>
              <Input id="rx-marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rx-alias">Otros nombres del negocio (separados por comas)</Label>
              <Input id="rx-alias" placeholder="Nombre del dominio, variantes…" value={aliasTexto} onChange={(e) => setAliasTexto(e.target.value)} />
            </div>
          </div>
          {prep.descripcion && <p className="text-xs text-gray-600">{prep.descripcion}</p>}
          {!prep.web_legible && (
            <p className="text-xs text-amber-800 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> No se pudo leer la web automáticamente. Revisa el nombre del negocio.
            </p>
          )}
          <div className="space-y-2">
            <Label>Preguntas que se lanzarán a los {MOTORES.length} asistentes</Label>
            {preguntas.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                {etiquetas[i] && (
                  <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-violet-700">{etiquetas[i]}</span>
                )}
                <Input
                  value={p}
                  aria-label={`Pregunta ${i + 1}`}
                  onChange={(e) => setPreguntas((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </div>
            ))}
            <p className="text-xs text-gray-600">Puedes editarlas. Deja una vacía para no lanzarla.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={lanzar}>Lanzar radiografía</Button>
            <Button variant="outline" onClick={reiniciar}>Volver</Button>
          </div>
        </div>
      )}

      {/* ── Paso 3: resultado ─────────────────────────────────────────────── */}
      {paso === 'resultado' && prep && (
        <div className="space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-violet-700">Radiografía Express</p>
              <h2 className="text-[28px] font-bold leading-tight text-gray-900">{marca}</h2>
              <p className="text-sm text-gray-600">
                {prep.dominio}
                {sector ? ` · ${sector}` : ''}
                {zona ? ` · ${zona}` : ''} · {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="outline" onClick={() => window.print()} disabled={enCurso}>
                <Printer className="h-4 w-4" /> Guardar PDF
              </Button>
              <Button onClick={reiniciar} disabled={enCurso}>
                <RotateCcw className="h-4 w-4" /> Nueva radiografía
              </Button>
            </div>
          </header>

          {enCurso && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preguntando a los asistentes… {estados.filter((e) => e !== 'pendiente').length} de {estados.length} preguntas
            </div>
          )}

          {/* Veredicto */}
          {hechos.length > 0 && (
            <section aria-label="Veredicto" className="flex flex-wrap items-center gap-8 rounded-2xl border border-gray-200 bg-white p-7">
              <div className="relative h-[168px] w-[168px] shrink-0">
                <svg viewBox="0 0 120 120" role="img" aria-label={`Nota de visibilidad en IA: ${agg.notaGlobal} sobre 100`} className="h-full w-full -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#ede9fe" strokeWidth="11" />
                  <circle
                    cx="60" cy="60" r="50" fill="none" stroke="#7c3aed" strokeWidth="11" strokeLinecap="round"
                    strokeDasharray={circunferencia}
                    strokeDashoffset={circunferencia - (agg.notaGlobal / 100) * circunferencia}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-bold leading-none text-gray-900">{agg.notaGlobal}</span>
                  <span className="text-[13px] text-gray-600">de 100</span>
                </div>
              </div>
              <div className="min-w-0 flex-[999_1_420px] space-y-3">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-gray-600">Veredicto</p>
                <p className="text-[26px] font-bold leading-tight text-gray-900">{agg.titular}</p>
                <p className="text-base leading-relaxed text-gray-700">{agg.subtitular}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[13px] font-medium text-gray-700">
                    {hechos.length} {hechos.length === 1 ? 'pregunta' : 'preguntas'} de comprador
                  </span>
                  <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[13px] font-medium text-gray-700">
                    {MOTORES.length} asistentes consultados
                  </span>
                  {agg.sinObtener > 0 && !enCurso && (
                    <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[13px] font-medium text-amber-900">
                      {agg.sinObtener} {agg.sinObtener === 1 ? 'respuesta' : 'respuestas'} sin obtener
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Nota por asistente */}
          {hechos.length > 0 && (
            <section aria-label="Nota por asistente" className="flex flex-wrap gap-4">
              {agg.motores.map((m) => {
                const sinDatos = m.nota === null;
                const c = colorNota(m.nota ?? 0);
                return (
                  <div
                    key={m.motor}
                    className={`flex-1 basis-[300px] space-y-3 rounded-2xl bg-white p-5 ${sinDatos ? 'border border-dashed border-gray-400' : 'border border-gray-200'}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-base font-semibold text-gray-900">{MOTOR_LABEL[m.motor]}</h3>
                      {sinDatos ? (
                        <span className="text-base font-semibold text-gray-600">Sin datos</span>
                      ) : (
                        <span className={`text-[28px] font-bold leading-none ${c.texto}`}>{m.nota}</span>
                      )}
                    </div>
                    {sinDatos ? (
                      <div className="h-2.5 rounded-full" style={{ background: RAYADO }} />
                    ) : (
                      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(m.nota ?? 0, 2)}%`, background: c.barra }} />
                      </div>
                    )}
                    <p className="text-sm text-gray-700">
                      {sinDatos
                        ? enCurso
                          ? 'Esperando respuesta…'
                          : m.fallidas === 0 && m.sinResumen > 0
                            ? 'Google no mostró resumen de IA en ninguna de estas búsquedas. No cuenta en la nota.'
                            : `${motivoFallo(m.error)} No cuenta en la nota.`
                        : m.mencionadas === 0
                          ? `No te menciona en ${m.respondidas === 1 ? 'la respuesta que dio' : `las ${m.respondidas} respuestas que dio`}.`
                          : `Te recomienda en ${m.mencionadas} de ${m.respondidas} ${m.respondidas === 1 ? 'pregunta' : 'preguntas'}${m.primeras > 0 ? `, ${m.primeras === 1 ? 'una vez' : `${m.primeras} veces`} en primer lugar` : ''}.`}
                      {!sinDatos && m.fallidas > 0 && !enCurso ? ` ${m.fallidas === 1 ? 'Otra no llegó' : `Otras ${m.fallidas} no llegaron`}.` : ''}
                      {!sinDatos && m.sinResumen > 0 && !enCurso
                        ? ` En ${m.sinResumen === 1 ? 'otra búsqueda' : `otras ${m.sinResumen} búsquedas`} Google no mostró resumen de IA.`
                        : ''}
                    </p>
                  </div>
                );
              })}
            </section>
          )}

          {/* Matriz pregunta × asistente */}
          <section aria-label="Pregunta por pregunta" className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl font-bold text-gray-900">¿Te recomiendan cuando un cliente pregunta?</h2>
              <div className="flex flex-wrap gap-3 text-[13px] text-gray-700">
                <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-green-600 bg-green-200" />Te recomienda (puesto)</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-red-600 bg-red-200" />No apareces</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-gray-400" style={{ background: RAYADO }} />Sin respuesta</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-gray-400 bg-gray-100" />Google no mostró resumen</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-separate text-sm" style={{ borderSpacing: '0 8px' }}>
                <thead>
                  <tr>
                    <th scope="col" className="pb-1 pr-3 text-left text-[13px] font-semibold text-gray-600">Pregunta</th>
                    {MOTORES.map((m) => (
                      <th key={m} scope="col" className="w-[100px] px-1 pb-1 align-bottom text-xs font-semibold leading-tight text-gray-600">{MOTOR_LABEL[m]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preguntas.map((p, i) => (
                    <tr key={i}>
                      <th scope="row" className="pr-3 text-left font-normal text-gray-900">
                        {etiquetas[i] && (
                          <span className="block text-xs font-semibold uppercase tracking-wide text-violet-700">{etiquetas[i]}</span>
                        )}
                        {p}
                      </th>
                      {MOTORES.map((m) => (
                        <td key={m} className="px-1">
                          <CeldaMatriz estado={estados[i]} r={resultados[i]?.resultados.find((x) => x.motor === m)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {hechos.length > 0 && (
            <div className="flex flex-wrap gap-4">
              {/* Competidores */}
              <section aria-label="A quién recomienda la IA" className="min-w-0 flex-1 basis-[480px] space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-gray-900">A quién recomienda la IA</h2>
                  <p className="text-sm text-gray-600">Respuestas en las que aparece cada negocio, de {agg.totalValidas}.</p>
                </div>
                {agg.ranking.length === 0 && <p className="text-sm text-gray-600">No se detectaron negocios concretos.</p>}
                <div className="space-y-3">
                  {agg.ranking.map((n) => (
                    <div key={n.nombre} className={`space-y-1 ${n.propio ? '-mx-3 rounded-[10px] bg-violet-50 px-3 py-2.5' : ''}`}>
                      <div className={`flex justify-between gap-2 text-sm ${n.propio ? 'font-bold text-violet-900' : 'text-gray-900'}`}>
                        <span>
                          {n.nombre}{' '}
                          {n.propio && <span className="rounded-full bg-violet-700 px-2 py-0.5 text-xs font-semibold text-white">Tú</span>}
                          {!n.propio && n.indicado && (
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900">Competidor indicado</span>
                          )}
                        </span>
                        <span className="font-semibold">{n.veces}</span>
                      </div>
                      <div className={`h-3.5 rounded-md ${n.propio ? 'bg-violet-200' : 'bg-gray-100'}`}>
                        <div
                          className="h-full rounded-md"
                          style={{
                            width: `${(n.veces / maxRanking) * 100}%`,
                            background: n.propio ? '#7c3aed' : n.indicado ? '#c2410c' : '#6b7280',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {agg.apariciones === 0 && agg.ranking.length > 0 && (
                  <p className="text-[13px] text-gray-600">Tu negocio no aparece en ninguna respuesta, por eso no está en la lista.</p>
                )}
              </section>

              {/* Fuentes */}
              <section aria-label="De dónde saca la información" className="min-w-0 flex-1 basis-[480px] space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-gray-900">De dónde saca la información</h2>
                  <p className="text-sm text-gray-600">
                    {hayTipos ? 'Veces que los asistentes citan cada tipo de fuente.' : 'Webs que más citan los asistentes.'}
                  </p>
                </div>
                {agg.fuentes.length === 0 && <p className="text-sm text-gray-600">Los asistentes no citaron fuentes.</p>}
                {hayTipos ? (
                  <>
                    <div
                      className="flex h-9 overflow-hidden rounded-[10px]"
                      role="img"
                      aria-label={agg.grupos.map((g) => `${TIPO_FUENTE_LABEL[g.tipo]}: ${g.citas} citas`).join(', ')}
                    >
                      {agg.grupos.map((g, i) => (
                        <div
                          key={g.tipo}
                          style={{ width: `${(g.citas / Math.max(totalCitas, 1)) * 100}%`, background: COLOR_TIPO[g.tipo], borderLeft: i ? '2px solid #fff' : undefined }}
                        />
                      ))}
                    </div>
                    <div className="space-y-3">
                      {agg.grupos.map((g) => (
                        <div key={g.tipo} className="flex items-start gap-3">
                          <span className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded" style={{ background: COLOR_TIPO[g.tipo] }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900">{TIPO_FUENTE_LABEL[g.tipo]} · {g.citas}</p>
                            <p className="break-words text-[13px] text-gray-600">{g.dominios.slice(0, 6).map((d) => d.dominio).join(', ')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <ul className="space-y-1.5">
                    {agg.fuentes.slice(0, 10).map((f) => (
                      <li key={f.dominio} className="flex items-center justify-between text-sm">
                        <span className={f.dominio.includes(prep.dominio) ? 'font-semibold text-violet-800' : 'text-gray-800'}>{f.dominio}</span>
                        <span className="text-gray-600">{f.citas}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {/* Qué arreglar primero: solo si hay contenido o se está generando */}
          {(resumiendo || (resumen && (resumen.arreglos.length > 0 || resumen.diagnostico))) && (
            <section aria-label="Qué arreglar primero" className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Qué arreglar primero</h2>
              {resumiendo && (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" /> Redactando el diagnóstico…
                </p>
              )}
              {!resumiendo && resumen?.diagnostico && <p className="text-base leading-relaxed text-gray-700">{resumen.diagnostico}</p>}
              {!resumiendo && resumen && resumen.arreglos.length > 0 && (
                <div className="flex flex-wrap gap-4">
                  {resumen.arreglos.map((a, i) => (
                    <article key={i} className="flex-1 basis-[300px] space-y-2.5 rounded-2xl border border-gray-200 bg-white p-5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-[15px] font-bold text-white">{i + 1}</span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            a.prioridad === 'alta' ? 'bg-red-100 text-red-800' : a.prioridad === 'media' ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          Prioridad {a.prioridad}
                        </span>
                      </div>
                      <h3 className="text-[17px] font-semibold leading-snug text-gray-900">{a.titulo}</h3>
                      <p className="text-sm leading-relaxed text-gray-700">{a.detalle}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Base técnica */}
          <section aria-label="Base técnica de la web" className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-xl font-bold text-gray-900">Base técnica de la web</h2>
            {!prep.web_legible && (
              <p className="text-sm text-amber-800">
                No se pudo leer la web automáticamente{prep.web_error ? ` (${prep.web_error})` : ''}, así que no se han podido hacer estas comprobaciones.
              </p>
            )}
            <div className="flex flex-wrap gap-4">
              {(() => {
                const bloqueados = prep.tecnico.bots_bloqueados;
                const hayBloqueo = !!bloqueados?.length;
                const haySchema = prep.tecnico.schema_tipos.length > 0;
                const sinComprobar = 'No se pudo comprobar.';
                const filas = [
                  {
                    ok: !hayBloqueo,
                    neutro: bloqueados === null,
                    titulo: 'Rastreadores de IA',
                    texto:
                      bloqueados === null
                        ? prep.web_legible
                          ? 'No se pudo leer el archivo robots.txt.'
                          : sinComprobar
                        : hayBloqueo
                          ? `robots.txt bloquea a ${bloqueados.join(', ')}.`
                          : 'robots.txt no bloquea a ninguno: pueden leer la web.',
                  },
                  {
                    ok: haySchema,
                    neutro: !prep.web_legible,
                    titulo: 'Datos estructurados',
                    texto: !prep.web_legible
                      ? sinComprobar
                      : haySchema
                        ? prep.tecnico.schema_tipos.slice(0, 6).join(', ')
                        : 'No se encontró ninguno en la portada.',
                  },
                  {
                    ok: prep.tecnico.llms_txt,
                    neutro: !prep.tecnico.llms_txt,
                    titulo: 'Archivo llms.txt',
                    texto: prep.tecnico.llms_txt
                      ? 'Publicado.'
                      : prep.web_legible
                        ? 'No se encontró en la raíz del dominio. Es opcional.'
                        : sinComprobar,
                  },
                ];
                return filas.map((f) => (
                  <div key={f.titulo} className="flex flex-1 basis-[280px] items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${f.neutro ? 'bg-gray-100' : f.ok ? 'bg-green-100' : 'bg-red-100'}`}
                    >
                      {f.neutro ? (
                        <Minus className="h-5 w-5 text-gray-600" aria-hidden="true" />
                      ) : f.ok ? (
                        <Check className="h-5 w-5 text-green-800" aria-hidden="true" />
                      ) : (
                        <X className="h-5 w-5 text-red-800" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-gray-900">{f.titulo}</p>
                      <p className="break-words text-sm text-gray-700">{f.texto}</p>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </section>

          {/* Respuestas */}
          {hechos.length > 0 && (
            <section aria-label="Qué dijeron exactamente" className="space-y-3">
              <h2 className="text-xl font-bold text-gray-900">Qué dijeron exactamente</h2>
              {resultados.map((p, i) => {
                if (!p) return null;
                const ok = p.resultados.filter((r) => !r.error);
                const fallidos = p.resultados.filter((r) => r.error && !r.error.startsWith(SIN_RESUMEN_IA));
                const sinResumen = p.resultados.filter((r) => r.error?.startsWith(SIN_RESUMEN_IA));
                return (
                  <details key={p.pregunta} open={i === 0} className="rounded-2xl border border-gray-200 bg-white px-5">
                    <summary className="flex min-h-[56px] cursor-pointer items-center gap-3 text-[15px] font-semibold text-gray-900">
                      {p.pregunta}
                    </summary>
                    <div className="flex flex-wrap gap-4 pb-5">
                      {ok.map((r) => (
                        <RespuestaMotorCard key={r.motor} r={r} fecha={p.fecha} />
                      ))}
                      {fallidos.length > 0 && (
                        <div className="min-w-0 flex-1 basis-[420px] space-y-2.5 rounded-xl border border-dashed border-gray-400 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">{fallidos.map((r) => MOTOR_LABEL[r.motor]).join(' y ')}</span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">Sin respuesta</span>
                          </div>
                          {fallidos.map((r) => (
                            <p key={r.motor} className="text-sm leading-relaxed text-gray-700">
                              {MOTOR_LABEL[r.motor]}: {motivoFallo(r.error || null)}
                            </p>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => reintentar(i)} disabled={reintentando !== null || enCurso} className="print:hidden">
                            {reintentando === i && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Reintentar {fallidos.length === 1 ? MOTOR_LABEL[fallidos[0].motor] : 'estos'}
                          </Button>
                        </div>
                      )}
                    </div>
                    {sinResumen.length > 0 && (
                      <p className="pb-5 text-sm text-gray-600">
                        {sinResumen.map((r) => MOTOR_LABEL[r.motor]).join(' y ')}: Google no mostró resumen de IA para esta búsqueda.
                      </p>
                    )}
                  </details>
                );
              })}
            </section>
          )}

          {hechos.length > 0 && !enCurso && (
            <section aria-label="Coste del informe" className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 print:hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">Coste estimado de este informe</h2>
                <span className="text-xl font-bold text-gray-900">{usd(coste.total)}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                {MOTORES.filter((m) => coste.porMotor[m] > 0)
                  .map((m) => `${MOTOR_LABEL[m]} ${usd(coste.porMotor[m])}`)
                  .concat([`Análisis de respuestas ${usd(coste.analisis)}`, `Preguntas y diagnóstico ${usd(coste.redaccion)}`])
                  .join(' · ')}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Calculado con las tarifas públicas de cada proveedor; la factura real puede variar. Solo visible internamente: no sale en el PDF.
              </p>
            </section>
          )}

          <p className="text-[13px] leading-relaxed text-gray-600">
            Es una foto del momento: las respuestas cambian de una vez a otra, y lo que devuelve la API se parece a lo que ve un
            usuario en la app sin ser idéntico. La nota usa la misma fórmula que los informes GEORadar.
          </p>
        </div>
      )}
    </div>
  );
}
