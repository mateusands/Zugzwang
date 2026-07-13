import type { Piece, PieceColor } from './api.js';

// Transcodificação do 1º campo do FEN (colocação das peças) para a lista que
// o tabuleiro renderiza. Sem regra de xadrez: o engine continua sendo a única
// fonte de verdade sobre legalidade — aqui só se lê um formato de texto.

const FILES = 'abcdefgh';
const PIECE_TYPES = new Set(['p', 'n', 'b', 'r', 'q', 'k']);

/**
 * Convert the piece-placement field of a FEN into the board's piece list.
 * Malformed input (wrong rank count, invalid characters, overlong ranks)
 * yields an empty list — this never throws.
 */
export function fenToPieces(fen: string): Piece[] {
  const placement = fen.split(' ')[0] ?? '';
  const ranks = placement.split('/');
  if (ranks.length !== 8) return [];

  const pieces: Piece[] = [];
  for (const [rankIndex, rank] of ranks.entries()) {
    const rankNumber = 8 - rankIndex; // FEN lista da fileira 8 para a 1.
    let file = 0;
    for (const char of rank) {
      if (char >= '1' && char <= '8') {
        file += Number(char);
        continue;
      }
      const type = char.toLowerCase();
      if (!PIECE_TYPES.has(type) || file >= 8) return [];
      const color: PieceColor = char === char.toUpperCase() ? 'white' : 'black';
      pieces.push({ square: `${FILES[file]}${rankNumber}`, type, color });
      file += 1;
    }
    if (file !== 8) return [];
  }
  return pieces;
}
