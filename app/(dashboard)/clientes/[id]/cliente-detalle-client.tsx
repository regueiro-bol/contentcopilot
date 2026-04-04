'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Edit, Trash2, Plus, Sparkles, ChevronRight,
  CheckCircle2, XCircle, Clock, Image as ImageIcon, ArrowRight,
  Loader2, Link2, Globe, AlertCircle,
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
import {
  actualizarClienteIdentidad,
  actualizarClienteMarca,
  crearProyecto,
} from './actions'
import type { Cliente, Proyecto, ProyectoFormData } from '@/types'
import type { BrandAssetsCoverage, GenerationStatus } from '@/types/brand-assets'

type ProyectoConCount = Proyecto & { num_contenidos: number }

const etiquetasModo: Record<string, string> = {
  drive: 'Drive', cms: 'CMS', word: 'Word', email: 'Email',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Tag({ children, color = 'bg-indigo-50 text-indigo-700' }: { children: string; color?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {children}
    </span>
  )
}

function TagList({ items, color }: { items: string[]; color?: string }) {
  if (!items?.length) return <span className="text-sm text-gray-400">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => <Tag key={i} color={color}>{i}</Tag>)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal: Editar identidad
// ---------------------------------------------------------------------------
function EditarIdentidadModal({
  cliente, open, onClose,
}: { cliente: Cliente; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [nombre, setNombre] = useState(cliente.nombre)
  const [sector, setSector] = useState(cliente.sector)
  const [urlWeb, setUrlWeb] = useState(cliente.url_web)
  const [descripcion, setDescripcion] = useState(cliente.descripcion)
  const [am, setAm] = useState(cliente.account_manager_id)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGuardar() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setGuardando(true)
    setError(null)
    try {
      await actualizarClienteIdentidad(cliente.id, {
        nombre, sector, url_web: urlWeb, descripcion, account_manager_id: am,
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
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar identidad</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sector</Label>
            <Input value={sector} onChange={(e) => setSector(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>URL web</Label>
            <Input value={urlWeb} onChange={(e) => setUrlWeb(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción corporativa</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Account Manager</Label>
            <Input value={am} onChange={(e) => setAm(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 px-1 pb-1">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Modal: Editar marca global
// ---------------------------------------------------------------------------
function EditarMarcaModal({
  cliente, open, onClose,
}: { cliente: Cliente; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [identidad, setIdentidad] = useState(cliente.identidad_corporativa)
  const [restricciones, setRestricciones] = useState(
    (cliente.restricciones_globales ?? []).join(', '),
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGuardar() {
    setGuardando(true)
    setError(null)
    try {
      await actualizarClienteMarca(cliente.id, {
        identidad_corporativa: identidad,
        restricciones_globales: restricciones
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
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
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar marca global</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Identidad corporativa</Label>
            <Textarea
              value={identidad}
              onChange={(e) => setIdentidad(e.target.value)}
              rows={5}
              placeholder="Describe la identidad de marca, valores y personalidad..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Restricciones globales</Label>
            <Input
              value={restricciones}
              onChange={(e) => setRestricciones(e.target.value)}
              placeholder="Competencia, términos vetados, ..."
            />
            <p className="text-xs text-gray-400">Separadas por comas. Se aplican a TODOS los proyectos.</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 px-1 pb-1">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Modal: Nuevo proyecto
// ---------------------------------------------------------------------------
function NuevoProyectoModal({
  clienteId, open, onClose,
}: { clienteId: string; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState<Partial<ProyectoFormData>>({ modo_entrega: 'drive' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre?.trim()) { setError('El nombre es obligatorio'); return }
    setGuardando(true)
    setError(null)
    try {
      await crearProyecto(clienteId, {
        nombre: form.nombre!,
        descripcion: form.descripcion ?? '',
        tono_voz: form.tono_voz ?? '',
        modo_entrega: form.modo_entrega ?? 'drive',
      })
      router.refresh()
      onClose()
      setForm({ modo_entrega: 'drive' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el proyecto')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo proyecto</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input
              placeholder="Ej: Blog Impulsa Empresa"
              value={form.nombre ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea
              placeholder="Canal editorial y público al que va dirigido..."
              rows={2}
              value={form.descripcion ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tono de voz</Label>
            <Textarea
              placeholder="Ej: Cercano, práctico y orientado a la acción..."
              rows={2}
              value={form.tono_voz ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, tono_voz: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Modo de entrega</Label>
            <select
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.modo_entrega ?? 'drive'}
              onChange={(e) => setForm((p) => ({ ...p, modo_entrega: e.target.value as ProyectoFormData['modo_entrega'] }))}
            >
              <option value="drive">Google Drive</option>
              <option value="cms">CMS / WordPress</option>
              <option value="word">Word / Documento</option>
              <option value="email">Email</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Creando...' : 'Crear proyecto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Tab: Brand Assets — resumen + enlace al panel completo
// ---------------------------------------------------------------------------

function GenerationStatusRow({ status }: { status: GenerationStatus }) {
  const config: Record<GenerationStatus, { icon: React.ReactNode; label: string; color: string }> = {
    ready:   { icon: <CheckCircle2 className="h-4 w-4 text-green-500" />, label: 'Listo para generar', color: 'text-green-700' },
    pending: { icon: <Clock className="h-4 w-4 text-amber-500" />,       label: 'Marca incompleta',   color: 'text-amber-700' },
    blocked: { icon: <XCircle className="h-4 w-4 text-red-400" />,       label: 'Bloqueado',          color: 'text-red-600'   },
  }
  const { icon, label, color } = config[status]
  return (
    <div className={`flex items-center gap-2 font-medium text-sm ${color}`}>
      {icon}
      {label}
    </div>
  )
}

function BrandAssetsTab({
  clienteId,
  coverage,
}: {
  clienteId: string
  coverage: BrandAssetsCoverage | null
}) {
  const noAssets = !coverage || coverage.total_assets === 0

  const checks: { label: string; ok: boolean; required?: boolean }[] = coverage
    ? [
        { label: 'Logo aprobado',        ok: coverage.has_logo,           required: true  },
        { label: 'Brand book aprobado',  ok: coverage.has_brand_book,     required: true  },
        { label: 'Contexto extraído',    ok: coverage.has_context,        required: true  },
        { label: 'Imágenes de producto', ok: coverage.has_product_images, required: false },
      ]
    : []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">Activos de marca</CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" asChild>
          <Link href={`/clientes/${clienteId}/brand-assets`}>
            Ver panel completo
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {noAssets ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <ImageIcon className="h-10 w-10 text-gray-300" />
            <div>
              <p className="text-sm font-medium text-gray-600">Sin activos de marca todavía</p>
              <p className="text-xs text-gray-400 mt-1">
                Sincroniza la carpeta de Drive para importar logos, colores y más.
              </p>
            </div>
            <Button size="sm" className="gap-1.5 mt-1" asChild>
              <Link href={`/clientes/${clienteId}/brand-assets`}>
                Ir al panel de Brand Assets
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Estado */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Estado de generación
              </p>
              <GenerationStatusRow status={coverage!.generation_status} />
              <div className="space-y-2 pt-1">
                {checks.map(({ label, ok, required }) => (
                  <div key={label} className="flex items-center gap-2">
                    {ok ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className={`h-4 w-4 flex-shrink-0 ${required ? 'text-red-400' : 'text-gray-300'}`} />
                    )}
                    <span className={`text-sm ${ok ? 'text-gray-700' : required ? 'text-gray-500' : 'text-gray-400'}`}>
                      {label}
                      {required && !ok && <span className="ml-1 text-xs text-red-500">*</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Estadísticas */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Resumen
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total activos</span>
                  <span className="font-semibold text-gray-900">{coverage!.total_assets}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Pendientes de revisión</span>
                  <span className={`font-semibold ${coverage!.pending_review > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                    {coverage!.pending_review}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Aprobados</span>
                  <span className="font-semibold text-green-700">
                    {coverage!.total_assets - coverage!.pending_review}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Sección: Conexiones digitales (Google)
// ---------------------------------------------------------------------------

interface GSCProp { siteUrl: string; permissionLevel: string | null }
interface GA4Prop { propertyId: string; displayName: string; account: string | null }
interface GoogleAccountOption { id: string; email: string; display_name: string | null }
interface ExistingConnection {
  id: string
  google_account_id: string
  gsc_property_url: string | null
  ga4_property_id: string | null
  status: string
  google_accounts?: { email: string; display_name: string | null }
}

function GoogleConnectionsSection({ clienteId }: { clienteId: string }) {
  const [accounts, setAccounts]       = useState<GoogleAccountOption[]>([])
  const [connection, setConnection]   = useState<ExistingConnection | null>(null)
  const [selectedAccount, setSelectedAccount] = useState('')
  const [gscProps, setGscProps]       = useState<GSCProp[]>([])
  const [ga4Props, setGa4Props]       = useState<GA4Prop[]>([])
  const [selectedGSC, setSelectedGSC] = useState('')
  const [selectedGA4, setSelectedGA4] = useState('')
  const [loadingProps, setLoadingProps] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [success, setSuccess]         = useState(false)

  // Cargar cuentas Google y conexión existente al montar
  useEffect(() => {
    ;(async () => {
      try {
        // Cargar cuentas disponibles
        const accRes = await fetch('/api/google/accounts')
        const accData = await accRes.json()
        if (accRes.ok) setAccounts(accData.accounts ?? [])

        // Cargar conexión existente para este cliente
        let preloadAccountId: string | null = null
        const connRes = await fetch(`/api/google/connections?client_id=${clienteId}`)
        if (connRes.ok) {
          const connData = await connRes.json()
          const conn = connData.connection as ExistingConnection | null
          if (conn) {
            setConnection(conn)
            setSelectedAccount(conn.google_account_id)
            setSelectedGSC(conn.gsc_property_url ?? '')
            setSelectedGA4(conn.ga4_property_id ?? '')
            preloadAccountId = conn.google_account_id
          }
        }

        // Si hay conexión existente, cargar las propiedades para que los dropdowns funcionen
        if (preloadAccountId) {
          try {
            const propsRes = await fetch(`/api/google/accounts/${preloadAccountId}/properties`)
            const propsData = await propsRes.json()
            if (propsRes.ok) {
              setGscProps(propsData.gsc ?? [])
              setGa4Props(propsData.ga4 ?? [])
              console.log(`[Conexiones] Propiedades precargadas: GSC=${(propsData.gsc ?? []).length}, GA4=${(propsData.ga4 ?? []).length}`)
            }
          } catch {
            console.warn('[Conexiones] Error precargando propiedades')
          }
        }
      } catch {
        // silently fail on load
      } finally {
        setLoading(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cargar propiedades de una cuenta Google
  async function loadProperties(accountId: string) {
    if (!accountId) return

    setLoadingProps(true)
    setError(null)
    try {
      console.log(`[Conexiones] Cargando propiedades para cuenta: ${accountId}`)
      const res  = await fetch(`/api/google/accounts/${accountId}/properties`)
      const data = await res.json()
      console.log(`[Conexiones] Response properties:`, JSON.stringify(data).substring(0, 500))
      if (!res.ok) throw new Error(data.error ?? 'Error cargando propiedades')
      setGscProps(data.gsc ?? [])
      setGa4Props(data.ga4 ?? [])
      console.log(`[Conexiones] GSC: ${(data.gsc ?? []).length} propiedades, GA4: ${(data.ga4 ?? []).length} propiedades`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando propiedades')
    } finally {
      setLoadingProps(false)
    }
  }

  // Cambiar cuenta seleccionada
  async function handleAccountChange(accountId: string) {
    setSelectedAccount(accountId)
    setSelectedGSC('')
    setSelectedGA4('')
    setGscProps([])
    setGa4Props([])
    setError(null)

    await loadProperties(accountId)
  }

  // Guardar conexión
  async function handleSave() {
    if (!selectedAccount) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    const body = {
      client_id        : clienteId,
      google_account_id: selectedAccount,
      gsc_property_url : selectedGSC || null,
      ga4_property_id  : selectedGA4 || null,
    }
    console.log('[Conexiones] Guardando conexión, body:', JSON.stringify(body))

    try {
      const res = await fetch('/api/google/connections', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(body),
      })
      const data = await res.json()
      console.log('[Conexiones] Response save:', JSON.stringify(data).substring(0, 500))
      if (!res.ok) throw new Error(data.error ?? 'Error guardando')
      setConnection(data.connection)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      console.error('[Conexiones] Error guardando:', e)
      setError(e instanceof Error ? e.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
          Cargando conexiones...
        </CardContent>
      </Card>
    )
  }

  if (accounts.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Conexiones digitales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            No hay cuentas Google conectadas.{' '}
            <Link href="/settings/google-accounts" className="text-indigo-600 hover:underline">
              Conecta una cuenta
            </Link>{' '}
            para acceder a Search Console y Analytics.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Conexiones digitales
        </CardTitle>
        {connection && (
          <Badge variant={connection.status === 'active' ? 'success' : 'destructive'}>
            {connection.status === 'active' ? 'Conectado' : connection.status}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selector de cuenta Google */}
        <div className="space-y-1.5">
          <Label className="text-xs">Cuenta Google</Label>
          <select
            value={selectedAccount}
            onChange={(e) => handleAccountChange(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Seleccionar cuenta...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}{a.display_name ? ` (${a.display_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Loading propiedades */}
        {loadingProps && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando propiedades de Google...
          </div>
        )}

        {/* Propiedades GSC */}
        {selectedAccount && !loadingProps && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Propiedad Search Console</Label>
              <select
                value={selectedGSC}
                onChange={(e) => setSelectedGSC(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Sin asignar</option>
                {gscProps.map((p) => (
                  <option key={p.siteUrl} value={p.siteUrl}>{p.siteUrl}</option>
                ))}
              </select>
              {gscProps.length === 0 && (
                <p className="text-xs text-gray-400">Sin propiedades GSC disponibles</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Propiedad Analytics 4</Label>
              <select
                value={selectedGA4}
                onChange={(e) => setSelectedGA4(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Sin asignar</option>
                {ga4Props.map((p) => (
                  <option key={p.propertyId} value={p.propertyId}>
                    {p.displayName}{p.account ? ` — ${p.account}` : ''}
                  </option>
                ))}
              </select>
              {ga4Props.length === 0 && (
                <p className="text-xs text-gray-400">Sin propiedades GA4 disponibles</p>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Éxito */}
        {success && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Conexión guardada correctamente.
          </div>
        )}

        {/* Botón guardar */}
        {selectedAccount && !loadingProps && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-2"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando...</>
              : <><Link2 className="h-4 w-4" />Guardar conexión</>
            }
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function ClienteDetalleClient({
  cliente,
  proyectos,
  coverage,
}: {
  cliente: Cliente
  proyectos: ProyectoConCount[]
  coverage?: BrandAssetsCoverage | null
}) {
  const [editando, setEditando] = useState<'identidad' | 'marca' | null>(null)
  const [modalProyecto, setModalProyecto] = useState(false)

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl">
            {cliente.nombre.split(' ').slice(0, 2).map((w) => w[0]).join('')}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{cliente.nombre}</h2>
              <Badge variant={cliente.activo ? 'success' : 'secondary'}>
                {cliente.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">{cliente.sector}</p>
          </div>
        </div>
        <Button size="sm" className="gap-2" asChild>
          <Link href={`/copiloto?cliente=${cliente.id}`}>
            <Sparkles className="h-4 w-4" />
            Usar copiloto
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="identidad">
        <TabsList>
          <TabsTrigger value="identidad">Identidad</TabsTrigger>
          <TabsTrigger value="marca">Marca global</TabsTrigger>
          <TabsTrigger value="proyectos">
            Proyectos ({proyectos.length})
          </TabsTrigger>
          <TabsTrigger value="brand-assets" className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            Brand Assets
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Identidad ── */}
        <TabsContent value="identidad">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Identidad corporativa</CardTitle>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditando('identidad')}>
                <Edit className="h-3.5 w-3.5" />
                Editar
              </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre</p>
                <p className="text-sm text-gray-800">{cliente.nombre}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Sector</p>
                <p className="text-sm text-gray-800">{cliente.sector || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">URL web</p>
                {cliente.url_web ? (
                  <a href={cliente.url_web} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:underline">{cliente.url_web}</a>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Account Manager</p>
                <p className="text-sm text-gray-800">{cliente.account_manager_id || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Alta</p>
                <p className="text-sm text-gray-800">
                  {new Date(cliente.created_at).toLocaleDateString('es-ES', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Estado</p>
                <Badge variant={cliente.activo ? 'success' : 'secondary'}>
                  {cliente.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descripción corporativa</p>
                <p className="text-sm text-gray-800">{cliente.descripcion || '—'}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Marca global ── */}
        <TabsContent value="marca">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Identidad de marca global</CardTitle>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditando('marca')}>
                <Edit className="h-3.5 w-3.5" />
                Editar
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Identidad corporativa</p>
                {cliente.identidad_corporativa ? (
                  <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 border border-gray-100">
                    {cliente.identidad_corporativa}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">Sin definir.</p>
                )}
              </div>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Restricciones globales
                  <span className="ml-2 font-normal text-gray-400 normal-case">(aplican a todos los proyectos)</span>
                </p>
                <TagList items={cliente.restricciones_globales} color="bg-red-50 text-red-700" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Proyectos ── */}
        <TabsContent value="proyectos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">
                Proyectos del cliente ({proyectos.length})
              </CardTitle>
              <Button size="sm" className="gap-1.5" onClick={() => setModalProyecto(true)}>
                <Plus className="h-3.5 w-3.5" />
                Nuevo proyecto
              </Button>
            </CardHeader>
            <CardContent>
              {proyectos.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-gray-400 text-sm">No hay proyectos todavía.</p>
                  <Button size="sm" className="mt-3 gap-1.5" onClick={() => setModalProyecto(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Crear primer proyecto
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {proyectos.map((proyecto) => (
                    <Link
                      key={proyecto.id}
                      href={`/clientes/${cliente.id}/proyectos/${proyecto.id}`}
                      className="block group"
                    >
                      <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                            <span className="text-indigo-700 text-xs font-bold">
                              {proyecto.nombre.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors truncate">
                                {proyecto.nombre}
                              </p>
                              <Badge variant={proyecto.activo ? 'success' : 'secondary'} className="shrink-0">
                                {proyecto.activo ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{proyecto.descripcion}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-xs text-gray-400">
                                {proyecto.num_contenidos} contenido{proyecto.num_contenidos !== 1 ? 's' : ''}
                              </span>
                              <span className="text-xs text-gray-300">·</span>
                              <span className="text-xs text-gray-400">
                                Entrega: {etiquetasModo[proyecto.modo_entrega]}
                              </span>
                              <span className="text-xs text-gray-300">·</span>
                              <span className={`text-xs font-medium ${proyecto.modo_creativo ? 'text-purple-600' : 'text-blue-600'}`}>
                                {proyecto.modo_creativo ? 'Modo autor' : 'Modo cliente'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 shrink-0 ml-2 transition-colors" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Tab 4: Brand Assets ── */}
        <TabsContent value="brand-assets">
          <BrandAssetsTab clienteId={cliente.id} coverage={coverage ?? null} />
        </TabsContent>
      </Tabs>

      {/* Conexiones digitales (Google) */}
      <GoogleConnectionsSection clienteId={cliente.id} />

      {/* Zona peligrosa */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-red-700">Zona peligrosa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700">Eliminar este cliente</p>
              <p className="text-xs text-gray-500">
                Se eliminarán también todos sus proyectos y contenidos. Esta acción no se puede deshacer.
              </p>
            </div>
            <Button variant="destructive" size="sm" className="gap-2">
              <Trash2 className="h-4 w-4" />
              Eliminar cliente
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modales */}
      <EditarIdentidadModal
        cliente={cliente}
        open={editando === 'identidad'}
        onClose={() => setEditando(null)}
      />
      <EditarMarcaModal
        cliente={cliente}
        open={editando === 'marca'}
        onClose={() => setEditando(null)}
      />
      <NuevoProyectoModal
        clienteId={cliente.id}
        open={modalProyecto}
        onClose={() => setModalProyecto(false)}
      />
    </div>
  )
}
