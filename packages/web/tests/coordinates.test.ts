import { describe, expect, it } from 'vitest';
import { squareCoordinates } from '../src/board.js';

/**
 * Spec: o tabuleiro passa a mostrar as coordenadas nas próprias casas da
 * borda, como no chess.com — o número do lance na coluna `a` e a letra da
 * coluna na fileira 1. Só as casas de borda recebem rótulo, para não poluir.
 *
 * É cálculo puro sobre o nome da casa; o componente só posiciona.
 */
describe('squareCoordinates', () => {
  it('deve marcar a fileira no canto superior esquerdo da coluna a', () => {
    expect(squareCoordinates('a8')).toEqual({ rank: '8', file: null });
    expect(squareCoordinates('a1')).toEqual({ rank: '1', file: 'a' });
  });

  it('deve marcar a coluna no canto inferior direito da fileira 1', () => {
    expect(squareCoordinates('e1')).toEqual({ rank: null, file: 'e' });
    expect(squareCoordinates('h1')).toEqual({ rank: null, file: 'h' });
  });

  it('não deve rotular casas do miolo', () => {
    expect(squareCoordinates('d4')).toEqual({ rank: null, file: null });
    expect(squareCoordinates('h8')).toEqual({ rank: null, file: null });
  });
});
