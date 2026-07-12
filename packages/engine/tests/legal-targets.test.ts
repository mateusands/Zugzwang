import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';

/**
 * Fase full-stack — casas de destino legais por casa de origem, usadas pelo
 * tabuleiro clicável do navegador para destacar os lances.
 */

describe('ChessEngine — casas de destino legais', () => {
  it('lista os destinos de cada peça do lado a jogar na posição inicial', () => {
    const engine = new ChessEngine();

    const targets = engine.legalTargets();

    // O peão de e2 pode ir a e3 ou e4; o cavalo de b1 a a3 ou c3.
    expect(targets['e2']).toEqual(expect.arrayContaining(['e3', 'e4']));
    expect(targets['b1']).toEqual(expect.arrayContaining(['a3', 'c3']));
    // Peças pretas não têm destinos (não é a vez delas).
    expect(targets['e7']).toBeUndefined();
  });

  it('inclui o roque como um destino do rei', () => {
    // Rei e torres nas casas iniciais, com direito a roque.
    const engine = new ChessEngine('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');

    const targets = engine.legalTargets();

    // O roque pequeno leva o rei de e1 a g1; o grande, a c1.
    expect(targets['e1']).toEqual(expect.arrayContaining(['g1', 'c1']));
  });

  it('não retorna destinos em posição terminal (xeque-mate)', () => {
    const engine = new ChessEngine('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');

    expect(engine.legalTargets()).toEqual({});
  });
});
