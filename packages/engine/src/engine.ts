import { Chess, type Move, type Square } from 'chess.js';

/**
 * Isolation layer over `chess.js`.
 *
 * The rest of Zugzwang depends only on the types and the `ChessEngine` class
 * declared here — never on `chess.js` directly. This keeps the underlying rules
 * library swappable without touching server or bot code.
 */

export type PlayerColor = 'white' | 'black';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export type CastleSide = 'kingside' | 'queenside';

export type GameStatus = 'in_progress' | 'check' | 'checkmate' | 'stalemate' | 'draw';

/** A piece and the square it occupies. */
export interface PlacedPiece {
  /** Square the piece stands on, e.g. `'e4'`. */
  square: string;
  /** Type of the piece. */
  type: PieceType;
  /** Colour of the piece. */
  color: PlayerColor;
}

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
  /** Standard Algebraic Notation, e.g. `'e4'`, `'exd5'` or `'O-O'`. */
  san: string;
  /** Colour of the side that made the move. */
  color: PlayerColor;
  /** Type of the piece that moved. */
  piece: PieceType;
  /** Type of the captured piece, or `null` when the move is not a capture. */
  captured: PieceType | null;
  /** Piece a pawn was promoted to, or `null` when there is no promotion. */
  promotion: PromotionPiece | null;
  /** Whether the move captured a piece (including en passant). */
  isCapture: boolean;
  /** Whether the move was an en passant capture. */
  isEnPassant: boolean;
  /** Which side the move castled to, or `null` when it is not a castle. */
  castle: CastleSide | null;
  /** Whether the move leaves the opponent in check. */
  check: boolean;
  /** Whether the move checkmates the opponent. */
  checkmate: boolean;
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

  /** Whether the side to move is checkmated. */
  isCheckmate(): boolean {
    return this.#chess.isCheckmate();
  }

  /** Whether the side to move is stalemated (no legal move and not in check). */
  isStalemate(): boolean {
    return this.#chess.isStalemate();
  }

  /** Whether the position is a draw (stalemate, insufficient material, etc.). */
  isDraw(): boolean {
    return this.#chess.isDraw();
  }

  /** Whether there is insufficient material for either side to checkmate. */
  isInsufficientMaterial(): boolean {
    return this.#chess.isInsufficientMaterial();
  }

  /** Whether the current position has occurred three times (draw). */
  isThreefoldRepetition(): boolean {
    return this.#chess.isThreefoldRepetition();
  }

  /**
   * Winner of the game, or `null` when there is none (game still running, or
   * drawn). A game is only won by checkmate.
   */
  winner(): PlayerColor | null {
    if (!this.#chess.isCheckmate()) return null;
    // The side to move is the one that got checkmated, so the other side won.
    return this.turn === 'white' ? 'black' : 'white';
  }

  /** Legal moves in the current position, in Standard Algebraic Notation. */
  legalMoves(): string[] {
    return this.#chess.moves();
  }

  /** Legal moves for the piece on `square`, in Standard Algebraic Notation. */
  movesFrom(square: string): string[] {
    return this.#chess.moves({ square: square as Square });
  }

  /**
   * Legal destination squares grouped by origin square, for the side to move.
   * e.g. `{ e2: ['e3', 'e4'], b1: ['a3', 'c3'], ... }`. Useful for a clickable
   * board. Empty object when the game is over.
   */
  legalTargets(): Record<string, string[]> {
    const targets: Record<string, string[]> = {};
    for (const move of this.#chess.moves({ verbose: true })) {
      (targets[move.from] ??= []).push(move.to);
    }
    return targets;
  }

  /** Every piece currently on the board, with its square and colour. */
  pieces(): PlacedPiece[] {
    const placed: PlacedPiece[] = [];
    for (const row of this.#chess.board()) {
      for (const cell of row) {
        if (cell) {
          placed.push({ square: cell.square, type: cell.type, color: toPlayerColor(cell.color) });
        }
      }
    }
    return placed;
  }

  /**
   * Apply a move to the board.
   *
   * @param move Either SAN (e.g. `'e4'`, `'O-O'`) or coordinate form
   *   (e.g. `{ from: 'e2', to: 'e4' }`). Promotions in coordinate form must
   *   supply `promotion`.
   * @throws {IllegalMoveError} If the move is not legal in the current position.
   */
  move(move: MoveInput | string): MoveResult {
    try {
      const applied = this.#chess.move(move);
      return this.#toMoveResult(applied);
    } catch {
      // chess.js throws a generic Error on illegal moves; normalise it.
      throw new IllegalMoveError(move);
    }
  }

  /** Moves played so far, in Standard Algebraic Notation. */
  history(): string[] {
    return this.#chess.history();
  }

  /**
   * Positions of the game as FEN strings: the starting position followed by
   * the position after each move, in order.
   *
   * Invariant: `fenHistory().length === history().length + 1`, and the last
   * item always equals the current position.
   */
  fenHistory(): string[] {
    const moves = this.#chess.history({ verbose: true });
    const first = moves[0];
    if (!first) return [this.fen];
    return [first.before, ...moves.map((move) => move.after)];
  }

  /**
   * Undo the most recent move.
   *
   * @returns The undone move in Standard Algebraic Notation, or `null` when
   *   there is no move to undo.
   */
  undo(): string | null {
    return this.#chess.undo()?.san ?? null;
  }

  /** Export the game (with headers) in Portable Game Notation (PGN). */
  pgn(): string {
    return this.#chess.pgn();
  }

  /** Load a game from Portable Game Notation, replacing the current one. */
  loadPgn(pgn: string): void {
    this.#chess.loadPgn(pgn);
  }

  /** Reset the board to the standard initial position. */
  reset(): void {
    this.#chess.reset();
  }

  #toMoveResult(move: Move): MoveResult {
    const castle: CastleSide | null = move.isKingsideCastle()
      ? 'kingside'
      : move.isQueensideCastle()
        ? 'queenside'
        : null;

    return {
      from: move.from,
      to: move.to,
      san: move.san,
      color: toPlayerColor(move.color),
      piece: move.piece,
      captured: move.captured ?? null,
      // chess.js only ever promotes to q/r/b/n, so narrowing the symbol is safe.
      promotion: (move.promotion as PromotionPiece | undefined) ?? null,
      // Derive from the captured piece: chess.js `isCapture()` excludes en
      // passant (flag 'e'), but a pawn is still taken there.
      isCapture: move.captured !== undefined,
      isEnPassant: move.isEnPassant(),
      castle,
      check: this.#chess.isCheck(),
      checkmate: this.#chess.isCheckmate(),
      fen: this.#chess.fen(),
    };
  }
}
