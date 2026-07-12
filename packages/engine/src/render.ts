import type { ChessEngine, PieceType, PlayerColor } from './engine.js';

/** Unicode chess glyphs for each colour and piece type. */
const SYMBOLS: Record<PlayerColor, Record<PieceType, string>> = {
  white: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  black: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const EMPTY_SQUARE = '·';

/**
 * Render the current position as a plain-text board, ranks 8 (top) down to 1,
 * with file labels underneath. Used by the terminal CLI to play the bot.
 */
export function renderBoard(engine: ChessEngine): string {
  const glyphs = new Map<string, string>();
  for (const piece of engine.pieces()) {
    glyphs.set(piece.square, SYMBOLS[piece.color][piece.type]);
  }

  const lines: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    const cells = FILES.map((file) => glyphs.get(`${file}${rank}`) ?? EMPTY_SQUARE);
    lines.push(`${rank} ${cells.join(' ')}`);
  }
  lines.push(`  ${FILES.join(' ')}`);
  return lines.join('\n');
}
