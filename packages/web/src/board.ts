import type { Piece } from './api.js';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
/** Ranks from 8 (top) to 1 (bottom), in render order. */
export const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

// Glifos preenchidos para as duas cores; a cor real vem do CSS (piece--white /
// piece--black), o que dá um contraste muito melhor que os glifos vazados.
const GLYPHS: Record<string, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
};

/** The 64 squares in render order: a8 (top-left) .. h1 (bottom-right). */
export function orderedSquares(): string[] {
  return RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}`));
}

/** Index pieces by the square they stand on. */
export function pieceMap(pieces: Piece[]): Map<string, Piece> {
  return new Map(pieces.map((piece) => [piece.square, piece]));
}

/** Unicode glyph (filled) for a piece; colour is applied via CSS. */
export function glyph(piece: Piece): string {
  return GLYPHS[piece.type] ?? '?';
}

/** Whether a square is light (used for the checkerboard colouring). */
export function isLightSquare(square: string): boolean {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  return (file + rank) % 2 === 0;
}

function fileIndex(square: string): number {
  return FILES.indexOf(square[0] as (typeof FILES)[number]);
}

function renderRow(square: string): number {
  return 8 - Number(square[1]); // rank 8 → row 0 (top)
}

/**
 * Offset, in board cells, from `to` back to `from`. Used to start a piece at
 * its origin and slide it to the destination: positive `dy` means the origin
 * is below the destination on screen.
 */
export function slideOffset(from: string, to: string): { dx: number; dy: number } {
  return { dx: fileIndex(from) - fileIndex(to), dy: renderRow(from) - renderRow(to) };
}

/**
 * Apply a simple move to the piece list locally, for an optimistic render
 * (show the player's move immediately, before the server responds). Moves the
 * piece from `from` to `to`, removing any piece captured on `to`. Special moves
 * (roque, en passant, promoção) are corrected by the authoritative server state.
 */
export function applyLocalMove(pieces: Piece[], from: string, to: string): Piece[] {
  return pieces
    .filter((piece) => piece.square !== to)
    .map((piece) => (piece.square === from ? { ...piece, square: to } : piece));
}
