'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, FileText, AlertCircle, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

interface Cliente {
  id: string
  nombre: string
  proyectos: { id: string; nombre: string }[]
}

interface Props {
  clientes: Cliente[]
}

export default function ImportarClient({ clientes }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [clienteId, setClienteId] = useState('')
  const [proyectoId, setProyectoId] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onFileChange(file: File | null) {
    setError(null)
    if (!file) { setArchivo(null); return }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['xlsx', 'xls', 'docx', 'doc'].includes(ext)) {
      setError('Solo se admiten archivos .xlsx, .xls, .docx o .doc')
      setArchivo(null)
      return
    }
    setArchivo(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!clienteId) { setError('Selecciona un cliente'); return }
    if (!archivo) { setError('Selecciona un archivo'); return }

    setCargando(true)
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      form.append('cliente_id', clienteId)
      if (proyectoId) form.append('proyecto_id', proyectoId)

      const res = await fetch('/api/pedidos/importar/analizar', {
        method: 'POST',
        body: form,
      })

      const data = await res.json() as { importacion_id?: string; total_pedidos?: number; proyecto_id?: string; error?: string }

      if (!res.ok || !data.importacion_id) {
        setError(data.error ?? 'Error al analizar el archivo')
        return
      }

      const params = new URLSearchParams({ id: data.importacion_id })
      if (data.proyecto_id) params.set('proyecto_id', data.proyecto_id)
      router.push(`/pedidos/importar/revision?${params.toString()}`)
    } catch {
      setError('Error de red. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-10">
        {/* Back */}
        <Link
          href="/pedidos"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a pedidos
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">
            Importar pedidos desde archivo
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            Sube un Excel o Word con el planning editorial y Claude detectará los pedidos automáticamente.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Cliente */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Cliente
              </label>
              <select
                value={clienteId}
                onChange={(e) => { setClienteId(e.target.value); setProyectoId('') }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                disabled={cargando}
              >
                <option value="">Selecciona un cliente…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            {/* Proyecto (aparece cuando hay cliente seleccionado) */}
            {clienteId && (() => {
              const proyectos = clientes.find((c) => c.id === clienteId)?.proyectos ?? []
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Proyecto
                    <span className="ml-1.5 text-xs font-normal text-gray-400">opcional</span>
                  </label>
                  <select
                    value={proyectoId}
                    onChange={(e) => setProyectoId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={cargando}
                  >
                    <option value="">Detectar automáticamente</option>
                    {proyectos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                  {!proyectoId && (
                    <p className="mt-1 text-xs text-gray-400">
                      Claude inferirá el proyecto de cada fila a partir de la columna Vertical/Proyecto
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Dropzone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Archivo
              </label>
              <div
                onClick={() => !cargando && inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); if (!cargando) setArrastrando(true) }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setArrastrando(false)
                  if (!cargando) onFileChange(e.dataTransfer.files[0] ?? null)
                }}
                className={[
                  'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 cursor-pointer transition-colors',
                  arrastrando ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-gray-400',
                  cargando ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.docx,.doc"
                  className="hidden"
                  onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                  disabled={cargando}
                />

                {archivo ? (
                  <div className="flex items-center gap-3 text-sm">
                    {archivo.name.endsWith('.docx') || archivo.name.endsWith('.doc')
                      ? <FileText className="w-8 h-8 text-blue-500 shrink-0" />
                      : <FileSpreadsheet className="w-8 h-8 text-green-600 shrink-0" />
                    }
                    <div>
                      <p className="font-medium text-gray-800">{archivo.name}</p>
                      <p className="text-gray-500">{(archivo.size / 1024).toFixed(0)} KB</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-400 mb-3" />
                    <p className="text-sm font-medium text-gray-700">
                      Arrastra aquí o haz clic para seleccionar
                    </p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx · .xls · .docx · .doc</p>
                  </>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={cargando || !clienteId || !archivo}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {cargando ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Analizando con Claude…
                </span>
              ) : (
                'Analizar archivo'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
