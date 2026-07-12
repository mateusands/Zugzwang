import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';
import { chooseMove, difficultyDepth } from '../src/bot.js';

/**
 * Fase 5 — Níveis de dificuldade, mapeados para a profundidade da busca.
 */

describe('bot — níveis de dificuldade', () => {
  it('aumenta a profundidade conforme a dificuldade', () => {
    expect(difficultyDepth('easy')).toBeLessThan(difficultyDepth('medium'));
    expect(difficultyDepth('medium')).toBeLessThan(difficultyDepth('hard'));
  });

  it('escolhe um lance de acordo com a dificuldade (acha o mate no difícil)', () => {
    const engine = new ChessEngine('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1');

    expect(chooseMove(engine, 'hard')?.san).toBe('Re8#');
  });

  it('retorna null em posição terminal', () => {
    const engine = new ChessEngine('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');

    expect(chooseMove(engine, 'medium')).toBeNull();
  });
});
