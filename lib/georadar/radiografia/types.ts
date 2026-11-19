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
}

/** Respuesta de un motor ya analizada frente a la marca */
export interface ResultadoMotor extends RespuestaMotor {
  marca_mencionada: boolean;
  posicion: number | null;
  menciones: number;
  sentimiento: 'positivo' | 'neutro' | 'negativo' | 'no_mencionado';
  dominio_en_fuentes: boolean;
  negocios: NegocioMencionado[];
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
  web_legible: boolean;
  tecnico: ChequeoTecnico;
  preguntas: string[];
}

export interface Arreglo {
  titulo: string;
  detalle: string;
  prioridad: 'alta' | 'media' | 'baja';
}

export interface Resumen {
  diagnostico: string;
  arreglos: Arreglo[];
}
