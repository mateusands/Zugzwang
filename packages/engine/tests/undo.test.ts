import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';

/**
 * Fase 5 — Desfazer lance (undo).
 */

describe('ChessEngine — desfazer lance', () => {
  it('desfaz o último lance, restaurando a posição e a vez', () => {
    // Dado a posição inicial após 1.e4
    const engine = new ChessEngine();
    const initial = engine.fen;
    engine.move('e4');

    // Quando o lance é desfeito
    const undone = engine.undo();

    // Então volta tudo ao estado anterior
    expect(undone).toBe('e4');
    expect(engine.fen).toBe(initial);
    expect(engine.turn).toBe('white');
    expect(engine.history()).toEqual([]);
  });

  it('desfaz apenas um lance por vez', () => {
    const engine = new ChessEngine();
    engine.move('e4');
    engine.move('e5');

    expect(engine.undo()).toBe('e5');
    expect(engine.turn).toBe('black');
    expect(engine.history()).toEqual(['e4']);
  });

  it('retorna null quando não há lance para desfazer', () => {
    const engine = new ChessEngine();

    expect(engine.undo()).toBeNull();
  });
});
