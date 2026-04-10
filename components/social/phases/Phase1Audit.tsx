'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Save } from 'lucide-react'
import AuditByPlatform, { type PlatformData } from './AuditByPlatform'
import AuditBenchmark from './AuditBenchmark'
import AuditSynthesis from './AuditSynthesis'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  clientId        : string
  onPhaseComplete?: () => void
}

type Tab = 'auditoria' | 'benchmark' | 'sintesis'

const TABS: Array<{ id: Tab; label: string; emoji: string }> = [
  { id: 'auditoria', label: 'Auditoría por plataforma', emoji: '📊' },
  { id: 'benchmark', label: 'Benchmark',                emoji: '🔍' },
  { id: 'sintesis',  label: 'Síntesis y aprobación',    emoji: '✅' },
]

const PLATFORMS = ['linkedin', 'twitter_x', 'instagram', 'facebook', 'tiktok', 'youtube'] as const

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Phase1Audit({ clientId, onPhaseComplete }: Props) {
  const [activeTab,    setActiveTab]    = useState<Tab>('auditoria')
  const [platforms,    setPlatforms]    = useState<PlatformData[]>([])
  const [loading,      setLoading]      = useState(true)
  const [autoSaveMsg,  setAutoSaveMsg]  = useState<string | null>(null)

  const fetchPlatforms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/platforms?clientId=${clientId}`)
      if (res.ok) {
        const data = await res.json() as PlatformData[]
        setPlatforms(data)
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { fetchPlatforms() }, [fetchPlatforms])

  function handlePlatformSaved(saved: PlatformData) {
    setPlatforms((prev) => {
      const idx = prev.findIndex((p) => p.platform === saved.platform)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [...prev, saved]
    })
    setAutoSaveMsg(`Guardado · ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`)
    setTimeout(() => setAutoSaveMsg(null), 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando auditoría…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Descripción ── */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800 font-medium">Auditoría y benchmark social</p>
        <p className="text-xs text-blue-700 mt-0.5">
          Analiza el estado actual del cliente en cada red social, estudia referentes del sector
          y genera una síntesis estratégica para aprobar la fase.
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1" aria-label="Pestañas de auditoría">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <span className="mr-1.5">{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Indicador de autoguardado ── */}
      {autoSaveMsg && (
        <div className="flex items-center gap-1.5 text-xs text-green-600 animate-in fade-in slide-in-from-top-1">
          <Save className="h-3 w-3" />
          {autoSaveMsg}
        </div>
      )}

      {/* ── Contenido por tab ── */}
      {activeTab === 'auditoria' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Rellena los datos de cada plataforma donde el cliente tiene o puede tener presencia.
            Los campos se guardan automáticamente al salir de cada campo.
          </p>
          {PLATFORMS.map((platform) => {
            const existingData = platforms.find((p) => p.platform === platform)
            return (
              <AuditByPlatform
                key={platform}
                clientId={clientId}
                platform={platform}
                initialData={existingData}
                onSaved={handlePlatformSaved}
              />
            )
          })}
        </div>
      )}

      {activeTab === 'benchmark' && (
        <AuditBenchmark
          clientId={clientId}
          onDataChange={() => {
            setAutoSaveMsg(`Guardado · ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`)
            setTimeout(() => setAutoSaveMsg(null), 3000)
          }}
        />
      )}

      {activeTab === 'sintesis' && (
        <AuditSynthesis
          clientId={clientId}
          onPhaseComplete={onPhaseComplete}
        />
      )}
    </div>
  )
}
