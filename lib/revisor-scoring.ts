// ─────────────────────────────────────────────────────────────────────────
// Cálculo determinista de las puntuaciones SEO / GEO / TOTAL del Revisor GEO-SEO
// ---------------------------------------------------------------------------
// Claude YA NO puntúa. Solo evalúa cada ítem de forma cualitativa (estados
// "ok" / "mejorable" / "ausente"…). Estas fórmulas derivan las notas 0-100 a
// partir de esas evaluaciones estructuradas, de forma reproducible.
// ─────────────────────────────────────────────────────────────────────────

export interface InformeRevisor {
  puntuacion_seo?: number
  puntuacion_geo?: number
  puntuacion_total?: number
  extension?: {
    palabras_actual?: number
    palabras_objetivo_min?: number | null
    palabras_objetivo_max?: number | null
    estado?: string
  }
  keyword_principal?: { estado?: string }
  estructura_hs?: {
    estado?: string
    h1_duplicado?: boolean
    jerarquia_correcta?: boolean
  }
  title_seo?: { estado?: string }
  meta_description?: { estado?: string }
  keywords_secundarias?: Array<{ keyword?: string; estado?: string }>
  enlaces_internos_check?: { total_requeridos?: number; insertados?: number }
  principios_geo?: Array<{ estado?: string }>
}

export interface PuntoDesglose {
  label: string
  puntos: number
  max: number
  detalle?: string
}

export interface DesgloseGeo {
  ok: number
  mejorable: number
  otros: number
  na: number       // principios "no_aplica" (excluidos del denominador)
  aplican: number  // principios que sí puntúan (sobre los que se reparten los 100 pts)
  puntos: number
  texto: string
}

export interface Puntuaciones {
  seo: number
  geo: number
  total: number
  desgloseSeo: PuntoDesglose[]
  desgloseGeo: DesgloseGeo
}

const norm = (s?: string) => (s ?? '').toString().trim().toLowerCase()

// Formatea un número quitando ceros sobrantes y con coma decimal (es-ES).
const fmtNum = (x: number) => Number(x.toFixed(2)).toString().replace('.', ',')

// ─── GEO — 100 pts repartidos entre los principios que APLICAN ───────────
// Los "no_aplica" se excluyen del denominador. Con N principios aplicables,
// cada uno vale 100/N pts (OK → completo · Mejorable → 48% · resto → 0).
// El 48% mantiene la calibración heredada (6 sobre 12,5 con los 8 originales).
const PESO_MEJORABLE = 0.48
function calcularGeo(informe: InformeRevisor): DesgloseGeo {
  const principios = Array.isArray(informe.principios_geo) ? informe.principios_geo : []
  const aplicables = principios.filter((p) => norm(p?.estado) !== 'no_aplica')
  const na = principios.length - aplicables.length
  const n = aplicables.length

  if (n === 0) {
    return { ok: 0, mejorable: 0, otros: 0, na, aplican: 0, puntos: 0, texto: 'Sin principios aplicables' }
  }

  const pesoOk = 100 / n
  const pesoMejorable = pesoOk * PESO_MEJORABLE

  let ok = 0
  let mejorable = 0
  let otros = 0
  let puntos = 0

  for (const p of aplicables) {
    const e = norm(p?.estado)
    if (e === 'ok') { ok++; puntos += pesoOk }
    else if (e === 'mejorable') { mejorable++; puntos += pesoMejorable }
    else { otros++ } // ausente / problema → 0 pts
  }

  const partes: string[] = []
  if (ok) partes.push(`${ok} OK`)
  if (mejorable) partes.push(`${mejorable} mejorable`)
  if (otros) partes.push(`${otros} ausente`)
  let texto = `${partes.join(' + ') || 'Sin evaluar'} · ${n}/${principios.length} aplican (${fmtNum(pesoOk)} pts c/u)`
  if (na) texto += ` · ${na} N/A excluidos`

  return {
    ok,
    mejorable,
    otros,
    na,
    aplican: n,
    puntos: Math.round(puntos),
    texto,
  }
}

