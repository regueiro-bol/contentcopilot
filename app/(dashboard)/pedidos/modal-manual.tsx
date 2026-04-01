'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardEdit, X, Loader2, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { Cliente } from '@/types'
import { crearPedidoManual } from './actions'

interface Props {
  open: boolean
  onClose: () => void
  clientes: Pick<Cliente, 'id' | 'nombre'>[]
}

interface Proyecto {
  id: string
  nombre: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Tags input
// ─────────────────────────────────────────────────────────────────────────────

function TagsInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}) {
  const [inputVal, setInputVal] = useState('')

  function addTag(value: string) {
    const tag = value.trim()
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag])
    }
    setInputVal('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(inputVal)
    } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="min-h-[42px] flex flex-wrap gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-indigo-400 hover:text-indigo-700"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(inputVal)}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] border-none bg-transparent text-sm outline-none placeholder:text-gray-400"
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
          checked ? 'bg-indigo-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Selector de proyecto con carga dinámica
// ─────────────────────────────────────────────────────────────────────────────

function SelectorProyecto({
  clienteId,
  valor,
  onChange,
  disabled,
}: {
  clienteId: string
  valor: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [cargando, setCargando] = useState(false)
  const clienteAnterior = useRef('')

  if (clienteId && clienteId !== clienteAnterior.current) {
    clienteAnterior.current = clienteId
    setCargando(true)
    onChange('')
    fetch(`/api/pedidos/proyectos?cliente_id=${clienteId}`)
      .then((r) => r.json())
      .then((d) => setProyectos(d.proyectos ?? []))
      .catch(() => setProyectos([]))
      .finally(() => setCargando(false))
  }

  return (
    <select
      className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || cargando || !clienteId}
    >
      <option value="">
        {cargando ? 'Cargando proyectos...' : !clienteId ? 'Primero selecciona un cliente' : 'Selecciona un proyecto'}
      </option>
      {proyectos.map((p) => (
        <option key={p.id} value={p.id}>{p.nombre}</option>
      ))}
    </select>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado del formulario
// ─────────────────────────────────────────────────────────────────────────────

interface FormState {
  // Sección 1
  clienteId: string
  proyectoId: string
  // Sección 2
  titulo: string
  keywordPrincipal: string
  urlDestino: string
  tamanyoMin: string
  tamanyoMax: string
  fechaEntrega: string
  // Sección 3
  keywordsSecundarias: string[]
  tipoKeyword: string
  volumenEstimado: string
  featuredSnippet: boolean
  // Sección 4
  estructuraH: string
  // Sección 5
  observacionesSeo: string
  formatoRecomendado: string
  fuentesSugeridas: string
  linksObligatorios: string
}

const FORM_VACIO: FormState = {
  clienteId: '',
  proyectoId: '',
  titulo: '',
  keywordPrincipal: '',
  urlDestino: '',
  tamanyoMin: '',
  tamanyoMax: '',
  fechaEntrega: '',
  keywordsSecundarias: [],
  tipoKeyword: '',
  volumenEstimado: '',
  featuredSnippet: false,
  estructuraH: '',
  observacionesSeo: '',
  formatoRecomendado: '',
  fuentesSugeridas: '',
  linksObligatorios: '',
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal principal
// ─────────────────────────────────────────────────────────────────────────────

export function ModalManual({ open, onClose, clientes }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  function handleClose() {
    if (guardando) return
    setForm(FORM_VACIO)
    setError(null)
    setExito(false)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.clienteId) { setError('Selecciona un cliente'); return }
    if (!form.proyectoId) { setError('Selecciona un proyecto'); return }
    if (!form.titulo.trim()) { setError('El título es obligatorio'); return }

    setGuardando(true)
    setError(null)
    try {
      await crearPedidoManual({
        clienteId: form.clienteId,
        proyectoId: form.proyectoId,
        titulo: form.titulo.trim(),
        keywordPrincipal: form.keywordPrincipal.trim() || undefined,
        urlDestino: form.urlDestino.trim() || undefined,
        tamanyoMin: form.tamanyoMin ? parseInt(form.tamanyoMin) : undefined,
        tamanyoMax: form.tamanyoMax ? parseInt(form.tamanyoMax) : undefined,
        fechaEntrega: form.fechaEntrega || undefined,
        keywordsSecundarias: form.keywordsSecundarias,
        tipoKeyword: form.tipoKeyword || undefined,
        volumenEstimado: form.volumenEstimado ? parseInt(form.volumenEstimado) : undefined,
        featuredSnippet: form.featuredSnippet,
        estructuraH: form.estructuraH.trim() || undefined,
        observacionesSeo: form.observacionesSeo.trim() || undefined,
        formatoRecomendado: form.formatoRecomendado || undefined,
        fuentesSugeridas: form.fuentesSugeridas.trim() || undefined,
        linksObligatorios: form.linksObligatorios.trim() || undefined,
      })
      setExito(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el contenido')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardEdit className="h-5 w-5 text-purple-600" />
            Pedido manual
          </DialogTitle>
          <DialogDescription>
            Crea un pedido de contenido introduciendo los datos manualmente.
          </DialogDescription>
        </DialogHeader>

        {exito ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">Contenido creado</p>
              <p className="mt-1 text-gray-500">
                El brief SEO se está generando en background con el Agente Brief SEO.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={handleClose}>Cerrar</Button>
              <Button
                onClick={() => {
                  handleClose()
                  router.push('/proyectos')
                }}
              >
                Ver contenidos
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 py-2">

            {/* ── Sección 1: Identificación ──────────────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Identificación
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="m-cliente">Cliente <span className="text-red-500">*</span></Label>
                  <select
                    id="m-cliente"
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={form.clienteId}
                    onChange={(e) => set('clienteId', e.target.value)}
                  >
                    <option value="">Selecciona un cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Proyecto <span className="text-red-500">*</span></Label>
                  <SelectorProyecto
                    clienteId={form.clienteId}
                    valor={form.proyectoId}
                    onChange={(v) => set('proyectoId', v)}
                    disabled={guardando}
                  />
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            {/* ── Sección 2: Contenido ──────────────────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Contenido
              </h3>
              <div className="space-y-1.5">
                <Label htmlFor="m-titulo">Título <span className="text-red-500">*</span></Label>
                <Input
                  id="m-titulo"
                  placeholder="Ej: Cómo elegir el mejor seguro de coche"
                  value={form.titulo}
                  onChange={(e) => set('titulo', e.target.value)}
                  disabled={guardando}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="m-kw">Keyword principal</Label>
                  <Input
                    id="m-kw"
                    placeholder="Ej: seguro de coche barato"
                    value={form.keywordPrincipal}
                    onChange={(e) => set('keywordPrincipal', e.target.value)}
                    disabled={guardando}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-url">URL destino</Label>
                  <Input
                    id="m-url"
                    placeholder="/blog/seguro-coche-barato"
                    value={form.urlDestino}
                    onChange={(e) => set('urlDestino', e.target.value)}
                    disabled={guardando}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="m-min">Extensión mínima (palabras)</Label>
                  <Input
                    id="m-min"
                    type="number"
                    min={0}
                    placeholder="800"
                    value={form.tamanyoMin}
                    onChange={(e) => set('tamanyoMin', e.target.value)}
                    disabled={guardando}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-max">Extensión máxima</Label>
                  <Input
                    id="m-max"
                    type="number"
                    min={0}
                    placeholder="1500"
                    value={form.tamanyoMax}
                    onChange={(e) => set('tamanyoMax', e.target.value)}
                    disabled={guardando}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-entrega">Fecha de entrega</Label>
                  <Input
                    id="m-entrega"
                    type="date"
                    value={form.fechaEntrega}
                    onChange={(e) => set('fechaEntrega', e.target.value)}
                    disabled={guardando}
                  />
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            {/* ── Sección 3: SEO ────────────────────────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                SEO
              </h3>
              <div className="space-y-1.5">
                <Label>Keywords secundarias</Label>
                <TagsInput
                  tags={form.keywordsSecundarias}
                  onChange={(t) => set('keywordsSecundarias', t)}
                  placeholder="Escribe una keyword y pulsa Enter..."
                />
                <p className="text-xs text-gray-400">
                  Pulsa <kbd className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">Enter</kbd> para añadir cada keyword.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="m-tipo-kw">Tipo de keyword</Label>
                  <select
                    id="m-tipo-kw"
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={form.tipoKeyword}
                    onChange={(e) => set('tipoKeyword', e.target.value)}
                    disabled={guardando}
                  >
                    <option value="">Sin especificar</option>
                    <option value="informativa">Informativa</option>
                    <option value="transaccional">Transaccional</option>
                    <option value="navegacional">Navegacional</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-vol">Volumen estimado</Label>
                  <Input
                    id="m-vol"
                    type="number"
                    min={0}
                    placeholder="Ej: 1200"
                    value={form.volumenEstimado}
                    onChange={(e) => set('volumenEstimado', e.target.value)}
                    disabled={guardando}
                  />
                </div>
                <div className="space-y-1.5 flex flex-col justify-end pb-1">
                  <Toggle
                    checked={form.featuredSnippet}
                    onChange={(v) => set('featuredSnippet', v)}
                    label="Featured snippet"
                  />
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            {/* ── Sección 4: Estructura ─────────────────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Estructura
              </h3>
              <div className="space-y-1.5">
                <Label htmlFor="m-estructura">Estructura de H&apos;s</Label>
                <Textarea
                  id="m-estructura"
                  rows={6}
                  placeholder={`H1: Título principal\nH2: Primera sección\n  H3: Subsección\nH2: Segunda sección`}
                  value={form.estructuraH}
                  onChange={(e) => set('estructuraH', e.target.value)}
                  disabled={guardando}
                  className="font-mono text-sm"
                />
              </div>
            </section>

            <hr className="border-gray-100" />

            {/* ── Sección 5: Instrucciones ──────────────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Instrucciones
              </h3>
              <div className="space-y-1.5">
                <Label htmlFor="m-obs">Observaciones SEO</Label>
                <Textarea
                  id="m-obs"
                  rows={3}
                  placeholder="Instrucciones específicas de SEO para este contenido..."
                  value={form.observacionesSeo}
                  onChange={(e) => set('observacionesSeo', e.target.value)}
                  disabled={guardando}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-formato">Formato recomendado</Label>
                <select
                  id="m-formato"
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.formatoRecomendado}
                  onChange={(e) => set('formatoRecomendado', e.target.value)}
                  disabled={guardando}
                >
                  <option value="">Sin especificar</option>
                  <option value="texto corrido">Texto corrido</option>
                  <option value="listas">Listas</option>
                  <option value="tablas">Tablas</option>
                  <option value="mixto">Mixto</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-fuentes">Fuentes sugeridas</Label>
                <Textarea
                  id="m-fuentes"
                  rows={2}
                  placeholder="URLs o nombres de fuentes de referencia..."
                  value={form.fuentesSugeridas}
                  onChange={(e) => set('fuentesSugeridas', e.target.value)}
                  disabled={guardando}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-links">Links obligatorios</Label>
                <Textarea
                  id="m-links"
                  rows={2}
                  placeholder="URLs que deben aparecer en el artículo..."
                  value={form.linksObligatorios}
                  onChange={(e) => set('linksObligatorios', e.target.value)}
                  disabled={guardando}
                />
              </div>
            </section>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando} className="gap-2">
                {guardando ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Creando...</>
                ) : (
                  <>Crear contenido</>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
