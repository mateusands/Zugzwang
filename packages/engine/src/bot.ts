import { ChessEngine, type MoveResult, type PieceType, type PlayerColor } from './engine.js';

/**
 * Bot do Zugzwang — avaliação estática e escolha de lance.
 *
 * Depende apenas da API pública do `ChessEngine`; não conhece o `chess.js`.
 */

/** Material value of each piece type, in centipawns. */
const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

/**
 * Piece-square tables (Michniewski's "simplified evaluation"), from White's
 * point of view. Each table has 64 entries indexed a8..h1 (rank 8 first).
 */
const PIECE_SQUARE_TABLES: Record<PieceType, readonly number[]> = {
  // prettier-ignore
  p: [
      0,   0,   0,   0,   0,   0,   0,   0,
     50,  50,  50,  50,  50,  50,  50,  50,
     10,  10,  20,  30,  30,  20,  10,  10,
      5,   5,  10,  25,  25,  10,   5,   5,
      0,   0,   0,  20,  20,   0,   0,   0,
      5,  -5, -10,   0,   0, -10,  -5,   5,
      5,  10,  10, -20, -20,  10,  10,   5,
      0,   0,   0,   0,   0,   0,   0,   0,
  ],
  // prettier-ignore
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20,   0,   0,   0,   0, -20, -40,
    -30,   0,  10,  15,  15,  10,   0, -30,
    -30,   5,  15,  20,  20,  15,   5, -30,
    -30,   0,  15,  20,  20,  15,   0, -30,
    -30,   5,  10,  15,  15,  10,   5, -30,
    -40, -20,   0,   5,   5,   0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  // prettier-ignore
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,  10,  10,   5,   0, -10,
    -10,   5,   5,  10,  10,   5,   5, -10,
    -10,   0,  10,  10,  10,  10,   0, -10,
    -10,  10,  10,  10,  10,  10,  10, -10,
    -10,   5,   0,   0,   0,   0,   5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  // prettier-ignore
  r: [
      0,   0,   0,   0,   0,   0,   0,   0,
      5,  10,  10,  10,  10,  10,  10,   5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
      0,   0,   0,   5,   5,   0,   0,   0,
  ],
  // prettier-ignore
  q: [
    -20, -10, -10,  -5,  -5, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,   5,   5,   5,   0, -10,
     -5,   0,   5,   5,   5,   5,   0,  -5,
      0,   0,   5,   5,   5,   5,   0,  -5,
    -10,   5,   5,   5,   5,   5,   0, -10,
    -10,   0,   5,   0,   0,   0,   0, -10,
    -20, -10, -10,  -5,  -5, -10, -10, -20,
  ],
  // prettier-ignore
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
     20,  20,   0,   0,   0,   0,  20,  20,
     20,  30,  10,   0,   0,  10,  30,  20,
  ],
};

/** Piece-square index for `square`, seen from `color`'s point of view. */
function tableIndex(square: string, color: PlayerColor): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  // White reads the table top-down (a8..h1); Black mirrors it vertically.
  return color === 'white' ? (8 - rank) * 8 + file : (rank - 1) * 8 + file;
}

/**
 * Static evaluation of the position, in centipawns, from White's point of
 * view: positive favours White, negative favours Black. Does not look ahead —
 * terminal positions (checkmate/draw) are handled by the search.
 */
export function evaluate(engine: ChessEngine): number {
  let score = 0;
  for (const piece of engine.pieces()) {
    const table = PIECE_SQUARE_TABLES[piece.type];
    const positional = table[tableIndex(piece.square, piece.color)] ?? 0;
    const value = PIECE_VALUES[piece.type] + positional;
    score += piece.color === 'white' ? value : -value;
  }
  return score;
}

/** Score assigned to checkmate — larger than any material imbalance. */
const MATE_SCORE = 1_000_000;

/**
 * Minimax score of the position, from White's point of view, searching
 * `depth` plies with alpha-beta pruning. White maximizes, Black minimizes.
 */
function search(engine: ChessEngine, depth: number, alpha: number, beta: number): number {
  if (engine.isCheckmate()) {
    // The side to move is mated. A faster mate (more depth left) scores higher.
    const mate = MATE_SCORE + depth;
    return engine.turn === 'white' ? -mate : mate;
  }
  if (engine.isGameOver()) return 0; // stalemate or any draw
  if (depth === 0) return evaluate(engine);

  const maximizing = engine.turn === 'white';
  let best = maximizing ? -Infinity : Infinity;

  for (const san of engine.legalMoves()) {
    const child = new ChessEngine(engine.fen);
    child.move(san);
    const score = search(child, depth - 1, alpha, beta);

    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (alpha >= beta) break; // opponent already has a better option elsewhere
  }

  return best;
}

/**
 * Choose the best move for the side to move, searching `depth` plies ahead.
 *
 * Does not mutate `engine` — every candidate is tried on a clone.
 *
 * @param depth Number of plies to search (>= 1).
 * @returns The chosen move, or `null` when the game is already over.
 * @throws {RangeError} If `depth` is smaller than 1.
 */
export function findBestMove(engine: ChessEngine, depth: number): MoveResult | null {
  if (depth < 1) throw new RangeError('depth must be at least 1');

  const maximizing = engine.turn === 'white';
  let bestMove: MoveResult | null = null;
  let bestScore = maximizing ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;

  for (const san of engine.legalMoves()) {
    const child = new ChessEngine(engine.fen);
    const move = child.move(san);
    const score = search(child, depth - 1, alpha, beta);

    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (maximizing) {
      alpha = Math.max(alpha, bestScore);
    } else {
      beta = Math.min(beta, bestScore);
    }
  }

  return bestMove;
}
