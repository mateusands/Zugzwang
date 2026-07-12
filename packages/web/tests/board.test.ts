import { describe, expect, it } from 'vitest';
import {
  applyLocalMove,
  glyph,
  isLightSquare,
  orderedSquares,
  pieceMap,
  slideOffset,
} from '../src/board.js';

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
    // Glifo preenchido para as duas cores (a cor real vem do CSS).
    expect(glyph({ square: 'e1', type: 'k', color: 'white' })).toBe('♚');
    expect(glyph({ square: 'd8', type: 'q', color: 'black' })).toBe('♛');
  });

  it('alterna a cor das casas (a1 é escura, h1 é clara)', () => {
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('h1')).toBe(true);
  });

  it('calcula o deslocamento do lance para a animação (origem → destino)', () => {
    // e2 → e4: mesma coluna, origem duas fileiras abaixo do destino.
    expect(slideOffset('e2', 'e4')).toEqual({ dx: 0, dy: 2 });
    // a1 → h1: mesma fileira, origem sete colunas à esquerda.
    expect(slideOffset('a1', 'h1')).toEqual({ dx: -7, dy: 0 });
  });

  it('aplica o lance localmente para o render otimista', () => {
    const pieces = [
      { square: 'e2', type: 'p', color: 'white' as const },
      { square: 'd3', type: 'p', color: 'black' as const },
    ];

    // Avanço simples: a peça troca de casa.
    expect(applyLocalMove(pieces, 'e2', 'e4')).toContainEqual({
      square: 'e4',
      type: 'p',
      color: 'white',
    });

    // Captura: a peça em d3 é removida e a de e2 assume a casa.
    const afterCapture = applyLocalMove(pieces, 'e2', 'd3');
    expect(afterCapture).toHaveLength(1);
    expect(afterCapture[0]).toEqual({ square: 'd3', type: 'p', color: 'white' });
  });
});
