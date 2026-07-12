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

/** Whether a legal target square is a capture (occupied by a piece). */
export function isCaptureTarget(square: string, pieces: Piece[]): boolean {
  return pieces.some((piece) => piece.square === square);
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
 * Apply a move to the piece list locally, for an optimistic render (show the
 * player's move immediately, before the server responds). Handles captures,
 * castling (also moves the rook) and en passant (removes the bypassed pawn).
 * Promotion keeps the pawn glyph until the authoritative server state lands.
 */
export function applyLocalMove(pieces: Piece[], from: string, to: string): Piece[] {
  const mover = pieces.find((piece) => piece.square === from);
  let result = pieces
    .filter((piece) => piece.square !== to)
    .map((piece) => (piece.square === from ? { ...piece, square: to } : piece));

  // Roque: rei andando duas colunas leva a torre junto (h→f ou a→d).
  if (mover?.type === 'k' && Math.abs(fileIndex(to) - fileIndex(from)) === 2) {
    const rank = from[1];
    const kingside = fileIndex(to) > fileIndex(from);
    const rookFrom = `${kingside ? 'h' : 'a'}${rank}`;
    const rookTo = `${kingside ? 'f' : 'd'}${rank}`;
    result = result.map((piece) =>
      piece.square === rookFrom ? { ...piece, square: rookTo } : piece,
    );
  }

  // En passant: peão em diagonal para casa vazia captura o peão ao lado.
  const wasEnPassant =
    mover?.type === 'p' && from[0] !== to[0] && !pieces.some((piece) => piece.square === to);
  if (wasEnPassant) {
    result = result.filter((piece) => piece.square !== `${to[0]}${from[1]}`);
  }

  return result;
}
