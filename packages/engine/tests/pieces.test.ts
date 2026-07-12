import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';

/**
 * Fase 3 — Acessor de peças usado pela avaliação do bot. Expõe a colocação
 * atual sem vazar o chess.js.
 */

describe('ChessEngine — colocação das peças', () => {
  it('lista as 32 peças na posição inicial', () => {
    const engine = new ChessEngine();

    expect(engine.pieces()).toHaveLength(32);
  });

  it('identifica a peça, a cor e a casa de cada peça', () => {
    const engine = new ChessEngine();

    const pieces = engine.pieces();

    expect(pieces).toContainEqual({ square: 'a1', type: 'r', color: 'white' });
    expect(pieces).toContainEqual({ square: 'e8', type: 'k', color: 'black' });
  });

  it('reflete a posição após um lance', () => {
    // Dado a posição inicial, quando as brancas jogam 1.e4
    const engine = new ChessEngine();
    engine.move('e4');

    const pieces = engine.pieces();

    // Então há um peão branco em e4 e nenhuma peça em e2
    expect(pieces).toContainEqual({ square: 'e4', type: 'p', color: 'white' });
    expect(pieces.some((piece) => piece.square === 'e2')).toBe(false);
  });
});
