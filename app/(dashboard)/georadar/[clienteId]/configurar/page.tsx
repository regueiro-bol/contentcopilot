'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, Trash2, Save, Sparkles, Loader2 } from 'lucide-react';
import Link from 'next/link';

const LLMS_DISPONIBLES = ['claude', 'gpt4', 'gemini', 'perplexity'];
const CATEGORIAS = ['marca', 'categoria', 'competidor', 'producto'];

export default function GeoRadarConfigurarPage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.clienteId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [cliente, setCliente] = useState<any>(null);

  const [llms, setLlms] = useState(['claude', 'gpt4']);
  const [maxQueries, setMaxQueries] = useState(30);
  const [frecuencia, setFrecuencia] = useState('mensual');
  const [queries, setQueries] = useState<Array<{ query: string; categoria: string }>>([]);
  const [competidores, setCompetidores] = useState<Array<{ nombre: string; dominio: string; aliases: string }>>([]);

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
      if (configData.competidores?.length) {
        setCompetidores(configData.competidores.map((c: any) => ({
          nombre: c.nombre || c.name || '',
          dominio: c.website || c.dominio || '',
          aliases: Array.isArray(c.aliases) ? c.aliases.join(', ') : '',
        })));
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

  function addCompetidor() {
    setCompetidores(prev => [...prev, { nombre: '', dominio: '', aliases: '' }]);
  }

  function updateCompetidor(i: number, field: string, value: string) {
    setCompetidores(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }

  function removeCompetidor(i: number) {
    setCompetidores(prev => prev.filter((_, idx) => idx !== i));
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

  async function guardar() {
    setSaving(true);
    await fetch(`/api/georadar/${clienteId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paquete: 'personalizado',
        llms,
        max_queries: maxQueries,
        frecuencia,
        queries: queries.filter(q => q.query.trim()),
        competidores: competidores
          .filter(c => c.nombre.trim())
          .map(c => ({
            ...c,
            aliases: c.aliases.split(',').map(a => a.trim()).filter(Boolean),
          })),
      }),
    });
    setSaving(false);
    router.push(`/georadar/${clienteId}`);
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Cargando...</div>;
  }

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

      {/* Paso 3 — Competidores */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Paso 3 — Competidores
            </CardTitle>
            <Button variant="outline" size="sm" onClick={addCompetidor} className="text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Añadir
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {competidores.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              Sin competidores. Añade los que quieres comparar en el análisis.
            </p>
          )}
          {competidores.map((c, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={c.nombre}
                onChange={e => updateCompetidor(i, 'nombre', e.target.value)}
                placeholder="Nombre"
                className="w-36 text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
              <input
                type="text"
                value={c.dominio}
                onChange={e => updateCompetidor(i, 'dominio', e.target.value)}
                placeholder="dominio.com"
                className="w-40 text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
              <input
                type="text"
                value={c.aliases}
                onChange={e => updateCompetidor(i, 'aliases', e.target.value)}
                placeholder="alias1, alias2"
                className="flex-1 text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
              <button onClick={() => removeCompetidor(i)} className="text-gray-300 hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={guardar} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </Button>
      </div>
    </div>
  );
}
