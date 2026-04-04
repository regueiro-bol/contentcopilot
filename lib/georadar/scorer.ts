import type { AnalisisPresencia } from './types';

export function calculateScore(analisis: AnalisisPresencia): number {
  if (!analisis.marca_mencionada) return 0;

  let score = 40;

  if (analisis.posicion_primera_mencion !== null) {
    const posScore = Math.max(0, 25 - (analisis.posicion_primera_mencion - 1) * 5);
    score += posScore;
  }

  const freqScore = Math.min(15, analisis.numero_menciones * 3);
  score += freqScore;

  const sentimientoScore: Record<string, number> = {
    positivo: 20,
    neutro: 10,
    negativo: 0,
    no_mencionado: 0,
  };
  score += sentimientoScore[analisis.sentimiento] || 0;

  return Math.min(100, Math.round(score));
}

export function calculateGlobalScore(resultados: Array<{ score: number }>): number {
  if (resultados.length === 0) return 0;
  const suma = resultados.reduce((acc, r) => acc + r.score, 0);
  return Math.round(suma / resultados.length);
}
