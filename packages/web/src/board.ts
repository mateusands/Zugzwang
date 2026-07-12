import type { Piece, PieceColor } from './api.js';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
/** Ranks from 8 (top) to 1 (bottom), in render order. */
export const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

const GLYPHS: Record<PieceColor, Record<string, string>> = {
  white: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  black: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

/** The 64 squares in render order: a8 (top-left) .. h1 (bottom-right). */
export function orderedSquares(): string[] {
  return RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}`));
}

/** Index pieces by the square they stand on. */
export function pieceMap(pieces: Piece[]): Map<string, Piece> {
  return new Map(pieces.map((piece) => [piece.square, piece]));
}

/** Unicode glyph for a piece. */
export function glyph(piece: Piece): string {
  return GLYPHS[piece.color][piece.type] ?? '?';
}

/** Whether a square is light (used for the checkerboard colouring). */
export function isLightSquare(square: string): boolean {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  return (file + rank) % 2 === 0;
}
