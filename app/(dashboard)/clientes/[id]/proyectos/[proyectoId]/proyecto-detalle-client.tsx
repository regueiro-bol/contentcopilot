'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Edit, Plus, FileText, Globe, FolderOpen,
  CheckCircle2, Upload, Sparkles, Trash2, ToggleLeft, ToggleRight,
  ExternalLink, Brain, Loader2, Map, Radar, ArrowRight, Archive, AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { colorEstadoContenido, etiquetaEstadoContenido, formatearFecha } from '@/lib/utils'
import {
  actualizarConfiguracion,
  actualizarSeo,
  actualizarAccesos,
  actualizarEntrega,
  crearContenido,
  subirDocumento,
  eliminarDocumento,
  archivarProyecto,
  eliminarProyecto,
} from './actions'
import type { Proyecto, Contenido, DocumentoProyecto, PerfilAutor } from '@/types'
import type {
  InspiracionSummary,
  StrategySummary,
  GeoradarSummary,
} from './page'

const etiquetasModo: Record<string, string> = {
  drive: 'Google Drive', cms: 'CMS / WordPress', word: 'Word', email: 'Email',
}

const coloresTipoDoc: Record<DocumentoProyecto['tipo'], string> = {
  estilo:     'bg-purple-100 text-purple-700',
  guia_marca: 'bg-indigo-100 text-indigo-700',
  brief:      'bg-blue-100 text-blue-700',
  contenido:  'bg-green-100 text-green-700',
  otro:       'bg-gray-100 text-gray-700',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="text-sm text-gray-800">{children}</div>
    </div>
  )
}

