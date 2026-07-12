import { Chess } from 'chess.js';

/**
 * Isolation layer over `chess.js`.
 *
 * The rest of Zugzwang depends only on the types and the `ChessEngine` class
 * declared here — never on `chess.js` directly. This keeps the underlying rules
 * library swappable without touching server or bot code.
 */

export type PlayerColor = 'white' | 'black';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export type GameStatus = 'in_progress' | 'check' | 'checkmate' | 'stalemate' | 'draw';

/** A move expressed in coordinate form, e.g. `{ from: 'e2', to: 'e4' }`. */
export interface MoveInput {
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

/** The outcome of a successfully applied move. */
export interface MoveResult {
  /** Origin square, e.g. `'e2'`. */
  from: string;
  /** Destination square, e.g. `'e4'`. */
  to: string;
  /** Standard Algebraic Notation, e.g. `'e4'` or `'Nf3'`. */
  san: string;
  /** Colour of the side that made the move. */
  color: PlayerColor;
  /** Board position after the move, in Forsyth–Edwards Notation. */
  fen: string;
}

/** Thrown when an attempted move is not legal in the current position. */
export class IllegalMoveError extends Error {
  constructor(move: MoveInput | string) {
    const description = typeof move === 'string' ? move : `${move.from}-${move.to}`;
    super(`Illegal move: ${description}`);
    this.name = 'IllegalMoveError';
  }
}

function toPlayerColor(color: 'w' | 'b'): PlayerColor {
  return color === 'w' ? 'white' : 'black';
}

export class ChessEngine {
  readonly #chess: Chess;

  /**
   * @param fen Optional starting position (FEN). Defaults to the standard
   *   initial position.
   */
  constructor(fen?: string) {
    this.#chess = fen ? new Chess(fen) : new Chess();
  }

  /** Current position in Forsyth–Edwards Notation. */
  get fen(): string {
    return this.#chess.fen();
  }

  /** Colour whose turn it is to move. */
  get turn(): PlayerColor {
    return toPlayerColor(this.#chess.turn());
  }

  /** High-level status of the game. */
  get status(): GameStatus {
    if (this.#chess.isCheckmate()) return 'checkmate';
    if (this.#chess.isStalemate()) return 'stalemate';
    if (this.#chess.isDraw()) return 'draw';
    if (this.#chess.isCheck()) return 'check';
    return 'in_progress';
  }

  /** Whether the game has ended (checkmate, stalemate or any draw). */
  isGameOver(): boolean {
    return this.#chess.isGameOver();
  }

  /** Whether the side to move is currently in check. */
  isCheck(): boolean {
    return this.#chess.isCheck();
  }

  /** Legal moves in the current position, in Standard Algebraic Notation. */
  legalMoves(): string[] {
    return this.#chess.moves();
  }

  /**
   * Apply a move to the board.
   *
   * @param move Either SAN (e.g. `'e4'`) or coordinate form
   *   (e.g. `{ from: 'e2', to: 'e4' }`).
   * @throws {IllegalMoveError} If the move is not legal in the current position.
   */
  move(move: MoveInput | string): MoveResult {
    try {
      const result = this.#chess.move(move);
      return {
        from: result.from,
        to: result.to,
        san: result.san,
        color: toPlayerColor(result.color),
        fen: this.#chess.fen(),
      };
    } catch {
      // chess.js throws a generic Error on illegal moves; normalise it.
      throw new IllegalMoveError(move);
    }
  }

  /** Moves played so far, in Standard Algebraic Notation. */
  history(): string[] {
    return this.#chess.history();
  }

  /** Reset the board to the standard initial position. */
  reset(): void {
    this.#chess.reset();
  }
}
