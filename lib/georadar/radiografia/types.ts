/**
 * Radiografía Express — tipos compartidos entre servidor y cliente.
 *
 * La radiografía es un scan puntual de un dominio que NO es cliente:
 * no toca las tablas georadar_* ni el histórico de los informes de clientes.
 */

export type Motor = 'chatgpt' | 'gemini' | 'perplexity';

export const MOTORES: Motor[] = ['chatgpt', 'gemini', 'perplexity'];

export const MOTOR_LABEL: Record<Motor, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

export interface Fuente {
  url: string;
  titulo?: string;
}

/** Respuesta en bruto de un motor con búsqueda web activada */
export interface RespuestaMotor {
  motor: Motor;
  modelo: string;
  respuesta: string;
  fuentes: Fuente[];
  tokens_entrada: number;
  tokens_salida: number;
  duracion_ms: number;
  error?: string;
}

export interface NegocioMencionado {
  nombre: string;
  posicion: number;
  es_competidor_indicado: boolean;
  /** true si este negocio es la propia marca analizada (con cualquier variante del nombre) */
  es_marca: boolean;
}

/** Respuesta de un motor ya analizada frente a la marca */
export interface ResultadoMotor extends RespuestaMotor {
  marca_mencionada: boolean;
  posicion: number | null;
  menciones: number;
  sentimiento: 'positivo' | 'neutro' | 'negativo' | 'no_mencionado';
  dominio_en_fuentes: boolean;
  negocios: NegocioMencionado[];
  /** 1-2 frases: qué dice la respuesta y cómo queda la marca */
  resumen: string;
  score: number;
}

export interface ResultadoPregunta {
  pregunta: string;
  fecha: string;
  resultados: ResultadoMotor[];
}

/** Comprobaciones técnicas deterministas (sin IA) sobre la web del negocio */
export interface ChequeoTecnico {
  /** Rastreadores de IA bloqueados en robots.txt; null si no hay robots.txt legible */
  bots_bloqueados: string[] | null;
  llms_txt: boolean;
  /** Tipos de datos estructurados (schema.org) encontrados en la portada */
  schema_tipos: string[];
}

export interface Preparacion {
  dominio: string;
  marca: string;
  descripcion: string;
  /** Otros nombres con los que se conoce el negocio (nombre comercial, variantes) */
  alias: string[];
  web_legible: boolean;
  tecnico: ChequeoTecnico;
  preguntas: string[];
  /** Ángulo de cada pregunta, en el mismo orden: general, servicio, urgencia, precio, comparativa... */
  etiquetas: string[];
}

export interface Arreglo {
  titulo: string;
  detalle: string;
  prioridad: 'alta' | 'media' | 'baja';
}

export type TipoFuente = 'propia' | 'prensa' | 'competidor' | 'directorio' | 'otro';

export const TIPO_FUENTE_LABEL: Record<TipoFuente, string> = {
  prensa: 'Prensa y medios',
  propia: 'Tu web',
  competidor: 'Webs de competidores',
  directorio: 'Directorios y reseñas',
  otro: 'Otras fuentes',
};

export interface Resumen {
  diagnostico: string;
  arreglos: Arreglo[];
  /** Tipo de cada dominio citado, para agrupar las fuentes */
  tipos_fuente: Record<string, TipoFuente>;
}
