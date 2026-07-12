import { describe, expect, it } from 'vitest';
import { arrowPolyline, squareCenter, toggleArrow, toggleHighlight } from '../src/annotations.js';

describe('anotações do tabuleiro', () => {
  it('liga e desliga o destaque de uma casa', () => {
    const once = toggleHighlight([], 'e4');
    expect(once).toEqual(['e4']);
    // Clicar de novo remove.
    expect(toggleHighlight(once, 'e4')).toEqual([]);
  });

  it('liga e desliga uma seta pelo par origem/destino', () => {
    const once = toggleArrow([], ['g1', 'g3', 'f3']);
    expect(once).toEqual([{ path: ['g1', 'g3', 'f3'] }]);
    // Mesma origem e destino (mesmo por outro caminho) remove; sentido contrário é outra seta.
    expect(toggleArrow(once, ['g1', 'f3'])).toEqual([]);
    expect(toggleArrow(once, ['f3', 'g1'])).toHaveLength(2);
  });

  it('posiciona o centro das casas num espaço 8x8 (a8 no topo)', () => {
    expect(squareCenter('a8')).toEqual({ x: 0.5, y: 0.5 });
    expect(squareCenter('h1')).toEqual({ x: 7.5, y: 7.5 });
  });

  it('a seta segue o caminho de casas percorrido pelo mouse', () => {
    // d1 → d4 → e4: sobe a coluna d e dobra para e4.
    expect(arrowPolyline(['d1', 'd2', 'd3', 'd4', 'e4'])).toEqual([
      { x: 3.5, y: 7.5 },
      { x: 3.5, y: 4.5 },
      { x: 4.5, y: 4.5 },
    ]);
  });

  it('caminho reto colapsa em dois pontos', () => {
    expect(arrowPolyline(['e2', 'e3', 'e4'])).toEqual([
      { x: 4.5, y: 6.5 },
      { x: 4.5, y: 4.5 },
    ]);
  });

  it('arrasto direto de cavalo (sem casas intermediárias) vira o L clássico', () => {
    // g1 → f3 sem passar por casas do meio: dobra na perna longa.
    expect(arrowPolyline(['g1', 'f3'])).toEqual([
      { x: 6.5, y: 7.5 },
      { x: 6.5, y: 5.5 },
      { x: 5.5, y: 5.5 },
    ]);
  });

  it('ignora repetições consecutivas de casa no caminho', () => {
    expect(arrowPolyline(['e2', 'e2', 'e4'])).toEqual([
      { x: 4.5, y: 6.5 },
      { x: 4.5, y: 4.5 },
    ]);
  });
});
