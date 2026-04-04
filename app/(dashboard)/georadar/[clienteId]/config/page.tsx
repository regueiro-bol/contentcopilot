'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import Link from 'next/link';
import { TIER_CONFIG } from '@/lib/georadar/types';

const LLMS = ['claude', 'gpt4', 'gemini', 'perplexity'];
const CATEGORIAS = ['sector', 'producto', 'marca', 'competencia', 'problema'];

export default function GeoRadarConfigPage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.clienteId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tier, setTier] = useState<'basico' | 'estandar' | 'premium'>('estandar');
  const [llmsActivos, setLlmsActivos] = useState<string[]>(['claude', 'gpt4']);
  const [queries, setQueries] = useState<Array<{ query_texto: string; categoria: string; prioridad: number }>>([]);
  const [competidores, setCompetidores] = useState<Array<{ nombre: string; dominio: string; aliases: string }>>([]);

  useEffect(() => {
    fetch(`/api/georadar/${clienteId}/config`)
      .then(r => r.json())
      .then(data => {
        if (data.config) {
          setTier(data.config.tier);
          setLlmsActivos(data.config.llms_activos);
        }
        if (data.queries?.length) {
          setQueries(data.queries.map((q: any) => ({
            query_texto: q.query_texto,
            categoria: q.categoria || 'sector',
            prioridad: q.prioridad || 5,
          })));
        }
        if (data.competidores?.length) {
          setCompetidores(data.competidores.map((c: any) => ({
            nombre: c.nombre,
            dominio: c.dominio || '',
            aliases: (c.aliases || []).join(', '),
          })));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clienteId]);

  function toggleLlm(llm: string) {
    setLlmsActivos(prev =>
      prev.includes(llm) ? prev.filter(l => l !== llm) : [...prev, llm]
    );
  }

  function addQuery() {
    setQueries(prev => [...prev, { query_texto: '', categoria: 'sector', prioridad: 5 }]);
  }

  function updateQuery(i: number, field: string, value: any) {
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

  async function guardar() {
    setSaving(true);
    await fetch(`/api/georadar/${clienteId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier,
        frecuencia: TIER_CONFIG[tier].frecuencia,
        llms_activos: llmsActivos,
        queries: queries.filter(q => q.query_texto.trim()),
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
    return <div className="p-6 text-gray-400 text-sm">Cargando configuración...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/georadar/${clienteId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Configurar GEORadar</h1>
      </div>

      {/* Tier */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Plan de servicio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {(Object.entries(TIER_CONFIG) as any[]).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setTier(key as any)}
                className={`border rounded-lg p-3 text-left transition-all ${
                  tier === key
                    ? 'border-violet-500 bg-violet-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-medium text-sm">{config.nombre}</p>
                <p className="text-xl font-bold text-violet-700 mt-1">€{config.precio_eur}</p>
                <p className="text-xs text-gray-400 mt-1">/mes</p>
                <p className="text-xs text-gray-500 mt-2">{config.max_queries} queries · {config.llms} LLMs</p>
                <p className="text-xs text-gray-500">{config.frecuencia}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* LLMs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            LLMs a monitorizar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {LLMS.map(llm => (
              <button
                key={llm}
                onClick={() => toggleLlm(llm)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                  llmsActivos.includes(llm)
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {llm}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Queries */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Queries a monitorizar
              <span className="ml-2 text-gray-300 font-normal">
                {queries.length}/{TIER_CONFIG[tier].max_queries}
              </span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={addQuery}
              disabled={queries.length >= TIER_CONFIG[tier].max_queries}
            >
              <Plus className="h-3 w-3 mr-1" />
              Añadir
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {queries.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              Sin queries. Añade las búsquedas que quieres monitorizar en los LLMs.
            </p>
          )}
          {queries.map((q, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input
                type="text"
                value={q.query_texto}
                onChange={e => updateQuery(i, 'query_texto', e.target.value)}
                placeholder="Ej: mejor academia oposiciones policía nacional"
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
              <button onClick={() => removeQuery(i)} className="text-gray-300 hover:text-red-400 mt-1.5">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Competidores */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Competidores a comparar
            </CardTitle>
            <Button variant="outline" size="sm" onClick={addCompetidor}>
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
            <div key={i} className="flex gap-2 items-start">
              <input
                type="text"
                value={c.nombre}
                onChange={e => updateCompetidor(i, 'nombre', e.target.value)}
                placeholder="Nombre"
                className="w-32 text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
              <input
                type="text"
                value={c.dominio}
                onChange={e => updateCompetidor(i, 'dominio', e.target.value)}
                placeholder="dominio.com"
                className="w-36 text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
              <input
                type="text"
                value={c.aliases}
                onChange={e => updateCompetidor(i, 'aliases', e.target.value)}
                placeholder="alias1, alias2"
                className="flex-1 text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
              <button onClick={() => removeCompetidor(i)} className="text-gray-300 hover:text-red-400 mt-1.5">
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