// ─── SEO — checklist ponderada (100 pts) ─────────────────────────────────
function calcularSeo(informe: InformeRevisor): { puntos: number; desglose: PuntoDesglose[] } {
  const desglose: PuntoDesglose[] = []
  let total = 0
  const add = (label: string, puntos: number, max: number, detalle?: string) => {
    total += puntos
    desglose.push({ label, puntos, max, detalle })
  }

  // 1 · Keyword principal — 20 (mejorable/atención: 10, problema: 0)
  {
    const e = norm(informe.keyword_principal?.estado)
    const pts = e === 'ok' ? 20 : (e === 'atencion' || e === 'mejorable') ? 10 : 0
    add('Keyword principal', pts, 20, `estado: ${e || '—'}`)
  }

  // 2 · Extensión — 15 (fuera de rango <20%: 8, más: 0)
  {
    const ext = informe.extension ?? {}
    const actual = Number(ext.palabras_actual)
    const min = ext.palabras_objetivo_min ?? null
    const max = ext.palabras_objetivo_max ?? null
    let pts = 15
    let detalle = 'sin objetivo definido'
    if (min != null && max != null && Number.isFinite(actual)) {
      if (actual >= min && actual <= max) {
        pts = 15
        detalle = 'dentro del rango'
      } else {
        const dev = actual < min ? (min - actual) / min : (actual - max) / max
        pts = dev < 0.20 ? 8 : 0
        detalle = `fuera de rango (${Math.round(dev * 100)}%)`
      }
    } else if (norm(ext.estado) === 'ok') {
      pts = 15
      detalle = 'ok'
    }
    add('Extensión', pts, 15, detalle)
  }

  // 3 · Estructura H's — 20 (modificada: 10, incompleta: 0)
  {
    const e = norm(informe.estructura_hs?.estado)
    const pts = e === 'respetada' ? 20 : e === 'modificada' ? 10 : 0
    add("Estructura H's", pts, 20, `estado: ${e || '—'}`)
  }

  // 4 · Meta description — 10 (mejorable: 5, ausente: 0)
  {
    const e = norm(informe.meta_description?.estado)
    const pts = e === 'ok' ? 10 : e === 'mejorable' ? 5 : 0
    add('Meta description', pts, 10, `estado: ${e || '—'}`)
  }

  // 5 · Title SEO — 10 (mejorable: 5, ausente: 0)
  {
    const e = norm(informe.title_seo?.estado)
    const pts = e === 'ok' ? 10 : e === 'mejorable' ? 5 : 0
    add('Title SEO', pts, 10, `estado: ${e || '—'}`)
  }

  // 6 · Keywords secundarias — 15 (≥50%: 15, 25-50%: 8, <25%: 0)
  {
    const arr = Array.isArray(informe.keywords_secundarias) ? informe.keywords_secundarias : []
    const totalKw = arr.length
    let pts = 15
    let detalle = 'sin secundarias requeridas'
    if (totalKw > 0) {
      const usadas = arr.reduce((acc, k) => {
        const e = norm(k?.estado)
        return acc + (e === 'presente' ? 1 : e === 'parcial' ? 0.5 : 0)
      }, 0)
      const ratio = usadas / totalKw
      pts = ratio >= 0.5 ? 15 : ratio >= 0.25 ? 8 : 0
      detalle = `${Math.round(ratio * 100)}% usadas`
    }
    add('Keywords secundarias', pts, 15, detalle)
  }

  // 7 · Enlaces internos — 10 (parcial: 5, ninguno: 0)
  {
    const chk = informe.enlaces_internos_check
    const req = Number(chk?.total_requeridos ?? 0)
    const ins = Number(chk?.insertados ?? 0)
    let pts = 10
    let detalle = 'sin enlaces requeridos'
    if (req > 0) {
      pts = ins >= req ? 10 : ins > 0 ? 5 : 0
      detalle = `${ins}/${req} insertados`
    }
    add('Enlaces internos', pts, 10, detalle)
  }

  return { puntos: Math.round(total), desglose }
}

/**
 * Calcula las tres puntuaciones (SEO, GEO, TOTAL) de forma determinista a
 * partir de las evaluaciones cualitativas del informe del Revisor.
 */
export function calcularPuntuaciones(informe: InformeRevisor): Puntuaciones {
  const geo = calcularGeo(informe)
  const seo = calcularSeo(informe)
  const total = Math.round((seo.puntos + geo.puntos) / 2)
  return {
    seo: seo.puntos,
    geo: geo.puntos,
    total,
    desgloseSeo: seo.desglose,
    desgloseGeo: geo,
  }
}
