'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, Trash2, Save, Sparkles, Loader2, AlertTriangle, ClipboardList, Play, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const LLMS_DISPONIBLES = ['claude', 'gpt4', 'gemini', 'perplexity'];
const CATEGORIAS = ['marca', 'categoria', 'competidor', 'producto'];

type CompDisponible = {
  id: string;
  nombre: string;
  categoria: string | null;
  dominio: string;
  web_url: string | null;
};

export default function GeoRadarConfigurarPage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.clienteId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lanzando, setLanzando] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [cliente, setCliente] = useState<any>(null);

  const [llms, setLlms] = useState(['claude', 'gpt4']);
  const [maxQueries, setMaxQueries] = useState(30);
  const [frecuencia, setFrecuencia] = useState('mensual');
  const [queries, setQueries] = useState<Array<{ query: string; categoria: string }>>([]);

  const [competidoresDisponibles, setCompetidoresDisponibles] = useState<CompDisponible[]>([]);
  const [competidoresSeleccionados, setCompetidoresSeleccionados] = useState<Set<string>>(new Set());
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    async function cargar() {
      const configRes = await fetch(`/api/georadar/${clienteId}/config`);
      const configData = await configRes.json();

      if (configData.cliente) setCliente(configData.cliente);
      if (configData.config) {
        setLlms(configData.config.llms || ['claude', 'gpt4']);
        setMaxQueries(configData.config.max_queries || 20);
        setFrecuencia(configData.config.frecuencia || 'mensual');
      }
      if (configData.queries?.length) {
        setQueries(configData.queries.map((q: any) => ({
          query: q.query,
          categoria: q.categoria || 'marca',
        })));
      } else if (configData.keywords?.length) {
        setQueries(configData.keywords.map((k: string) => ({
          query: k,
          categoria: 'categoria',
        })));
      }

      const disponibles: CompDisponible[] = configData.competidores_disponibles || [];
      setCompetidoresDisponibles(disponibles);

      // Si es virgen → pre-marcar todos. Si no → usar la selección guardada.
      if (configData.seleccion_virgen) {
        setCompetidoresSeleccionados(new Set(disponibles.map(d => d.id)));
      } else {
        setCompetidoresSeleccionados(new Set(configData.competidores_seleccionados || []));
      }

      setLoading(false);
    }
    cargar();
  }, [clienteId]);

  function toggleLlm(llm: string) {
    setLlms(prev =>
      prev.includes(llm) ? prev.filter(l => l !== llm) : [...prev, llm]
    );
  }

  function addQuery() {
    setQueries(prev => [...prev, { query: '', categoria: 'marca' }]);
  }

  function updateQuery(i: number, field: string, value: string) {
    setQueries(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q));
  }

  function removeQuery(i: number) {
    setQueries(prev => prev.filter((_, idx) => idx !== i));
  }

  function toggleCompetidor(refId: string) {
    setCompetidoresSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(refId)) next.delete(refId);
      else next.add(refId);
      return next;
    });
  }

  function selectAll() {
    setCompetidoresSeleccionados(new Set(competidoresDisponibles.map(c => c.id)));
  }

  function selectNone() {
    setCompetidoresSeleccionados(new Set());
  }

  async function sugerirQueriesIA() {
    setSugiriendo(true);
    try {
      const res = await fetch(`/api/georadar/${clienteId}/sugerir-queries`, { method: 'POST' });
      const data = await res.json();
      if (data.queries?.length) {
        setQueries(prev => [
          ...prev,
          ...data.queries.map((q: any) => ({ query: q.query, categoria: q.categoria || 'categoria' })),
        ]);
      }
    } catch (e) {
      console.error('Error sugiriendo queries:', e);
    }
    setSugiriendo(false);
  }

  function buildPayload() {
    return {
      paquete: 'personalizado',
      llms,
      max_queries: maxQueries,
      frecuencia,
      queries: queries.filter(q => q.query.trim()),
      competidores_seleccionados: Array.from(competidoresSeleccionados),
    };
  }

  async function guardar() {
    setSaving(true);
    const res = await fetch(`/api/georadar/${clienteId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    });
    setSaving(false);
    if (res.ok) {
      setGuardado(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function lanzarScan() {
    setLanzando(true);
    try {
      await fetch(`/api/georadar/${clienteId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });

      const periodo = new Date().toISOString().slice(0, 7);
      const res = await fetch('/api/georadar/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, periodo }),
      });
      const data = await res.json();

      if (data.scan_id) {
        fetch('/api/georadar/scan/ejecutar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanId: data.scan_id }),
        }).catch(console.error);
      }

      router.push(`/georadar/${clienteId}`);
    } catch (e) {
      console.error('[GEORadar] Error lanzando scan:', e);
      setLanzando(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Cargando...</div>;
  }

  const totalCompetidores = competidoresSeleccionados.size;

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/georadar">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Configurar GEORadar</h1>
          {cliente && <p className="text-sm text-gray-400">{cliente.nombre}</p>}
        </div>
      </div>

      {guardado && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-emerald-800 font-medium">
            <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Configuración guardada correctamente
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={lanzarScan} disabled={lanzando} className="bg-violet-600 hover:bg-violet-700 gap-2">
              {lanzando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Lanzar scan ahora
            </Button>
            <span className="text-xs text-gray-400">
              Actualizado {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      )}

      {/* Paso 1 — Configuración */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Paso 1 — Configuración
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-2 block">LLMs a monitorizar</label>
            <div className="flex gap-2 flex-wrap">
              {LLMS_DISPONIBLES.map(llm => (
                <button
                  key={llm}
                  onClick={() => toggleLlm(llm)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                    llms.includes(llm)
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {llm}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-6">
            <div>
              <label className="text-xs text-gray-500 mb-2 block">Máximo de queries</label>
              <input
                type="number"
                value={maxQueries}
                onChange={e => setMaxQueries(Number(e.target.value))}
                min={1}
                max={100}
                className="w-24 text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-2 block">Frecuencia</label>
              <div className="flex gap-3">
                {['mensual', 'quincenal', 'semanal'].map(f => (
                  <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="frecuencia"
                      value={f}
                      checked={frecuencia === f}
                      onChange={() => setFrecuencia(f)}
                      className="accent-violet-600"
                    />
                    <span className="text-sm text-gray-600 capitalize">{f}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paso 2 — Queries */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Paso 2 — Queries a monitorizar
              <span className="ml-2 font-normal text-gray-300">{queries.length}/{maxQueries}</span>
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={sugerirQueriesIA}
                disabled={sugiriendo}
                className="text-xs"
              >
                {sugiriendo
                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  : <Sparkles className="h-3 w-3 mr-1" />
                }
                Sugerir con IA
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={addQuery}
                disabled={queries.length >= maxQueries}
                className="text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Añadir
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {queries.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              Sin queries. Usa &quot;Sugerir con IA&quot; o añade manualmente.
            </p>
          )}
          {queries.map((q, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={q.query}
                onChange={e => updateQuery(i, 'query', e.target.value)}
                placeholder="Ej: mejor academia oposiciones policía"
                className="flex-1 text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
              <select
                value={q.categoria}
                onChange={e => updateQuery(i, 'categoria', e.target.value)}
                className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-500 focus:outline-none"
              >
                {CATEGORIAS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button onClick={() => removeQuery(i)} className="text-gray-300 hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Paso 3 — Competidores (selección desde Cliente / Competencia) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Paso 3 — Competidores
              <span className="ml-2 font-normal text-gray-300">
                {totalCompetidores}/{competidoresDisponibles.length} seleccionados
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {competidoresDisponibles.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-gray-500 hover:text-violet-600"
                  >
                    Todos
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="text-xs text-gray-500 hover:text-violet-600"
                  >
                    Ninguno
                  </button>
                </>
              )}
              <Button variant="outline" size="sm" asChild className="text-xs gap-1">
                <Link href={`/clientes/${clienteId}?tab=competencia`}>
                  <ExternalLink className="h-3 w-3" />
                  Gestionar
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {competidoresDisponibles.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6 space-y-2">
              <p>No hay competidores editoriales dados de alta para este cliente.</p>
              <Button variant="outline" size="sm" asChild className="gap-1">
                <Link href={`/clientes/${clienteId}?tab=competencia`}>
                  <Plus className="h-3 w-3" />
                  Añadir en Cliente / Competencia
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {competidoresDisponibles.map(comp => (
                <label
                  key={comp.id}
                  className="flex items-center gap-3 p-2 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={competidoresSeleccionados.has(comp.id)}
                    onChange={() => toggleCompetidor(comp.id)}
                    className="accent-violet-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{comp.nombre}</p>
                    {(comp.dominio || comp.categoria) && (
                      <p className="text-xs text-gray-400 truncate">
                        {comp.dominio}
                        {comp.dominio && comp.categoria ? ' · ' : ''}
                        {comp.categoria}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen del scan */}
      {(() => {
        const queriesValidas = queries.filter((q) => q.query.trim()).length;
        const llmsActivos = llms.length;
        const compsValidos = totalCompetidores;
        const totalQueries = queriesValidas * llmsActivos;
        const costeEst = totalQueries * 0.002;
        const llmLabels: Record<string, string> = { claude: 'Claude', gpt4: 'GPT-4', gemini: 'Gemini', perplexity: 'Perplexity' };

        return (
          <Card className="border-violet-200 bg-violet-50/30">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
                <ClipboardList className="h-4 w-4 text-violet-600" />
                Resumen del scan
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                <span className="text-gray-500">Cliente</span>
                <span className="text-gray-800 font-medium">{cliente?.nombre ?? '—'}</span>

                <span className="text-gray-500">Keywords ({queriesValidas})</span>
                <span className="text-gray-800 truncate">
                  {queriesValidas > 0
                    ? queries.filter((q) => q.query.trim()).map((q) => q.query).slice(0, 3).join(', ') + (queriesValidas > 3 ? '...' : '')
                    : '—'}
                </span>

                <span className="text-gray-500">Competidores ({compsValidos})</span>
                <span className="text-gray-800 truncate">
                  {compsValidos > 0 ? `${compsValidos} seleccionados` : '—'}
                </span>

                <span className="text-gray-500">LLMs activos ({llmsActivos})</span>
                <span className="text-gray-800">{llms.map((l) => llmLabels[l] ?? l).join(', ') || '—'}</span>

                <span className="text-gray-500">Queries totales</span>
                <span className="text-gray-800 font-semibold">
                  {totalQueries} <span className="font-normal text-gray-400">({queriesValidas} × {llmsActivos} LLMs)</span>
                </span>

                <span className="text-gray-500">Coste estimado</span>
                <span className="text-gray-800 font-semibold">~${costeEst.toFixed(2)}</span>
              </div>

              {compsValidos === 0 && (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Sin competidores — el análisis no podrá comparar presencia.
                </div>
              )}

              {queriesValidas === 0 && (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Necesitas al menos una keyword para lanzar el scan.
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <div className="flex justify-end gap-2">
        <Button onClick={guardar} disabled={saving} variant="outline">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </Button>
        <Button
          onClick={lanzarScan}
          disabled={lanzando || queries.filter(q => q.query.trim()).length === 0}
          className="bg-violet-600 hover:bg-violet-700"
        >
          {lanzando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Lanzar scan ahora
        </Button>
      </div>
    </div>
  );
}
