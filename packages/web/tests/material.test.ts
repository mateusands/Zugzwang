import { describe, expect, it } from 'vitest';
import { capturedPieces } from '../src/material.js';
import type { Piece } from '../src/api.js';

const BACK_RANK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

/** Gera as 32 peças da posição inicial. */
function initialPieces(): Piece[] {
  const pieces: Piece[] = [];
  for (let file = 0; file < 8; file++) {
    const f = String.fromCharCode(97 + file);
    pieces.push({ square: `${f}1`, type: BACK_RANK[file] as string, color: 'white' });
    pieces.push({ square: `${f}2`, type: 'p', color: 'white' });
    pieces.push({ square: `${f}7`, type: 'p', color: 'black' });
    pieces.push({ square: `${f}8`, type: BACK_RANK[file] as string, color: 'black' });
  }
  return pieces;
}

describe('capturedPieces', () => {
  it('na posição inicial, ninguém capturou nada', () => {
    const result = capturedPieces(initialPieces());

    expect(result.byWhite).toEqual([]);
    expect(result.byBlack).toEqual([]);
    expect(result.advantage).toBe(0);
  });

  it('lista as peças capturadas por cada lado e a vantagem material', () => {
    // Brancas comeram a dama preta; pretas comeram um peão branco.
    const pieces = initialPieces().filter(
      (piece) => piece.square !== 'd8' && piece.square !== 'e2',
    );

    const result = capturedPieces(pieces);

    expect(result.byWhite).toEqual(['q']); // dama preta capturada pelas brancas
    expect(result.byBlack).toEqual(['p']); // peão branco capturado pelas pretas
    expect(result.advantage).toBe(8); // +9 (dama) −1 (peão)
  });

  it('após promoção, a vantagem reflete a dama nova (não um peão "capturado")', () => {
    // Dado que o peão branco de a2 virou dama (em a5), sem capturas na partida
    const pieces = initialPieces()
      .filter((piece) => piece.square !== 'a2')
      .concat({ square: 'a5', type: 'q', color: 'white' });

    const result = capturedPieces(pieces);

    // Então as brancas estão +8 (dama nova +9, peão a menos −1)
    expect(result.advantage).toBe(8);
  });
});
