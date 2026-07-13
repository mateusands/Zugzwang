import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';

/**
 * Fase 8 — Histórico de posições (FEN por ply).
 *
 * Contrato: fenHistory() devolve a posição inicial da partida seguida da
 * posição após cada lance, em ordem. Invariantes:
 * - fenHistory().length === history().length + 1
 * - o último item é sempre igual a engine.fen
 */

describe('ChessEngine — histórico de posições (fenHistory)', () => {
  it('devolve apenas a posição inicial quando nenhum lance foi jogado', () => {
    // Dado um engine recém-criado
    const engine = new ChessEngine();

    // Quando consulto o histórico de posições
    // Então recebo exatamente a posição inicial
    expect(engine.fenHistory()).toEqual([engine.fen]);
  });

  it('devolve a posição inicial e a posição após cada lance, em ordem', () => {
    // Dado uma partida com dois lances
    const engine = new ChessEngine();
    const initial = engine.fen;
    engine.move('e4');
    const afterE4 = engine.fen;
    engine.move('e5');

    // Quando consulto o histórico de posições
    const fens = engine.fenHistory();

    // Então recebo três posições: inicial, após e4 e após e5
    expect(fens).toEqual([initial, afterE4, engine.fen]);
  });

  it('encolhe junto com o histórico quando um lance é desfeito', () => {
    // Dado uma partida com lances desfeitos
    const engine = new ChessEngine();
    engine.move('e4');
    engine.move('e5');
    engine.undo();

    // Quando consulto o histórico de posições
    const fens = engine.fenHistory();

    // Então o invariante length === history().length + 1 se mantém
    expect(fens).toHaveLength(engine.history().length + 1);
    expect(fens[fens.length - 1]).toBe(engine.fen);
  });

  it('devolve o FEN de origem quando a partida começa de posição customizada', () => {
    // Dado um engine criado a partir de um FEN de meio de jogo
    const custom = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const engine = new ChessEngine(custom);

    // Quando consulto o histórico sem jogar nada
    // Então recebo exatamente essa posição
    expect(engine.fenHistory()).toEqual([custom]);
  });

  it('reconstrói o histórico completo de uma partida carregada por PGN', () => {
    // Dado uma partida exportada em PGN
    const original = new ChessEngine();
    original.move('e4');
    original.move('e5');
    original.move('Nf3');

    const restored = new ChessEngine();
    restored.loadPgn(original.pgn());

    // Quando consulto o histórico de posições da partida restaurada
    const fens = restored.fenHistory();

    // Então ele é idêntico ao da partida original, começando da posição inicial
    expect(fens).toEqual(original.fenHistory());
    expect(fens[0]).toBe(new ChessEngine().fen);
    expect(fens).toHaveLength(restored.history().length + 1);
  });
});
