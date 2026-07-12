import { describe, expect, it } from 'vitest';
import {
  applyLocalMove,
  glyph,
  isCaptureTarget,
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

  it('distingue casa de captura (ocupada) de casa vazia', () => {
    const pieces = [{ square: 'd5', type: 'p', color: 'black' as const }];

    // Destino ocupado por peça adversária → captura (anel).
    expect(isCaptureTarget('d5', pieces)).toBe(true);
    // Destino vazio → lance simples (bolinha).
    expect(isCaptureTarget('e4', pieces)).toBe(false);
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

  it('no roque, move também a torre (otimista)', () => {
    const pieces = [
      { square: 'e1', type: 'k', color: 'white' as const },
      { square: 'h1', type: 'r', color: 'white' as const },
      { square: 'a1', type: 'r', color: 'white' as const },
    ];

    // Roque pequeno: rei e1→g1, torre h1→f1.
    const kingside = applyLocalMove(pieces, 'e1', 'g1');
    expect(kingside).toContainEqual({ square: 'g1', type: 'k', color: 'white' });
    expect(kingside).toContainEqual({ square: 'f1', type: 'r', color: 'white' });

    // Roque grande: rei e1→c1, torre a1→d1.
    const queenside = applyLocalMove(pieces, 'e1', 'c1');
    expect(queenside).toContainEqual({ square: 'c1', type: 'k', color: 'white' });
    expect(queenside).toContainEqual({ square: 'd1', type: 'r', color: 'white' });
  });

  it('no en passant, remove o peão capturado ao lado (otimista)', () => {
    const pieces = [
      { square: 'e5', type: 'p', color: 'white' as const },
      { square: 'f5', type: 'p', color: 'black' as const },
    ];

    // e5 captura en passant em f6: o peão preto de f5 sai do tabuleiro.
    const after = applyLocalMove(pieces, 'e5', 'f6');
    expect(after).toEqual([{ square: 'f6', type: 'p', color: 'white' }]);
  });
});
