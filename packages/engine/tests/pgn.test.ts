import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';

/**
 * Fase 2 — Histórico de jogadas em notação algébrica (SAN) e PGN.
 */

describe('ChessEngine — histórico e PGN', () => {
  it('mantém o histórico de lances em notação algébrica (SAN), em ordem', () => {
    const engine = new ChessEngine();
    engine.move('e4');
    engine.move('e5');
    engine.move('Nf3');

    expect(engine.history()).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('exporta a partida em PGN contendo a sequência de lances', () => {
    const engine = new ChessEngine();
    engine.move('e4');
    engine.move('e5');
    engine.move('Nf3');

    expect(engine.pgn()).toContain('1. e4 e5 2. Nf3');
  });

  it('reconstrói a posição a partir de um PGN (round-trip)', () => {
    const original = new ChessEngine();
    original.move('e4');
    original.move('e5');
    original.move('Nf3');
    original.move('Nc6');

    // Quando outro engine carrega o PGN exportado
    const restored = new ChessEngine();
    restored.loadPgn(original.pgn());

    // Então a posição e o histórico são idênticos
    expect(restored.fen).toBe(original.fen);
    expect(restored.history()).toEqual(original.history());
  });
});
