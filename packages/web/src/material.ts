import type { Piece, PieceColor } from './api.js';

const INITIAL_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** Ordem de exibição das peças capturadas (peão → dama). */
const DISPLAY_ORDER = ['p', 'n', 'b', 'r', 'q'];

function countByType(pieces: Piece[], color: PieceColor): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const piece of pieces) {
    if (piece.color === color) counts[piece.type] = (counts[piece.type] ?? 0) + 1;
  }
  return counts;
}

/** Pieces of `color` missing from the board (i.e. captured by the other side). */
function missing(counts: Record<string, number>): string[] {
  const result: string[] = [];
  for (const type of DISPLAY_ORDER) {
    const taken = (INITIAL_COUNT[type] ?? 0) - (counts[type] ?? 0);
    for (let i = 0; i < taken; i++) result.push(type);
  }
  return result;
}

/** Material on the board for one side, in points. */
function boardMaterial(pieces: Piece[], color: PieceColor): number {
  return pieces.reduce(
    (sum, piece) => (piece.color === color ? sum + (VALUE[piece.type] ?? 0) : sum),
    0,
  );
}

/**
 * Captured pieces and material balance from the current board.
 *
 * As linhas de capturadas vêm do diff de contagem (após promoção a atribuição
 * é aproximada); a vantagem vem do material realmente presente no tabuleiro,
 * que permanece correta mesmo com promoções.
 *
 * @returns `byWhite` — black pieces White captured; `byBlack` — white pieces
 *   Black captured; `advantage` — material lead in points (positive = White).
 */
export function capturedPieces(pieces: Piece[]): {
  byWhite: string[];
  byBlack: string[];
  advantage: number;
} {
  const byWhite = missing(countByType(pieces, 'black'));
  const byBlack = missing(countByType(pieces, 'white'));
  const advantage = boardMaterial(pieces, 'white') - boardMaterial(pieces, 'black');
  return { byWhite, byBlack, advantage };
}
