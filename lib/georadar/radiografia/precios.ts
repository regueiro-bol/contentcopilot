/**
 * Radiografía Express — tarifas para estimar el coste de cada informe.
 *
 * Son las tarifas públicas de cada proveedor consultadas el 19/11/2026, en USD.
 * El coste que muestra la herramienta es una ESTIMACIÓN: la factura real puede
 * variar (redondeos, descuentos, cambios de tarifa). Si un proveedor cambia de
 * precio o se cambia de modelo, se actualiza aquí.
 */

/** USD por millón de tokens de entrada / salida */
const TOKENS: Record<string, { entrada: number; salida: number }> = {
  'gpt-5-search-api': { entrada: 1.25, salida: 10 },
  'sonar-pro': { entrada: 3, salida: 15 },
  sonar: { entrada: 1, salida: 1 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10 },
  'claude-sonnet-4-5': { entrada: 3, salida: 15 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5 },
  'gemini-3.8-flash': { entrada: 0.75, salida: 3.75 },
  'gemini-2.5-flash': { entrada: 0.3, salida: 2.5 },
};

/** Tarifa por defecto si el modelo no está en la tabla (se toma una cara, para no quedarse corto) */
const POR_DEFECTO = { entrada: 3, salida: 15 };

/** Cargos fijos por llamada o por búsqueda, en USD */
export const CARGOS = {
  /** OpenAI: búsqueda web incluida en cada llamada al modelo de búsqueda */
  openai_busqueda: 0.01,
  /** Perplexity Sonar Pro: tarifa por petición con contexto de búsqueda por defecto */
  perplexity_peticion: 0.006,
  /** Claude: cada búsqueda web */
  claude_busqueda: 0.01,
  /**
   * Gemini: búsquedas con Google. Las primeras 5.000 al mes son gratis y luego
   * cuestan 0,014 USD cada una. Por defecto se cuenta 0; para contarlas,
   * definir RADIOGRAFIA_GEMINI_BUSQUEDA_USD=0.014.
   */
  gemini_busqueda: Number(process.env.RADIOGRAFIA_GEMINI_BUSQUEDA_USD) || 0,
  /** DataForSEO, por si la respuesta no trae el coste real */
  google_modo_ia: 0.004,
  google_aio: 0.004,
};

export function costeTokens(modelo: string, entrada: number, salida: number): number {
  const t = TOKENS[modelo] || POR_DEFECTO;
  return (entrada * t.entrada + salida * t.salida) / 1_000_000;
}

/** Redondeo a 6 decimales para no arrastrar ruido de coma flotante */
export function redondear(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}
