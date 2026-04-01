'use client'

import { useState, useCallback } from 'react'
import { Sparkles, Loader2, RefreshCw, ThumbsUp, ThumbsDown, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface WhisperPanelProps {
  /** Texto del editor para analizar */
  contenido: string
  /** Contexto del cliente para personalizar sugerencias */
  contextoCliente?: string
}

interface Sugerencia {
  id: string
  texto: string
  tipo: 'mejora' | 'idea' | 'alerta'
  aceptada?: boolean
}

// Prompts de inicio rápido para el copiloto
const promptsRapidos = [
  'Escribe una intro más llamativa',
  'Mejora el llamado a la acción',
  'Hazlo más conciso',
  'Añade más persuasión',
  'Optimiza para SEO',
  'Adapta el tono a redes sociales',
]

export function WhisperPanel({ contenido, contextoCliente }: WhisperPanelProps) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [cargando, setCargando] = useState(false)
  const [ultimoAnalisis, setUltimoAnalisis] = useState('')

  /**
   * Solicita sugerencias de mejora para el texto actual
   */
  const analizarContenido = useCallback(async () => {
    if (!contenido.trim() || contenido === ultimoAnalisis) return

    setCargando(true)
    setUltimoAnalisis(contenido)

    try {
      const respuesta = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensajes: [
            {
              role: 'user',
              content: `${contextoCliente ? `Contexto del cliente: ${contextoCliente}\n\n` : ''}Analiza este texto y dame exactamente 3 sugerencias concretas de mejora en formato JSON:
[{"texto": "sugerencia", "tipo": "mejora|idea|alerta"}]

Texto:
"""
${contenido}
"""`,
            },
          ],
          modo: 'json',
        }),
      })

      if (!respuesta.ok) throw new Error('Error al analizar')

      const datos = await respuesta.json()
      const sugerenciasParsed = JSON.parse(datos.contenido || '[]')

      setSugerencias(
        sugerenciasParsed.map((s: { texto: string; tipo: string }) => ({
          id: crypto.randomUUID(),
          texto: s.texto,
          tipo: s.tipo ?? 'mejora',
          aceptada: undefined,
        }))
      )
    } catch (error) {
      console.error('Error al analizar contenido:', error)
    } finally {
      setCargando(false)
    }
  }, [contenido, contextoCliente, ultimoAnalisis])

  /**
   * Marca una sugerencia como aceptada o rechazada
   */
  function valorarSugerencia(id: string, aceptada: boolean) {
    setSugerencias((prev) =>
      prev.map((s) => (s.id === id ? { ...s, aceptada } : s))
    )
  }

  // Ícono según el tipo de sugerencia
  const iconoTipo = (tipo: string) => {
    switch (tipo) {
      case 'idea':
        return <Lightbulb className="h-3.5 w-3.5 text-yellow-500" />
      case 'alerta':
        return <span className="text-red-500 text-xs">!</span>
      default:
        return <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      {/* Sección de sugerencias automáticas */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Sugerencias del copiloto</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={analizarContenido}
              disabled={cargando || !contenido.trim()}
              className="h-7 px-2 text-xs"
            >
              {cargando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Analizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {cargando && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
              Analizando tu contenido...
            </div>
          )}

          {!cargando && sugerencias.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">
              {contenido.trim()
                ? 'Pulsa "Analizar" para obtener sugerencias'
                : 'Escribe o genera contenido para ver sugerencias'}
            </p>
          )}

          {sugerencias.map((sugerencia) => (
            <div
              key={sugerencia.id}
              className={`rounded-lg border p-3 text-sm transition-colors ${
                sugerencia.aceptada === true
                  ? 'border-green-200 bg-green-50'
                  : sugerencia.aceptada === false
                  ? 'border-gray-100 bg-gray-50 opacity-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{iconoTipo(sugerencia.tipo)}</span>
                <p className="flex-1 text-xs text-gray-700 leading-relaxed">{sugerencia.texto}</p>
              </div>

              {sugerencia.aceptada === undefined && (
                <div className="flex gap-1 mt-2 justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => valorarSugerencia(sugerencia.id, true)}
                    aria-label="Me gusta esta sugerencia"
                  >
                    <ThumbsUp className="h-3 w-3 text-gray-400 hover:text-green-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => valorarSugerencia(sugerencia.id, false)}
                    aria-label="No me gusta esta sugerencia"
                  >
                    <ThumbsDown className="h-3 w-3 text-gray-400 hover:text-red-500" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />

      {/* Acciones rápidas */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Acciones rápidas</h3>
        <div className="flex flex-col gap-2">
          {promptsRapidos.map((prompt) => (
            <button
              key={prompt}
              className="text-left text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md px-3 py-2 transition-colors border border-indigo-100"
              onClick={() => {
                // Copiar el prompt rápido al portapapeles para pegarlo en el editor
                navigator.clipboard.writeText(prompt)
              }}
              title="Clic para copiar al portapapeles"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Estadísticas del texto */}
      {contenido && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Estadísticas</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                etiqueta: 'Palabras',
                valor: contenido.trim() === '' ? 0 : contenido.trim().split(/\s+/).length,
              },
              { etiqueta: 'Caracteres', valor: contenido.length },
              {
                etiqueta: 'Párrafos',
                valor: contenido.split(/\n\n+/).filter((p) => p.trim()).length,
              },
              {
                etiqueta: 'Oraciones',
                valor: contenido.split(/[.!?]+/).filter((s) => s.trim()).length,
              },
            ].map(({ etiqueta, valor }) => (
              <div key={etiqueta} className="rounded-lg bg-gray-50 p-2 text-center">
                <p className="text-lg font-semibold text-gray-900">{valor}</p>
                <p className="text-xs text-gray-500">{etiqueta}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Badge de modelo */}
      <div className="mt-auto pt-2">
        <Badge variant="secondary" className="text-xs gap-1 w-full justify-center">
          <Sparkles className="h-3 w-3" />
          Impulsado por Claude Opus 4.6
        </Badge>
      </div>
    </div>
  )
}
