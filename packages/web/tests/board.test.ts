import { describe, expect, it } from 'vitest';
import { glyph, isLightSquare, orderedSquares, pieceMap } from '../src/board.js';

describe('helpers do tabuleiro', () => {
  it('ordena as 64 casas de a8 (topo) a h1 (base)', () => {
    const squares = orderedSquares();

    expect(squares).toHaveLength(64);
    expect(squares[0]).toBe('a8');
    expect(squares[63]).toBe('h1');
  });

  it('mapeia peças por casa e devolve o glifo certo', () => {
    const map = pieceMap([{ square: 'e1', type: 'k', color: 'white' }]);

    expect(map.get('e1')?.color).toBe('white');
    expect(glyph({ square: 'e1', type: 'k', color: 'white' })).toBe('♔');
    expect(glyph({ square: 'd8', type: 'q', color: 'black' })).toBe('♛');
  });

  it('alterna a cor das casas (a1 é escura, h1 é clara)', () => {
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('h1')).toBe(true);
  });
});
