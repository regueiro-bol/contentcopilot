'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Printer, RotateCcw, ScanSearch, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MOTORES, MOTOR_LABEL } from '@/lib/georadar/radiografia/types';
import type { Motor, Preparacion, ResultadoMotor, ResultadoPregunta, Resumen } from '@/lib/georadar/radiografia/types';

const SECTORES_EJEMPLO = ['Óptica', 'Clínica dental', 'Centro de estética', 'Inmobiliaria', 'Taller mecánico', 'Fisioterapia'];

type Paso = 'formulario' | 'preguntas' | 'resultado';
type EstadoPregunta = 'pendiente' | 'ok' | 'error';

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

function media(valores: number[]): number {
  return valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0;
}

function colorNota(n: number): string {
  if (n >= 60) return 'text-green-600';
  if (n >= 30) return 'text-amber-600';
  return 'text-red-600';
}

function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function RadiografiaExpress() {
  const [paso, setPaso] = useState<Paso>('formulario');
  const [dominio, setDominio] = useState('');
  const [sector, setSector] = useState('');
  const [zona, setZona] = useState('');
  const [competidor1, setCompetidor1] = useState('');
  const [competidor2, setCompetidor2] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prep, setPrep] = useState<Preparacion | null>(null);
  const [marca, setMarca] = useState('');
  const [preguntas, setPreguntas] = useState<string[]>([]);

  const [estados, setEstados] = useState<EstadoPregunta[]>([]);
  const [resultados, setResultados] = useState<(ResultadoPregunta | null)[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [resumiendo, setResumiendo] = useState(false);

  const competidores = [competidor1, competidor2].map((c) => c.trim()).filter(Boolean);
  const hechos = resultados.filter((r): r is ResultadoPregunta => r !== null);
  const enCurso = estados.some((e) => e === 'pendiente');

  async function preparar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const p = await post<Preparacion>('/api/georadar/radiografia/preparar', { dominio, sector, zona });
      setPrep(p);
      setMarca(p.marca);
      setPreguntas(p.preguntas);
      setPaso('preguntas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar la radiografía');
    } finally {
      setCargando(false);
    }
  }

  async function lanzar() {
    if (!prep) return;
    const lista = preguntas.map((p) => p.trim()).filter((p) => p.length >= 8);
    if (lista.length === 0 || !marca.trim()) {
      setError('Hace falta el nombre de la marca y al menos una pregunta.');
      return;
    }
    setError(null);
    setPreguntas(lista);
    setResumen(null);
    setEstados(lista.map(() => 'pendiente'));
    setResultados(lista.map(() => null));
    setPaso('resultado');

    const finales = await Promise.all(
      lista.map(async (pregunta, i) => {
        try {
          const r = await post<ResultadoPregunta>('/api/georadar/radiografia/pregunta', {
            dominio: prep.dominio,
            marca: marca.trim(),
            competidores,
            pregunta,
          });
          setResultados((prev) => prev.map((x, j) => (j === i ? r : x)));
          setEstados((prev) => prev.map((x, j) => (j === i ? 'ok' : x)));
          return r;
        } catch {
          setEstados((prev) => prev.map((x, j) => (j === i ? 'error' : x)));
          return null;
        }
      }),
    );

    const validos = finales.filter((r): r is ResultadoPregunta => r !== null);
    if (validos.length === 0) return;
    setResumiendo(true);
    try {
      // Se envían los resultados sin el texto completo de las respuestas para aligerar la petición.
      const compactos = validos.map((p) => ({
        ...p,
        resultados: p.resultados.map((r) => ({ ...r, respuesta: '' })),
      }));
      const res = await post<Resumen>('/api/georadar/radiografia/resumen', {
        dominio: prep.dominio,
        marca: marca.trim(),
        descripcion: prep.descripcion,
        web_legible: prep.web_legible,
        preguntas: compactos,
      });
      setResumen(res);
    } catch {
      setResumen(null);
    } finally {
      setResumiendo(false);
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

  // ── Agregados ────────────────────────────────────────────────────────────
  const { notaGlobal, notaPorMotor, apariciones, totalValidas, ranking, fuentesTop } = useMemo(() => {
    const todos: ResultadoMotor[] = hechos.flatMap((p) => p.resultados).filter((r) => !r.error);
    const porMotor = {} as Record<Motor, number | null>;
    for (const m of MOTORES) {
      const del = todos.filter((r) => r.motor === m);
      porMotor[m] = del.length ? media(del.map((r) => r.score)) : null;
    }

    const marcaLower = marca.trim().toLowerCase();
    const conteo = new Map<string, { nombre: string; veces: number; propio: boolean; indicado: boolean }>();
    for (const r of todos) {
      const vistos = new Set<string>();
      for (const n of r.negocios) {
        const clave = n.nombre.toLowerCase();
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        const propio = !!marcaLower && (clave.includes(marcaLower) || marcaLower.includes(clave));
        const previo = conteo.get(clave);
        if (previo) {
          previo.veces += 1;
          previo.indicado = previo.indicado || n.es_competidor_indicado;
        } else {
          conteo.set(clave, { nombre: n.nombre, veces: 1, propio, indicado: n.es_competidor_indicado });
        }
      }
    }

    const fuentes = new Map<string, number>();
    for (const r of todos) {
      const vistos = new Set<string>();
      for (const f of r.fuentes) {
        // Gemini devuelve URLs de redirección: el dominio real viene en el título.
        const d = r.motor === 'gemini' && f.titulo ? f.titulo.toLowerCase() : dominioDe(f.url);
        if (!d || vistos.has(d)) continue;
        vistos.add(d);
        fuentes.set(d, (fuentes.get(d) || 0) + 1);
      }
    }

    return {
      notaGlobal: media(todos.map((r) => r.score)),
      notaPorMotor: porMotor,
      apariciones: todos.filter((r) => r.marca_mencionada).length,
      totalValidas: todos.length,
      ranking: Array.from(conteo.values()).sort((a, b) => b.veces - a.veces).slice(0, 10),
      fuentesTop: Array.from(fuentes.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
    };
  }, [hechos, marca]);

  const fallosMotor = MOTORES.filter(
    (m) => hechos.length > 0 && hechos.every((p) => p.resultados.find((r) => r.motor === m)?.error),
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3 print:hidden">
        <Link href="/georadar" className="text-gray-400 hover:text-gray-600" aria-label="Volver a GEORadar">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="p-2 bg-violet-100 rounded-lg">
          <ScanSearch className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Radiografía Express</h1>
          <p className="text-sm text-gray-500">
            ¿Recomiendan ChatGPT, Gemini y Perplexity a este negocio, o a su competencia?
          </p>
        </div>
        <Badge variant="warning" className="ml-auto">Demo interna</Badge>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Paso 1: datos del negocio ─────────────────────────────────────── */}
      {paso === 'formulario' && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={preparar} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rx-dominio">Dominio *</Label>
                  <Input id="rx-dominio" required placeholder="tunegocio.es" value={dominio} onChange={(e) => setDominio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rx-sector">Sector</Label>
                  <Input id="rx-sector" placeholder="Óptica" value={sector} onChange={(e) => setSector(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rx-zona">Ciudad o zona</Label>
                  <Input id="rx-zona" placeholder="Ourense" value={zona} onChange={(e) => setZona(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-400">Prueba:</span>
                {SECTORES_EJEMPLO.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSector(s)}
                    className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
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
          </CardContent>
        </Card>
      )}

      {/* ── Paso 2: revisar marca y preguntas ─────────────────────────────── */}
      {paso === 'preguntas' && prep && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5 max-w-md">
              <Label htmlFor="rx-marca">Marca detectada en {prep.dominio}</Label>
              <Input id="rx-marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
              {prep.descripcion && <p className="text-xs text-gray-500">{prep.descripcion}</p>}
              {!prep.web_legible && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> No se pudo leer la web automáticamente. Revisa el nombre de la marca.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Preguntas que se lanzarán a los tres asistentes</Label>
              {preguntas.map((p, i) => (
                <Input
                  key={i}
                  value={p}
                  aria-label={`Pregunta ${i + 1}`}
                  onChange={(e) => setPreguntas((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                />
              ))}
              <p className="text-xs text-gray-400">Puedes editarlas. Deja una vacía para no lanzarla.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={lanzar}>Lanzar radiografía</Button>
              <Button variant="outline" onClick={reiniciar}>Volver</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Paso 3: resultado ─────────────────────────────────────────────── */}
      {paso === 'resultado' && prep && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-gray-900">{marca}</p>
              <p className="text-sm text-gray-500">
                {prep.dominio} · {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" size="sm" onClick={() => window.print()} disabled={enCurso}>
                <Printer className="h-3.5 w-3.5" /> Imprimir o guardar PDF
              </Button>
              <Button variant="outline" size="sm" onClick={reiniciar} disabled={enCurso}>
                <RotateCcw className="h-3.5 w-3.5" /> Nueva
              </Button>
            </div>
          </div>

          {enCurso && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preguntando a los asistentes… {estados.filter((e) => e !== 'pendiente').length} de {estados.length} preguntas
            </div>
          )}

          {hechos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card className="col-span-2">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Nota de visibilidad en IA</p>
                  <p className={`text-4xl font-bold ${colorNota(notaGlobal)}`}>
                    {notaGlobal}<span className="text-base font-normal text-gray-400">/100</span>
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Aparece en {apariciones} de {totalValidas} respuestas
                  </p>
                </CardContent>
              </Card>
              {MOTORES.map((m) => (
                <Card key={m}>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">{MOTOR_LABEL[m]}</p>
                    {notaPorMotor[m] === null ? (
                      <p className="text-sm text-gray-400 mt-2">Sin datos</p>
                    ) : (
                      <p className={`text-2xl font-bold ${colorNota(notaPorMotor[m] as number)}`}>{notaPorMotor[m]}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {fallosMotor.length > 0 && !enCurso && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {fallosMotor.map((m) => MOTOR_LABEL[m]).join(' y ')} no respondió. La nota se calcula solo con los asistentes que sí lo hicieron.
              Revisa la clave de API o el modelo configurado.
            </div>
          )}

          {(resumiendo || resumen) && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <p className="text-sm font-semibold text-gray-900">Diagnóstico y qué arreglar primero</p>
                {resumiendo && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Redactando el diagnóstico…</p>}
                {resumen?.diagnostico && <p className="text-sm text-gray-700">{resumen.diagnostico}</p>}
                {resumen && resumen.arreglos.length > 0 && (
                  <ol className="space-y-2">
                    {resumen.arreglos.map((a, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="text-gray-400 w-4 shrink-0">{i + 1}.</span>
                        <div>
                          <span className="font-medium text-gray-900">{a.titulo}</span>{' '}
                          <Badge variant={a.prioridad === 'alta' ? 'destructive' : a.prioridad === 'media' ? 'warning' : 'secondary'}>
                            {a.prioridad}
                          </Badge>
                          <p className="text-gray-600">{a.detalle}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          )}

          {/* Base técnica: comprobaciones sin IA */}
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">Base técnica de la web</p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>
                  <span className="font-medium">Acceso de los rastreadores de IA: </span>
                  {prep.tecnico.bots_bloqueados === null && 'no hay robots.txt legible, así que no hay bloqueos declarados.'}
                  {prep.tecnico.bots_bloqueados?.length === 0 && 'robots.txt no bloquea a ninguno.'}
                  {!!prep.tecnico.bots_bloqueados?.length && (
                    <span className="text-red-600">robots.txt bloquea a {prep.tecnico.bots_bloqueados.join(', ')}.</span>
                  )}
                </li>
                <li>
                  <span className="font-medium">Datos estructurados en la portada: </span>
                  {prep.tecnico.schema_tipos.length ? prep.tecnico.schema_tipos.join(', ') : (
                    <span className="text-amber-600">no se encontró ninguno.</span>
                  )}
                </li>
                <li>
                  <span className="font-medium">Archivo llms.txt: </span>
                  {prep.tecnico.llms_txt ? 'publicado.' : 'no publicado.'}
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Matriz pregunta × asistente */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3 font-medium">Pregunta</th>
                    {MOTORES.map((m) => <th key={m} className="px-4 py-3 font-medium text-center">{MOTOR_LABEL[m]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preguntas.map((p, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-3 text-gray-700">{p}</td>
                      {MOTORES.map((m) => {
                        const r = resultados[i]?.resultados.find((x) => x.motor === m);
                        return (
                          <td key={m} className="px-4 py-3 text-center">
                            {estados[i] === 'pendiente' && <Loader2 className="h-4 w-4 animate-spin text-gray-300 inline" />}
                            {estados[i] === 'error' && <span className="text-xs text-gray-400">error</span>}
                            {r && r.error && <span className="text-xs text-gray-400" title={r.error}>sin respuesta</span>}
                            {r && !r.error && r.marca_mencionada && (
                              <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                                <Check className="h-4 w-4" />{r.posicion ? `${r.posicion}º` : 'sí'}
                              </span>
                            )}
                            {r && !r.error && !r.marca_mencionada && <X className="h-4 w-4 text-red-400 inline" aria-label="No aparece" />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {hechos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm font-semibold text-gray-900 mb-3">A quién recomienda la IA</p>
                  {ranking.length === 0 && <p className="text-sm text-gray-400">No se detectaron negocios concretos.</p>}
                  <ul className="space-y-1.5">
                    {ranking.map((n) => (
                      <li key={n.nombre} className="flex items-center justify-between text-sm">
                        <span className={n.propio ? 'font-semibold text-violet-700' : 'text-gray-700'}>
                          {n.nombre}
                          {n.propio && <Badge className="ml-2" variant="success">tú</Badge>}
                          {!n.propio && n.indicado && <Badge className="ml-2" variant="secondary">competidor</Badge>}
                        </span>
                        <span className="text-gray-400">{n.veces} de {totalValidas}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm font-semibold text-gray-900 mb-3">De dónde saca la información</p>
                  {fuentesTop.length === 0 && <p className="text-sm text-gray-400">Los asistentes no citaron fuentes.</p>}
                  <ul className="space-y-1.5">
                    {fuentesTop.map(([d, veces]) => (
                      <li key={d} className="flex items-center justify-between text-sm">
                        <span className={d.includes(prep.dominio) ? 'font-semibold text-violet-700' : 'text-gray-700'}>{d}</span>
                        <span className="text-gray-400">{veces}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Respuestas literales */}
          {hechos.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900">Respuestas literales</p>
              {hechos.map((p) => (
                <details key={p.pregunta} className="rounded-md border border-gray-200 bg-white">
                  <summary className="cursor-pointer px-4 py-3 text-sm text-gray-700">{p.pregunta}</summary>
                  <div className="border-t px-4 py-3 space-y-4">
                    {p.resultados.map((r) => (
                      <div key={r.motor}>
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          {MOTOR_LABEL[r.motor]}
                          {r.modelo && ` · ${r.modelo}`} · {new Date(p.fecha).toLocaleString('es-ES')}
                        </p>
                        {r.error ? (
                          <p className="text-xs text-red-500">No respondió: {r.error}</p>
                        ) : (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.respuesta}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400">
            Es una foto del momento: las respuestas de los asistentes cambian de una vez a otra y lo que devuelve la API
            se parece a lo que ve un usuario en la app, pero no es idéntico. La nota usa la misma fórmula que los informes GEORadar.
          </p>
        </div>
      )}
    </div>
  );
}
