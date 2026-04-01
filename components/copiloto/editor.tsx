'use client'

import { useState, useRef } from 'react'
import { Sparkles, Loader2, Copy, Download, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import type { ConversationMessage } from '@/types'

interface EditorProps {
  /** Callback que se llama cuando se genera contenido para actualizar el panel lateral */
  onContenidoCambiado?: (texto: string) => void
  /** Contexto del cliente para personalizar las sugerencias */
  contextoCliente?: string
}

export function Editor({ onContenidoCambiado, contextoCliente }: EditorProps) {
  const [contenido, setContenido] = useState('')
  const [instruccion, setInstruccion] = useState('')
  const [cargando, setCargando] = useState(false)
  const [historial, setHistorial] = useState<ConversationMessage[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Cuenta de palabras del contenido actual
  const contarPalabras = (texto: string) =>
    texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length

  /**
   * Envía la instrucción a Claude y actualiza el contenido con streaming
   */
  async function enviarInstruccion() {
    if (!instruccion.trim() || cargando) return

    setCargando(true)

    // Agregar mensaje del usuario al historial
    const mensajeUsuario: ConversationMessage = {
      id: crypto.randomUUID(),
      rol: 'usuario',
      contenido: instruccion,
      timestamp: new Date().toISOString(),
    }

    const mensajesParaAPI = [
      ...historial.map((m) => ({
        role: m.rol === 'usuario' ? ('user' as const) : ('assistant' as const),
        content: m.contenido,
      })),
      {
        role: 'user' as const,
        content: `${contextoCliente ? `Contexto del cliente: ${contextoCliente}\n\n` : ''}Contenido actual:\n${contenido || '(vacío)'}\n\nInstrucción: ${instruccion}`,
      },
    ]

    setHistorial((prev) => [...prev, mensajeUsuario])
    setInstruccion('')

    try {
      const respuesta = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes: mensajesParaAPI }),
      })

      if (!respuesta.ok) throw new Error('Error al contactar con el copiloto')

      const reader = respuesta.body?.getReader()
      const decoder = new TextDecoder()
      let textoGenerado = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lineas = chunk.split('\n').filter((l) => l.startsWith('data: '))

          for (const linea of lineas) {
            const datos = linea.replace('data: ', '')
            if (datos === '[DONE]') continue
            try {
              const parsed = JSON.parse(datos)
              if (parsed.texto) {
                textoGenerado += parsed.texto
                setContenido(textoGenerado)
                onContenidoCambiado?.(textoGenerado)
              }
            } catch {
              // Ignorar líneas que no son JSON válido
            }
          }
        }
      }

      // Agregar respuesta del asistente al historial
      const mensajeAsistente: ConversationMessage = {
        id: crypto.randomUUID(),
        rol: 'asistente',
        contenido: textoGenerado,
        timestamp: new Date().toISOString(),
      }
      setHistorial((prev) => [...prev, mensajeAsistente])
    } catch (error) {
      console.error('Error en el copiloto:', error)
    } finally {
      setCargando(false)
    }
  }

  /**
   * Copia el contenido al portapapeles
   */
  async function copiarContenido() {
    await navigator.clipboard.writeText(contenido)
  }

  /**
   * Descarga el contenido como archivo de texto
   */
  function descargarContenido() {
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = 'contenido.txt'
    enlace.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Barra de herramientas */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {contarPalabras(contenido)} palabras
          </Badge>
          <Badge variant="secondary">
            {contenido.length} caracteres
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setContenido('')
              setHistorial([])
              onContenidoCambiado?.('')
            }}
            disabled={!contenido}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Limpiar
          </Button>
          <Button variant="outline" size="sm" onClick={copiarContenido} disabled={!contenido}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copiar
          </Button>
          <Button variant="outline" size="sm" onClick={descargarContenido} disabled={!contenido}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Descargar
          </Button>
        </div>
      </div>

      {/* Área de texto principal */}
      <Textarea
        ref={textareaRef}
        value={contenido}
        onChange={(e) => {
          setContenido(e.target.value)
          onContenidoCambiado?.(e.target.value)
        }}
        placeholder="El contenido generado por el copiloto aparecerá aquí. También puedes escribir directamente..."
        className="flex-1 resize-none text-sm leading-relaxed font-mono min-h-[400px]"
      />

      {/* Barra de instrucciones */}
      <div className="flex gap-2">
        <Textarea
          value={instruccion}
          onChange={(e) => setInstruccion(e.target.value)}
          onKeyDown={(e) => {
            // Enviar con Ctrl+Enter
            if (e.key === 'Enter' && e.ctrlKey) {
              e.preventDefault()
              enviarInstruccion()
            }
          }}
          placeholder="Escribe una instrucción para el copiloto... (ej: 'Escribe un post de LinkedIn sobre sostenibilidad')"
          className="flex-1 resize-none min-h-[80px] max-h-[120px]"
          disabled={cargando}
        />
        <Button
          onClick={enviarInstruccion}
          disabled={!instruccion.trim() || cargando}
          className="self-end h-10 gap-2"
        >
          {cargando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {cargando ? 'Generando...' : 'Generar'}
        </Button>
      </div>
      <p className="text-xs text-gray-400 text-right -mt-2">Ctrl+Enter para enviar</p>
    </div>
  )
}
