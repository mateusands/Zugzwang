import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';
import { evaluate } from '../src/bot.js';

/**
 * Fase 3 — Avaliação estática (material + piece-square tables), na perspectiva
 * das brancas: pontuação positiva favorece as brancas.
 */

/** Espelha um FEN verticalmente e troca as cores (para testar simetria). */
function mirrorFen(fen: string): string {
  const [placement, turn] = fen.split(' ');
  const flipped = placement
    .split('/')
    .reverse()
    .map((rank) =>
      rank.replace(/[a-zA-Z]/g, (ch) =>
        ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase(),
      ),
    )
    .join('/');
  return `${flipped} ${turn === 'w' ? 'b' : 'w'} - - 0 1`;
}

describe('bot — avaliação estática', () => {
  it('considera a posição inicial equilibrada (zero)', () => {
    expect(evaluate(new ChessEngine())).toBe(0);
  });

  it('reflete vantagem material das brancas (um peão a mais)', () => {
    // Dado que as pretas estão sem o peão de a7
    const engine = new ChessEngine('rnbqkbnr/1ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

    // Então a avaliação favorece as brancas em cerca de um peão
    expect(evaluate(engine)).toBeGreaterThan(90);
  });

  it('valoriza um cavalo no centro mais do que no canto', () => {
    const central = new ChessEngine('4k3/8/8/8/4N3/8/8/4K3 w - - 0 1');
    const corner = new ChessEngine('4k3/8/8/8/8/8/8/N3K3 w - - 0 1');

    expect(evaluate(central)).toBeGreaterThan(evaluate(corner));
  });

  it('é simétrica: espelhar as cores inverte o sinal', () => {
    const fen = '4k3/8/8/8/4N3/8/8/4K3 w - - 0 1';
    const original = new ChessEngine(fen);
    const mirrored = new ChessEngine(mirrorFen(fen));

    expect(evaluate(mirrored)).toBe(-evaluate(original));
  });
});