function TagList({ items, color = 'bg-indigo-50 text-indigo-700' }: { items: string[]; color?: string }) {
  if (!items?.length) return <span className="text-sm text-gray-400">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
          {item}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal: Editar configuración
// ---------------------------------------------------------------------------
function EditConfiguracionModal({
  proyecto, clienteId, open, onClose,
}: { proyecto: Proyecto; clienteId: string; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [nombre, setNombre] = useState(proyecto.nombre)
  const [descripcion, setDescripcion] = useState(proyecto.descripcion)
  const [tonoVoz, setTonoVoz] = useState(proyecto.tono_voz)
  const [etiquetasCSV, setEtiquetasCSV] = useState(proyecto.etiquetas_tono.join(', '))
  const [modoCreativo, setModoCreativo] = useState(proyecto.modo_creativo)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGuardar() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setGuardando(true); setError(null)
    try {
      await actualizarConfiguracion(proyecto.id, clienteId, {
        nombre,
        descripcion,
        tono_voz: tonoVoz,
        etiquetas_tono: etiquetasCSV.split(',').map((s) => s.trim()).filter(Boolean),
        modo_creativo: modoCreativo,
      })
      router.refresh()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar configuración editorial</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Tono de voz</Label>
            <Textarea value={tonoVoz} onChange={(e) => setTonoVoz(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Etiquetas de tono</Label>
            <Input value={etiquetasCSV} onChange={(e) => setEtiquetasCSV(e.target.value)} placeholder="Cercano, directo, técnico, ..." />
            <p className="text-xs text-gray-400">Separadas por comas</p>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-gray-50">
            <div>
              <p className="text-sm font-semibold text-gray-800">Modo creativo</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {modoCreativo ? 'Modo autor — el redactor propone el enfoque' : 'Modo cliente — el cliente define el brief'}
              </p>
            </div>
            <button type="button" onClick={() => setModoCreativo(!modoCreativo)} className="flex items-center gap-2 focus:outline-none">
              {modoCreativo ? <ToggleRight className="h-8 w-8 text-purple-600" /> : <ToggleLeft className="h-8 w-8 text-gray-400" />}
              <span className={`text-sm font-medium ${modoCreativo ? 'text-purple-700' : 'text-gray-500'}`}>
                {modoCreativo ? 'Activado' : 'Desactivado'}
              </span>
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 px-1 pb-1">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Modal: Editar SEO / GEO
// ---------------------------------------------------------------------------
function EditSeoModal({
  proyecto, clienteId, open, onClose,
}: { proyecto: Proyecto; clienteId: string; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [kwObj, setKwObj] = useState(proyecto.keywords_objetivo.join(', '))
  const [kwPro, setKwPro] = useState(proyecto.keywords_prohibidas.join(', '))
  const [temAuth, setTemAuth] = useState(proyecto.tematicas_autorizadas.join(', '))
  const [temVet, setTemVet] = useState(proyecto.tematicas_vetadas.join(', '))
  const [perfil, setPerfil] = useState(proyecto.perfil_lector)
  const [excelUrl, setExcelUrl] = useState(proyecto.excel_seo_url ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGuardar() {
    setGuardando(true); setError(null)
    try {
      await actualizarSeo(proyecto.id, clienteId, {
        keywords_objetivo_csv: kwObj, keywords_prohibidas_csv: kwPro,
        tematicas_autorizadas_csv: temAuth, tematicas_vetadas_csv: temVet,
        perfil_lector: perfil, excel_seo_url: excelUrl,
      })
      router.refresh(); onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setGuardando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar SEO / GEO</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Keywords objetivo</Label>
            <Input value={kwObj} onChange={(e) => setKwObj(e.target.value)} placeholder="financiación pyme, crédito empresa, ..." />
            <p className="text-xs text-gray-400">Separadas por comas</p>
          </div>
          <div className="space-y-1.5">
            <Label>Keywords prohibidas</Label>
            <Input value={kwPro} onChange={(e) => setKwPro(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Temáticas autorizadas</Label>
            <Input value={temAuth} onChange={(e) => setTemAuth(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Temáticas vetadas</Label>
            <Input value={temVet} onChange={(e) => setTemVet(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Perfil del lector</Label>
            <Textarea value={perfil} onChange={(e) => setPerfil(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>URL Excel SEO</Label>
            <Input value={excelUrl} onChange={(e) => setExcelUrl(e.target.value)} placeholder="https://docs.google.com/..." />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 px-1 pb-1">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Modal: Editar accesos documentales
// ---------------------------------------------------------------------------
function EditAccesosModal({
  proyecto, clienteId, open, onClose,
}: { proyecto: Proyecto; clienteId: string; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [driveUrl, setDriveUrl] = useState(proyecto.drive_carpeta_url ?? '')
  const [wpUrl, setWpUrl] = useState(proyecto.wordpress_url ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGuardar() {
    setGuardando(true); setError(null)
    try {
      await actualizarAccesos(proyecto.id, clienteId, { drive_carpeta_url: driveUrl, wordpress_url: wpUrl })
      router.refresh(); onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setGuardando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar accesos documentales</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>URL Carpeta Drive</Label>
            <Input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
          </div>
          <div className="space-y-1.5">
            <Label>URL WordPress</Label>
            <Input value={wpUrl} onChange={(e) => setWpUrl(e.target.value)} placeholder="https://miblog.com/wp-admin" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 px-1 pb-1">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Modal: Editar entrega
// ---------------------------------------------------------------------------
function EditEntregaModal({
  proyecto, clienteId, open, onClose,
}: { proyecto: Proyecto; clienteId: string; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [modoEntrega, setModoEntrega] = useState<Proyecto['modo_entrega']>(proyecto.modo_entrega)
  const [cmsUrl, setCmsUrl] = useState(proyecto.cms_url ?? '')
  const [contactoNombre, setContactoNombre] = useState(proyecto.contacto_aprobacion_nombre ?? '')
  const [contactoEmail, setContactoEmail] = useState(proyecto.contacto_aprobacion_email ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGuardar() {
    setGuardando(true); setError(null)
    try {
      await actualizarEntrega(proyecto.id, clienteId, {
        modo_entrega: modoEntrega, cms_url: cmsUrl,
        contacto_aprobacion_nombre: contactoNombre, contacto_aprobacion_email: contactoEmail,
      })
      router.refresh(); onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setGuardando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar configuración de entrega</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Modo de entrega</Label>
            <select
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={modoEntrega}
              onChange={(e) => setModoEntrega(e.target.value as Proyecto['modo_entrega'])}
            >
              <option value="drive">Google Drive</option>
              <option value="cms">CMS / WordPress</option>
              <option value="word">Word / Documento</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>URL del CMS</Label>
            <Input value={cmsUrl} onChange={(e) => setCmsUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label>Contacto aprobación — nombre</Label>
            <Input value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Contacto aprobación — email</Label>
            <Input type="email" value={contactoEmail} onChange={(e) => setContactoEmail(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 px-1 pb-1">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Modal: Subir documento
// ---------------------------------------------------------------------------
function SubirDocumentoModal({
  proyectoId, clienteId, open, onClose,
}: { proyectoId: string; clienteId: string; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<DocumentoProyecto['tipo']>('otro')
  const [descripcion, setDescripcion] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setArchivo(file)
    if (file && !nombre) setNombre(file.name)   // mantener extensión para detectar tipo RAG
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!archivo) { setError('Selecciona un archivo'); return }
    setSubiendo(true); setError(null)
    try {
      const formData = new FormData()
      formData.append('archivo', archivo)
      formData.append('nombre', nombre || archivo.name)
      formData.append('tipo', tipo)
      formData.append('descripcion', descripcion)
      await subirDocumento(proyectoId, clienteId, formData)
      router.refresh()
      setArchivo(null); setNombre(''); setTipo('otro'); setDescripcion('')
      if (fileRef.current) fileRef.current.value = ''
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir el documento')
    } finally { setSubiendo(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Subir documento</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Archivo <span className="text-red-500">*</span></Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.zip,.xlsx"
              onChange={handleArchivoChange}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-xs file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 focus:outline-none"
              required
            />
            <p className="text-xs text-gray-400">PDF, DOCX, DOC, TXT, CSV, XLSX, ZIP — máx. 50 MB</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nombre del documento</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Guía de estilo editorial" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo <span className="text-red-500">*</span></Label>
            <select
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as DocumentoProyecto['tipo'])}
            >
              <option value="estilo">Estilo editorial</option>
              <option value="guia_marca">Guía de marca</option>
              <option value="brief">Brief</option>
              <option value="contenido">Contenido de referencia</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción <span className="text-gray-400 font-normal">(opcional)</span></Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="Para qué sirve este documento..." />
          </div>
          {archivo && (
            <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
              {archivo.name} · {archivo.size > 1024 * 1024 ? `${(archivo.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(archivo.size / 1024)} KB`}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={subiendo}>Cancelar</Button>
            <Button type="submit" disabled={subiendo || !archivo}>{subiendo ? 'Subiendo...' : 'Subir documento'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Modal: Nuevo contenido (EXPANDED)
// ---------------------------------------------------------------------------
function NuevoContenidoModal({
  proyectoId, clienteId, autores, open, onClose,
}: { proyectoId: string; clienteId: string; autores: PerfilAutor[]; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [titulo, setTitulo] = useState('')
  const [keyword, setKeyword] = useState('')
  const [urlDestino, setUrlDestino] = useState('')
  const [minPalabras, setMinPalabras] = useState('')
  const [maxPalabras, setMaxPalabras] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [redactorId, setRedactorId] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setTitulo(''); setKeyword(''); setUrlDestino('')
    setMinPalabras(''); setMaxPalabras(''); setFechaEntrega('')
    setRedactorId(''); setNotas('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) { setError('El título es obligatorio'); return }
    if (!keyword.trim()) { setError('La keyword principal es obligatoria'); return }
    if (!urlDestino.trim()) { setError('La URL destino es obligatoria'); return }
    if (!fechaEntrega) { setError('La fecha de entrega es obligatoria'); return }
    setGuardando(true); setError(null)
    try {
      await crearContenido(proyectoId, clienteId, {
        titulo,
        keyword_principal: keyword,
        url_destino: urlDestino,
        tamanyo_texto_min: minPalabras ? parseInt(minPalabras) : null,
        tamanyo_texto_max: maxPalabras ? parseInt(maxPalabras) : null,
        fecha_entrega: fechaEntrega,
        redactor_id: redactorId,
        notas_iniciales: notas,
      })
      router.refresh()
      resetForm()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el contenido')
    } finally { setGuardando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo contenido</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Título <span className="text-red-500">*</span></Label>
            <Input
              placeholder="Ej: Cómo conseguir financiación para tu pyme en 2025"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Keyword principal <span className="text-red-500">*</span></Label>
            <Input placeholder="Ej: financiación pyme" value={keyword} onChange={(e) => setKeyword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>URL destino <span className="text-red-500">*</span></Label>
            <Input placeholder="Ej: /blog/financiacion-pyme" value={urlDestino} onChange={(e) => setUrlDestino(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mínimo palabras</Label>
              <Input
                type="number"
                min={100}
                max={10000}
                placeholder="1200"
                value={minPalabras}
                onChange={(e) => setMinPalabras(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Máximo palabras</Label>
              <Input
                type="number"
                min={100}
                max={10000}
                placeholder="1500"
                value={maxPalabras}
                onChange={(e) => setMaxPalabras(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de entrega <span className="text-red-500">*</span></Label>
            <Input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Redactor asignado</Label>
            <select
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={redactorId}
              onChange={(e) => setRedactorId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {autores.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Notas iniciales</Label>
            <Textarea
              placeholder="Instrucciones especiales, contexto adicional..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando ? 'Creando...' : 'Crear contenido'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function ProyectoDetalleClient({
  proyecto,
  contenidos,
  cliente,
  autores,
  lastInspiracion,
  lastStrategy,
  lastGeoradar,
}: {
  proyecto: Proyecto
  contenidos: Contenido[]
  cliente: { id: string; nombre: string }
  autores: PerfilAutor[]
  lastInspiracion: InspiracionSummary | null
  lastStrategy: StrategySummary | null
  lastGeoradar: GeoradarSummary[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [archiving, setArchiving] = useState(false)
  const [editTab, setEditTab] = useState<'configuracion' | 'seo' | 'accesos' | 'entrega' | null>(null)
  const [modoCreativo, setModoCreativo] = useState(proyecto.modo_creativo)
  const [modalContenido, setModalContenido] = useState(false)
  const [modalDocumento, setModalDocumento] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteTyped, setDeleteTyped] = useState('')
  const [deletingProyecto, setDeletingProyecto] = useState(false)

  // RAG: estado + número de chunks por documento
  // Se inicializa desde el campo estado_rag/chunks_generados persistido en el JSONB
  type RagEstado = 'procesando' | 'procesado' | 'error' | 'eliminando'
  const [ragEstados, setRagEstados] = useState<Record<string, RagEstado>>(() => {
    const init: Record<string, RagEstado> = {}
    for (const doc of proyecto.documentos_subidos) {
      if (doc.estado_rag === 'procesado') init[doc.id] = 'procesado'
    }
    return init
  })
  const [ragChunks, setRagChunks] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const doc of proyecto.documentos_subidos) {
      if (doc.chunks_generados) init[doc.id] = doc.chunks_generados
    }
    return init
  })
  const [ragErrores,    setRagErrores]    = useState<Record<string, string>>({})
  // Diálogo de confirmación compartido
  const [confirmDialog, setConfirmDialog] = useState<{
    tipo   : 'eliminar_rag' | 'eliminar_doc'
    doc    : DocumentoProyecto
    titulo : string
    mensaje: string
  } | null>(null)
  const [confirmando,   setConfirmando]   = useState(false)

  // Build redactor lookup map
  const redactorMap = Object.fromEntries(autores.map((a) => [a.id, a.nombre]))

  function detectarTipo(nombre: string, url?: string): 'csv_wordpress' | 'zip_docx' | 'docx' | 'txt' {
    const fuente = nombre.toLowerCase().includes('.')
      ? nombre.toLowerCase()
      : (url ?? '').split('?')[0].toLowerCase()
    if (fuente.endsWith('.csv'))                            return 'csv_wordpress'
    if (fuente.endsWith('.zip'))                            return 'zip_docx'
    if (fuente.endsWith('.docx') || fuente.endsWith('.doc')) return 'docx'
    return 'txt'
  }

  // ── Procesar para RAG ────────────────────────────────────────────────────────
  async function procesarParaRAG(doc: DocumentoProyecto) {
    setRagEstados((prev) => ({ ...prev, [doc.id]: 'procesando' }))
    setRagErrores((prev) => { const n = { ...prev }; delete n[doc.id]; return n })

    try {
      const res = await fetch('/api/rag/ingest', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          proyecto_id      : proyecto.id,
          documento_id     : doc.id,
          documento_url    : doc.url,
          documento_nombre : doc.nombre,
          tipo             : detectarTipo(doc.nombre, doc.url),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido')

      setRagEstados((prev) => ({ ...prev, [doc.id]: 'procesado' }))
      setRagChunks((prev) => ({ ...prev, [doc.id]: data.chunks_totales ?? 0 }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setRagEstados((prev) => ({ ...prev, [doc.id]: 'error' }))
      setRagErrores((prev) => ({ ...prev, [doc.id]: msg }))
    }
  }

  // ── Eliminar embeddings del RAG ──────────────────────────────────────────────
  async function eliminarRAG(doc: DocumentoProyecto) {
    setRagEstados((prev) => ({ ...prev, [doc.id]: 'eliminando' }))
    try {
      const res = await fetch('/api/rag/ingest', {
        method : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          proyecto_id    : proyecto.id,
          documento_id   : doc.id,
          nombre_archivo : doc.nombre,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al eliminar embeddings')

      // Limpiar estado local
      setRagEstados((prev) => { const n = { ...prev }; delete n[doc.id]; return n })
      setRagChunks((prev)  => { const n = { ...prev }; delete n[doc.id]; return n })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setRagEstados((prev) => ({ ...prev, [doc.id]: 'error' }))
      setRagErrores((prev) => ({ ...prev, [doc.id]: msg }))
    }
  }

  // ── Eliminar documento completo ──────────────────────────────────────────────
  async function ejecutarEliminarDocumento(doc: DocumentoProyecto) {
    setConfirmando(true)
    try {
      await eliminarDocumento(proyecto.id, cliente.id, doc.id)
      // Limpiar estado RAG local por si acaso
      setRagEstados((prev) => { const n = { ...prev }; delete n[doc.id]; return n })
      setRagChunks((prev)  => { const n = { ...prev }; delete n[doc.id]; return n })
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar'
      setRagErrores((prev) => ({ ...prev, [doc.id]: msg }))
    } finally {
      setConfirmando(false)
      setConfirmDialog(null)
    }
  }

  // ── Ejecutar la acción confirmada ────────────────────────────────────────────
  async function handleConfirmar() {
    if (!confirmDialog) return
    if (confirmDialog.tipo === 'eliminar_rag') {
      setConfirmDialog(null)
      await eliminarRAG(confirmDialog.doc)
    } else {
      await ejecutarEliminarDocumento(confirmDialog.doc)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/clientes" className="hover:text-indigo-600 transition-colors">Clientes</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/clientes/${cliente.id}`} className="hover:text-indigo-600 transition-colors">{cliente.nombre}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-gray-900 font-medium">{proyecto.nombre}</span>
      </div>

      {/* Cabecera */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg">
            {proyecto.nombre.split(' ').slice(0, 2).map((w) => w[0]).join('')}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{proyecto.nombre}</h2>
              <Badge variant={proyecto.activo ? 'success' : 'secondary'}>{proyecto.activo ? 'Activo' : 'Inactivo'}</Badge>
              <Badge variant="secondary" className={modoCreativo ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                {modoCreativo ? 'Modo autor' : 'Modo cliente'}
              </Badge>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">
              {cliente.nombre} · {contenidos.length} contenido{contenidos.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="configuracion">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
          <TabsTrigger value="docs">Base documental</TabsTrigger>
          <TabsTrigger value="seo">SEO / GEO</TabsTrigger>
          <TabsTrigger value="contenidos">Contenidos ({contenidos.length})</TabsTrigger>
          <TabsTrigger value="entrega">Entrega</TabsTrigger>
          <TabsTrigger value="estrategia">Estrategia</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Configuración ── */}
        <TabsContent value="configuracion">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Configuración editorial</CardTitle>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditTab('configuracion')}>
                <Edit className="h-3.5 w-3.5" />Editar
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Nombre">{proyecto.nombre}</Field>
                <Field label="Slug">{proyecto.slug}</Field>
              </div>
              <Field label="Descripción">{proyecto.descripcion || '—'}</Field>
              <Separator />
              <Field label="Tono de voz">{proyecto.tono_voz || '—'}</Field>
              <Field label="Etiquetas de tono">
                <TagList items={proyecto.etiquetas_tono} color="bg-purple-50 text-purple-700" />
              </Field>
              <Separator />
              <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-gray-50">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Modo creativo</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {modoCreativo ? 'Modo autor — el redactor propone el enfoque' : 'Modo cliente — el cliente define el brief'}
                  </p>
                </div>
                <button onClick={() => setModoCreativo(!modoCreativo)} className="flex items-center gap-2 focus:outline-none" aria-label="Cambiar modo creativo">
                  {modoCreativo ? <ToggleRight className="h-8 w-8 text-purple-600" /> : <ToggleLeft className="h-8 w-8 text-gray-400" />}
                  <span className={`text-sm font-medium ${modoCreativo ? 'text-purple-700' : 'text-gray-500'}`}>
                    {modoCreativo ? 'Activado' : 'Desactivado'}
                  </span>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Zona peligrosa — discreta, dentro de Configuración */}
          <Card className="border-red-200 mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Zona peligrosa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Archivar */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700">Archivar proyecto</p>
                  <p className="text-xs text-gray-500">El proyecto se conserva pero deja de aparecer como activo.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1 text-amber-700 border-amber-200 hover:bg-amber-50"
                  disabled={archiving || isPending}
                  onClick={() => {
                    setArchiving(true)
                    startTransition(async () => {
                      try {
                        await archivarProyecto(proyecto.id, cliente.id)
                        router.refresh()
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Error al archivar'
                        alert(msg)
                      } finally {
                        setArchiving(false)
                      }
                    })
                  }}
                >
                  {archiving ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Archivando…</>
                  ) : (
                    <><Archive className="h-3 w-3" /> Archivar proyecto</>
                  )}
                </Button>
              </div>
              <Separator />
              {/* Eliminar con confirmación en dos pasos */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700">Eliminar proyecto</p>
                  <p className="text-xs text-gray-500">
                    Se eliminarán todos los contenidos asociados. Esta acción no se puede deshacer.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3 w-3" />
                  Eliminar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Estrategia (mini-dashboard con datos reales del cliente) ── */}
        <TabsContent value="estrategia">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Inspiración */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  Inspiración
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lastInspiracion ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-gray-900">
                        {Array.isArray(lastInspiracion.resultado?.oportunidades)
                          ? lastInspiracion.resultado!.oportunidades!.length
                          : 0}
                      </span>
                      <span className="text-xs text-gray-500">oportunidades</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Último análisis: {new Date(lastInspiracion.created_at).toLocaleDateString('es-ES')}
                    </p>
                    <Button size="sm" variant="outline" className="w-full gap-1.5" asChild>
                      <Link href={`/inspiracion/${lastInspiracion.id}`}>
                        Ver informe
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary" className="text-xs">Sin análisis todavía</Badge>
                    <p className="text-xs text-gray-500">
                      Fuentes, referencias e insights para inspirar nuevos contenidos.
                    </p>
                    <Button size="sm" variant="outline" className="w-full gap-1.5" asChild>
                      <Link href={`/inspiracion?clienteId=${cliente.id}`}>
                        Crear análisis
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Estrategia de Contenidos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Map className="h-4 w-4 text-emerald-500" />
                  Estrategia de Contenidos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lastStrategy ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-gray-900">
                        {lastStrategy.keywords_incluidas ?? lastStrategy.total_keywords ?? 0}
                      </span>
                      <span className="text-xs text-gray-500">keywords mapeadas</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {lastStrategy.num_clusters ?? 0} clusters · {new Date(lastStrategy.created_at).toLocaleDateString('es-ES')}
                    </p>
                    <Button size="sm" variant="outline" className="w-full gap-1.5" asChild>
                      <Link href={`/strategy?clienteId=${cliente.id}`}>
                        Ver estrategia
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary" className="text-xs">Sin estrategia todavía</Badge>
                    <p className="text-xs text-gray-500">
                      Plan estratégico, objetivos y pilares de contenido.
                    </p>
                    <Button size="sm" variant="outline" className="w-full gap-1.5" asChild>
                      <Link href={`/strategy?clienteId=${cliente.id}`}>
                        Crear estrategia
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* GEORadar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Radar className="h-4 w-4 text-amber-500" />
                  GEORadar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lastGeoradar?.[0] ? (() => {
                  const current = lastGeoradar[0]
                  const previous = lastGeoradar[1]
                  const currentScore = current.score_global ?? 0
                  const previousScore = previous?.score_global ?? null
                  const diff = previousScore !== null ? currentScore - previousScore : 0
                  const trendArrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→'
                  const trendColor =
                    diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'
                  return (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900">
                          {Math.round(currentScore)}
                        </span>
                        <span className="text-xs text-gray-500">/100</span>
                        <span className={`text-sm font-semibold ${trendColor}`}>
                          {trendArrow}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Último scan: {new Date(current.fecha_scan).toLocaleDateString('es-ES')}
                      </p>
                      <Button size="sm" variant="outline" className="w-full gap-1.5" asChild>
                        <Link href={`/georadar/${cliente.id}`}>
                          Ver informe
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </>
                  )
                })() : (
                  <>
                    <Badge variant="secondary" className="text-xs">Sin datos todavía</Badge>
                    <p className="text-xs text-gray-500">
                      Monitorización de presencia en IA generativa y búsquedas GEO.
                    </p>
                    <Button size="sm" variant="outline" className="w-full gap-1.5" asChild>
                      <Link href={`/georadar/${cliente.id}/configurar`}>
                        Configurar GEORadar
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 2: SEO / GEO ── */}
        <TabsContent value="seo">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Estrategia SEO / GEO</CardTitle>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditTab('seo')}>
                <Edit className="h-3.5 w-3.5" />Editar
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field label="Keywords objetivo"><TagList items={proyecto.keywords_objetivo} color="bg-green-50 text-green-700" /></Field>
              <Separator />
              <Field label="Keywords prohibidas"><TagList items={proyecto.keywords_prohibidas} color="bg-red-50 text-red-700" /></Field>
              <Separator />
              <Field label="Temáticas autorizadas"><TagList items={proyecto.tematicas_autorizadas} color="bg-teal-50 text-teal-700" /></Field>
              <Separator />
              <Field label="Temáticas vetadas"><TagList items={proyecto.tematicas_vetadas} color="bg-orange-50 text-orange-700" /></Field>
              <Separator />
              <Field label="Perfil del lector">{proyecto.perfil_lector || '—'}</Field>
              {proyecto.excel_seo_url && (
                <>
                  <Separator />
                  <Field label="Excel SEO">
                    <a href={proyecto.excel_seo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-indigo-600 hover:underline">
                      <Globe className="h-3.5 w-3.5" />Ver archivo SEO
                    </a>
                  </Field>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Base documental ── */}
        <TabsContent value="docs">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Estado del RAG</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-xs text-gray-500">Última actualización</p>
                    <p className="text-sm font-medium">
                      {proyecto.rag_ultima_actualizacion ? new Date(proyecto.rag_ultima_actualizacion).toLocaleDateString('es-ES') : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-500" />
                  <div>
                    <p className="text-xs text-gray-500">Documentos indexados</p>
                    <p className="text-sm font-medium">{proyecto.rag_num_documentos ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold">Documentos ({proyecto.documentos_subidos.length})</CardTitle>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setModalDocumento(true)}>
                  <Upload className="h-3.5 w-3.5" />Subir documento
                </Button>
              </CardHeader>
              <CardContent>
                {proyecto.documentos_subidos.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-400">Sin documentos subidos.</p>
                    <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setModalDocumento(true)}>
                      <Upload className="h-3.5 w-3.5" />Subir primer documento
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {proyecto.documentos_subidos.map((doc) => {
                      const ragEstado = ragEstados[doc.id]
                      const chunks    = ragChunks[doc.id]
                      const errorMsg  = ragErrores[doc.id]
                      const esRagable = /\.(csv|docx|doc|zip)$/i.test(doc.nombre)
                                     || /\.(csv|docx|doc|zip)(\?|$)/i.test(doc.url)
                      const ocupado   = ragEstado === 'procesando' || ragEstado === 'eliminando'

                      return (
                        <div key={doc.id} className="flex items-start justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors gap-3">

                          {/* ── Info del documento ── */}
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <FileText className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-gray-900 hover:text-indigo-600 hover:underline truncate block"
                              >
                                {doc.nombre}
                              </a>
                              {doc.descripcion && (
                                <p className="text-xs text-gray-500 mt-0.5">{doc.descripcion}</p>
                              )}
                              <p className="text-xs text-gray-400 mt-0.5">
                                {new Date(doc.fecha_subida).toLocaleDateString('es-ES')} · {doc.tamanyo_kb > 1024 ? `${(doc.tamanyo_kb / 1024).toFixed(1)} MB` : `${doc.tamanyo_kb} KB`}
                              </p>

                              {/* ── Badge estado RAG ── */}
                              {esRagable && (
                                <div className="mt-1.5">
                                  {!ragEstado && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                                      Sin procesar
                                    </span>
                                  )}
                                  {ragEstado === 'procesando' && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 animate-pulse">
                                      <Loader2 className="h-3 w-3 animate-spin" />Procesando…
                                    </span>
                                  )}
                                  {ragEstado === 'eliminando' && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 animate-pulse">
                                      <Loader2 className="h-3 w-3 animate-spin" />Eliminando…
                                    </span>
                                  )}
                                  {ragEstado === 'procesado' && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Procesado{chunks ? ` · ${chunks} chunks` : ''}
                                    </span>
                                  )}
                                  {ragEstado === 'error' && (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 cursor-help"
                                      title={errorMsg}
                                    >
                                      Error — {errorMsg ? errorMsg.slice(0, 60) : 'intenta de nuevo'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* ── Botones ── */}
                          <div className="flex items-center gap-1.5 shrink-0">

                            {/* BOTÓN 1 — Procesar / Reprocesar RAG */}
                            {esRagable && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-xs h-7 px-2.5"
                                onClick={() => procesarParaRAG(doc)}
                                disabled={ocupado}
                                title="Vectorizar para búsqueda RAG"
                              >
                                {ragEstado === 'procesando' ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" />Procesando…</>
                                ) : ragEstado === 'procesado' ? (
                                  <><Brain className="h-3 w-3" />Reprocesar</>
                                ) : (
                                  <><Brain className="h-3 w-3" />Procesar RAG</>
                                )}
                              </Button>
                            )}

                            {/* BOTÓN 2 — Eliminar embeddings del RAG (solo si procesado) */}
                            {esRagable && ragEstado === 'procesado' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
                                onClick={() => setConfirmDialog({
                                  tipo   : 'eliminar_rag',
                                  doc,
                                  titulo : 'Eliminar embeddings del RAG',
                                  mensaje: `¿Eliminar los embeddings de "${doc.nombre}" del RAG? El archivo se conserva pero dejará de estar disponible para búsquedas.`,
                                })}
                                disabled={ocupado}
                                title="Eliminar embeddings del RAG"
                              >
                                <Brain className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {/* Badge tipo */}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${coloresTipoDoc[doc.tipo]}`}>
                              {doc.tipo.replace('_', ' ')}
                            </span>

                            {/* BOTÓN 3 — Eliminar documento */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200"
                              onClick={() => setConfirmDialog({
                                tipo   : 'eliminar_doc',
                                doc,
                                titulo : 'Eliminar documento',
                                mensaje: `¿Eliminar "${doc.nombre}"? Se borrará el archivo de Storage${ragEstado === 'procesado' ? ' y sus embeddings del RAG' : ''}. Esta acción no se puede deshacer.`,
                              })}
                              disabled={ocupado}
                              title="Eliminar documento"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold">Accesos y conexiones</CardTitle>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditTab('accesos')}>
                  <Edit className="h-3.5 w-3.5" />Editar
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {proyecto.drive_carpeta_url ? (
                  <Field label="Carpeta Drive">
                    <a href={proyecto.drive_carpeta_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-indigo-600 hover:underline">
                      <FolderOpen className="h-3.5 w-3.5" />Abrir carpeta
                    </a>
                  </Field>
                ) : null}
                {proyecto.wordpress_url ? (
                  <>
                    {proyecto.drive_carpeta_url && <Separator />}
                    <Field label="WordPress URL">
                      <a href={proyecto.wordpress_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-indigo-600 hover:underline">
                        <Globe className="h-3.5 w-3.5" />{proyecto.wordpress_url}
                      </a>
                    </Field>
                  </>
                ) : null}
                {!proyecto.drive_carpeta_url && !proyecto.wordpress_url && (
                  <p className="text-sm text-gray-400">Sin accesos configurados.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 4: Entrega ── */}
        <TabsContent value="entrega">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Configuración de entrega</CardTitle>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditTab('entrega')}>
                <Edit className="h-3.5 w-3.5" />Editar
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field label="Modo de entrega"><Badge variant="secondary">{etiquetasModo[proyecto.modo_entrega]}</Badge></Field>
              {proyecto.cms_url && (
                <>
                  <Separator />
                  <Field label="URL del CMS">
                    <a href={proyecto.cms_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{proyecto.cms_url}</a>
                  </Field>
                </>
              )}
              {(proyecto.contacto_aprobacion_nombre || proyecto.contacto_aprobacion_email) && (
                <>
                  <Separator />
                  <Field label="Contacto de aprobación">
                    <div className="space-y-0.5">
                      {proyecto.contacto_aprobacion_nombre && <p>{proyecto.contacto_aprobacion_nombre}</p>}
                      {proyecto.contacto_aprobacion_email && (
                        <a href={`mailto:${proyecto.contacto_aprobacion_email}`} className="text-indigo-600 hover:underline">{proyecto.contacto_aprobacion_email}</a>
                      )}
                    </div>
                  </Field>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 5: Contenidos ── */}
        <TabsContent value="contenidos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Contenidos ({contenidos.length})</CardTitle>
              <Button size="sm" className="gap-1.5" onClick={() => setModalContenido(true)}>
                <Plus className="h-3.5 w-3.5" />Nuevo contenido
              </Button>
            </CardHeader>
            <CardContent>
              {contenidos.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-gray-400 text-sm">No hay contenidos todavía.</p>
                  <Button size="sm" className="mt-3 gap-1.5" onClick={() => setModalContenido(true)}>
                    <Plus className="h-3.5 w-3.5" />Crear primer contenido
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {contenidos.map((c) => (
                    <div key={c.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{c.titulo}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {c.keyword_principal && (
                            <span className="inline-flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">
                              {c.keyword_principal}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            {c.redactor_id ? (redactorMap[c.redactor_id] ?? 'Redactor') : 'Sin asignar'}
                          </span>
                          {c.fecha_entrega && (
                            <span className="text-xs text-gray-400">{formatearFecha(c.fecha_entrega)}</span>
                          )}
                          {c.tamanyo_texto_min && c.tamanyo_texto_max && (
                            <span className="text-xs text-gray-400">{c.tamanyo_texto_min}–{c.tamanyo_texto_max} palabras</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorEstadoContenido(c.estado)}`}>
                          {etiquetaEstadoContenido(c.estado)}
                        </span>
                        <Button variant="outline" size="sm" className="gap-1.5 h-7 px-2.5" asChild>
                          <Link href={`/contenidos/${c.id}`}>
                            <ExternalLink className="h-3 w-3" />Abrir
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Diálogo: confirmación de eliminación en dos pasos ── */}
      <Dialog open={confirmDelete} onOpenChange={(v) => { if (!v) { setConfirmDelete(false); setDeleteTyped('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar proyecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600 leading-relaxed">
              ¿Seguro que quieres eliminar el proyecto <strong>{proyecto.nombre}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Escribe el nombre del proyecto para confirmar:
              </Label>
              <Input
                value={deleteTyped}
                onChange={(e) => setDeleteTyped(e.target.value)}
                placeholder={proyecto.nombre}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setConfirmDelete(false); setDeleteTyped('') }}
              disabled={deletingProyecto}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteTyped !== proyecto.nombre || deletingProyecto}
              onClick={async () => {
                setDeletingProyecto(true)
                try {
                  await eliminarProyecto(proyecto.id, cliente.id)
                  // eliminarProyecto hace redirect() — esta línea no se ejecuta
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Error al eliminar'
                  alert(msg)
                  setDeletingProyecto(false)
                  setConfirmDelete(false)
                  setDeleteTyped('')
                }
              }}
              className="gap-2"
            >
              {deletingProyecto ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Eliminando…</>
              ) : (
                <><Trash2 className="h-4 w-4" /> Eliminar definitivamente</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modales ── */}
      <EditConfiguracionModal proyecto={proyecto} clienteId={cliente.id} open={editTab === 'configuracion'} onClose={() => setEditTab(null)} />
      <EditSeoModal proyecto={proyecto} clienteId={cliente.id} open={editTab === 'seo'} onClose={() => setEditTab(null)} />
      <EditAccesosModal proyecto={proyecto} clienteId={cliente.id} open={editTab === 'accesos'} onClose={() => setEditTab(null)} />
      <EditEntregaModal proyecto={proyecto} clienteId={cliente.id} open={editTab === 'entrega'} onClose={() => setEditTab(null)} />
      <SubirDocumentoModal proyectoId={proyecto.id} clienteId={cliente.id} open={modalDocumento} onClose={() => setModalDocumento(false)} />
      <NuevoContenidoModal proyectoId={proyecto.id} clienteId={cliente.id} autores={autores} open={modalContenido} onClose={() => setModalContenido(false)} />

      {/* ── Diálogo de confirmación (RAG + eliminar doc) ── */}
      <Dialog open={!!confirmDialog} onOpenChange={(v) => !v && !confirmando && setConfirmDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmDialog?.titulo}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2 leading-relaxed">
            {confirmDialog?.mensaje}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(null)}
              disabled={confirmando}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmar}
              disabled={confirmando}
              className="gap-2"
            >
              {confirmando ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Eliminando…</>
              ) : (
                <><Trash2 className="h-3.5 w-3.5" />Eliminar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
