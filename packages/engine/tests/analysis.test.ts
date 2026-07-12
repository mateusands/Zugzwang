import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';
import { analyzeGame, evaluate, evaluatePosition } from '../src/bot.js';

/**
 * Fase 5 — Valor de posição com busca e análise pós-jogo (detecção de erros).
 */

describe('evaluatePosition', () => {
  it('em profundidade 0 coincide com a avaliação estática', () => {
    const engine = new ChessEngine('4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1');

    expect(evaluatePosition(engine, 0)).toBe(evaluate(engine));
  });

  it('enxerga o ganho material à frente (captura a dama pendurada)', () => {
    // Estaticamente as brancas estão pior (só cavalo contra dama), mas o cavalo
    // ganha a dama no lance seguinte.
    const engine = new ChessEngine('4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1');

    expect(evaluatePosition(engine, 2)).toBeGreaterThan(evaluate(engine));
  });
});

describe('analyzeGame', () => {
  it('produz uma análise por lance jogado', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6';

    const analysis = analyzeGame(pgn);

    expect(analysis).toHaveLength(4);
    expect(analysis.map((entry) => entry.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('aponta um blunder ao pendurar a dama', () => {
    // 2...Qh4?? pendura a dama para 3.Nxh4.
    const pgn = '1. e4 e5 2. Nf3 Qh4 3. Nxh4';

    const analysis = analyzeGame(pgn);
    const blunder = analysis.find((entry) => entry.san === 'Qh4');

    expect(blunder?.color).toBe('black');
    expect(blunder?.isBlunder).toBe(true);
    expect(blunder?.loss).toBeGreaterThan(200);
    // Um lance normal não é marcado como erro grave.
    expect(analysis.find((entry) => entry.san === 'e4')?.isBlunder).toBe(false);
  });
});
