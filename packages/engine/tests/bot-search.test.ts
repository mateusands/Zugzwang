import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';
import { findBestMove } from '../src/bot.js';

/**
 * Fase 3 — Busca minimax com poda alfa-beta em profundidade fixa. Cada cenário
 * usa uma posição-fixture com um melhor lance claramente correto.
 */

describe('bot — escolha do melhor lance (minimax + alfa-beta)', () => {
  it('encontra o xeque-mate em um lance com as brancas', () => {
    // Dado um mate de corredor em um lance para as brancas
    const engine = new ChessEngine('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1');

    // Quando o bot escolhe o lance
    const best = findBestMove(engine, 2);

    // Então joga a torre para e8, dando mate
    expect(best?.san).toBe('Re8#');
    expect(best?.checkmate).toBe(true);
  });

  it('encontra o xeque-mate em um lance com as pretas', () => {
    const engine = new ChessEngine('4r1k1/8/8/8/8/8/5PPP/6K1 b - - 0 1');

    const best = findBestMove(engine, 2);

    expect(best?.san).toBe('Re1#');
    expect(best?.checkmate).toBe(true);
  });

  it('captura material livre (a dama pendurada do adversário)', () => {
    // Dado que o cavalo branco ataca a dama preta indefesa em d5
    const engine = new ChessEngine('4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1');

    const best = findBestMove(engine, 2);

    expect(best?.san).toBe('Nxd5');
  });

  it('não retorna lance quando a posição já acabou (xeque-mate)', () => {
    // Dado o mate do bobo no tabuleiro (brancas sem lance legal)
    const engine = new ChessEngine('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');

    expect(findBestMove(engine, 2)).toBeNull();
  });

  it('não altera o engine recebido (explora apenas clones)', () => {
    // Dado uma posição qualquer
    const engine = new ChessEngine();
    const before = engine.fen;

    // Quando o bot calcula o melhor lance
    findBestMove(engine, 2);

    // Então o tabuleiro original permanece intacto
    expect(engine.fen).toBe(before);
  });

  it('rejeita profundidade menor que 1', () => {
    const engine = new ChessEngine();

    expect(() => findBestMove(engine, 0)).toThrow(RangeError);
  });
});
