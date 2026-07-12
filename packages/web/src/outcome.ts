import type { PieceColor } from './api.js';

export type ResultKind = 'win' | 'loss' | 'draw';

export interface Outcome {
  kind: ResultKind;
  title: string;
  reason: string;
}

/**
 * Resultado da partida do ponto de vista do jogador (brancas). Puro: mapeia o
 * status final (mais desistência) para título e motivo exibidos na tela de fim.
 */
export function gameOutcome(status: string, winner: PieceColor | null, resigned: boolean): Outcome {
  if (resigned) {
    return { kind: 'loss', title: 'Você desistiu', reason: 'por desistência' };
  }
  if (status === 'checkmate') {
    return winner === 'white'
      ? { kind: 'win', title: 'Você venceu!', reason: 'por xeque-mate' }
      : { kind: 'loss', title: 'Você perdeu', reason: 'por xeque-mate' };
  }
  if (status === 'stalemate') {
    return { kind: 'draw', title: 'Empate', reason: 'por afogamento' };
  }
  return { kind: 'draw', title: 'Empate', reason: 'sem material ou por repetição' };
}
