import type { Score } from '@zugzwang/analysis';

// Rótulo da barra de avaliação. A conversão centipawns → probabilidade é a do
// lichess e vive em `@zugzwang/analysis` (`winPercent`), compartilhada com o
// server; aqui só a reexportamos para os componentes e cuidamos da formatação,
// que é assunto de UI.

export { winPercent } from '@zugzwang/analysis';

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
