export type LLMProvider = 'claude' | 'gpt4' | 'gemini' | 'perplexity';
export type GeoTier = 'basico' | 'estandar' | 'premium';
export type Frecuencia = 'mensual' | 'quincenal';
export type Sentimiento = 'positivo' | 'neutro' | 'negativo' | 'no_mencionado';
export type EstadoScan = 'pendiente' | 'ejecutando' | 'completado' | 'error';

export interface GeoRadarConfig {
  id: string;
  cliente_id: string;
  tier: GeoTier;
  frecuencia: Frecuencia;
  llms_activos: LLMProvider[];
  max_queries: number;
  activo: boolean;
}

export interface GeoQuery {
  id: string;
  config_id: string;
  cliente_id: string;
  query_texto: string;
  categoria: 'sector' | 'producto' | 'marca' | 'competencia' | 'problema';
  prioridad: number;
  activa: boolean;
}

export interface GeoCompetidor {
  id: string;
  nombre: string;
  dominio?: string;
  aliases: string[];
}

export interface LLMResponse {
  llm: LLMProvider;
  query_texto: string;
  respuesta_raw: string;
  tokens_entrada: number;
  tokens_salida: number;
  coste_usd: number;
  error?: string;
}

export interface AnalisisPresencia {
  marca_mencionada: boolean;
  posicion_primera_mencion: number | null;
  numero_menciones: number;
  sentimiento: Sentimiento;
  atributos_asociados: string[];
  competidores_mencionados: Array<{
    nombre: string;
    menciones: number;
    sentimiento: Sentimiento;
  }>;
  fuentes_citadas: string[];
  score: number;
}

export interface InformeData {
  scan_id: string;
  cliente_id: string;
  cliente_nombre: string;
  periodo: string;
  score_global: number;
  score_anterior: number | null;
  evolucion: number;
  scores_por_llm: Record<LLMProvider, number>;
  atributos_dominantes: string[];
  atributos_ausentes: string[];
  narrativa_resumen: string;
  posicion_competitiva: {
    lidera: Array<{ query: string; score: number }>;
    pierde: Array<{ query: string; score: number; lider: string }>;
  };
  top_fuentes: Array<{ url: string; frecuencia: number }>;
  recomendaciones: Array<{
    gap: string;
    accion: string;
    tipo_contenido: string;
    urgencia: 'alta' | 'media' | 'baja';
    queries_afectadas: string[];
  }>;
}

export const TIER_CONFIG: Record<GeoTier, {
  nombre: string;
  precio_eur: number;
  max_queries: number;
  llms: number;
  frecuencia: Frecuencia;
}> = {
  basico: {
    nombre: 'Básico',
    precio_eur: 49,
    max_queries: 20,
    llms: 2,
    frecuencia: 'mensual',
  },
  estandar: {
    nombre: 'Estándar',
    precio_eur: 149,
    max_queries: 30,
    llms: 4,
    frecuencia: 'mensual',
  },
  premium: {
    nombre: 'Premium',
    precio_eur: 299,
    max_queries: 50,
    llms: 4,
    frecuencia: 'quincenal',
  },
};
