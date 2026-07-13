import type { Score } from './uci.js';

// Centipawns → probabilidade de vitória das brancas, e o rótulo da barra.
// A conversão é a do lichess (aberta e citável); mate é certeza (0/100).

/** Centipawns além disso não movem a barra de forma perceptível. */
const CP_CLAMP = 1000;
/** Constante da curva logística do lichess. */
const LICHESS_K = 0.00368208;

function clamp(value: number, limit: number): number {
  return Math.min(Math.max(value, -limit), limit);
}

/**
 * Win% das brancas (0..100).
 * Fórmula lichess: 50 + 50 * (2 / (1 + exp(-k * cp)) - 1), com cp em ±1000.
 * Mate resolve para 0 ou 100 conforme o vencedor.
 */
export function winPercent(score: Score): number {
  if (score.type === 'mate') {
    return score.winner === 'white' ? 100 : 0;
  }
  const cp = clamp(score.value, CP_CLAMP);
  return 50 + 50 * (2 / (1 + Math.exp(-LICHESS_K * cp)) - 1);
}

/**
 * Rótulo curto da barra, do ponto de vista das brancas:
 * cp 130 → '+1.3', cp -50 → '−0.5' (traço de menos tipográfico),
 * mate brancas em 5 → 'M5', mate pretas em 3 → '−M3'.
 */
export function formatScore(score: Score): string {
  if (score.type === 'mate') {
    return score.winner === 'white' ? `M${score.movesToMate}` : `−M${score.movesToMate}`;
  }
  const pawns = score.value / 100;
  const magnitude = Math.abs(pawns).toFixed(1);
  if (magnitude === '0.0') return '0.0'; // igualdade não leva sinal
  return pawns < 0 ? `−${magnitude}` : `+${magnitude}`;
}
