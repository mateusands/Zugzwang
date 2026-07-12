import {
  ChessEngine,
  type MoveResult,
  type PieceType,
  type PlacedPiece,
  type PlayerColor,
} from './engine.js';

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

const CENTER_SQUARES = new Set(['d4', 'e4', 'd5', 'e5']);
const CENTER_OCCUPATION_BONUS = 20;
const DOUBLED_PAWN_PENALTY = 20;
const ISOLATED_PAWN_PENALTY = 15;
const KING_SHIELD_BONUS = 12;

function fileOf(square: string): number {
  return square.charCodeAt(0) - 'a'.charCodeAt(0);
}

function rankOf(square: string): number {
  return Number(square[1]);
}

/**
 * Positional bonus for `color`, beyond material and piece-square tables:
 * center occupation, pawn structure (doubled/isolated) and king safety
 * (pawn shield). Symmetric by construction, so it cancels out in a mirrored
 * position.
 */
function positionalBonus(pieces: PlacedPiece[], color: PlayerColor): number {
  const own = pieces.filter((piece) => piece.color === color);
  let bonus = 0;

  // Center occupation.
  for (const piece of own) {
    if (CENTER_SQUARES.has(piece.square)) bonus += CENTER_OCCUPATION_BONUS;
  }

  // Pawn structure: doubled and isolated pawns, counted per file.
  const pawnsPerFile = new Map<number, number>();
  for (const piece of own) {
    if (piece.type === 'p') {
      const file = fileOf(piece.square);
      pawnsPerFile.set(file, (pawnsPerFile.get(file) ?? 0) + 1);
    }
  }
  for (const [file, count] of pawnsPerFile) {
    if (count > 1) bonus -= DOUBLED_PAWN_PENALTY * (count - 1);
    const hasNeighbour = pawnsPerFile.has(file - 1) || pawnsPerFile.has(file + 1);
    if (!hasNeighbour) bonus -= ISOLATED_PAWN_PENALTY * count;
  }

  // King safety: friendly pawns on the squares immediately around the king.
  const king = own.find((piece) => piece.type === 'k');
  if (king) {
    const ownPawns = new Set(own.filter((p) => p.type === 'p').map((p) => p.square));
    const kingFile = fileOf(king.square);
    const kingRank = rankOf(king.square);
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue;
        const file = kingFile + df;
        const rank = kingRank + dr;
        if (file < 0 || file > 7 || rank < 1 || rank > 8) continue;
        const square = String.fromCharCode('a'.charCodeAt(0) + file) + rank;
        if (ownPawns.has(square)) bonus += KING_SHIELD_BONUS;
      }
    }
  }

  return bonus;
}

/**
 * Static evaluation of the position, in centipawns, from White's point of
 * view: positive favours White, negative favours Black. Combines material,
 * piece-square tables and positional terms (center, pawn structure, king
 * safety). Does not look ahead — terminal positions (checkmate/draw) are
 * handled by the search.
 */
export function evaluate(engine: ChessEngine): number {
  const pieces = engine.pieces();
  let score = 0;

  for (const piece of pieces) {
    const table = PIECE_SQUARE_TABLES[piece.type];
    const positional = table[tableIndex(piece.square, piece.color)] ?? 0;
    const value = PIECE_VALUES[piece.type] + positional;
    score += piece.color === 'white' ? value : -value;
  }

  score += positionalBonus(pieces, 'white');
  score -= positionalBonus(pieces, 'black');
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
